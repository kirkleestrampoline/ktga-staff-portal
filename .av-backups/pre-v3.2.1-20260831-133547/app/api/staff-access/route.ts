import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "org_admin"].includes(me.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const userId = user.id;
  const actorRole = me.role as "admin" | "org_admin";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return NextResponse.json({ error: "Supabase server configuration is missing" }, { status: 500 });

  const admin = createAdminClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = await req.json();

  async function allowedVenueIds() {
    if (actorRole === "admin") {
      const { data } = await admin.from("venues").select("id").eq("active", true);
      return (data || []).map((x: any) => x.id);
    }
    const { data } = await admin.from("staff_venues").select("venue_id").eq("profile_id", userId).eq("is_admin", true);
    return (data || []).map((x: any) => x.venue_id);
  }

  const allowed = await allowedVenueIds();

  if (body.action === "create_placeholder") {
    const fullName = String(body.full_name || "").trim();
    const venueIds: string[] = Array.isArray(body.venue_ids) ? body.venue_ids : [];
    const role = actorRole === "admin" && body.role === "org_admin" ? "org_admin" : "coach";
    if (!fullName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (venueIds.some(id => !allowed.includes(id))) return NextResponse.json({ error: "You cannot add staff to that organisation" }, { status: 403 });

    const internalEmail = `staff-${randomUUID()}@no-login.avgymnastics.invalid`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail,
      email_confirm: true,
      user_metadata: { full_name: fullName, placeholder_staff: true },
    });
    if (createError || !created.user) return NextResponse.json({ error: createError?.message || "Could not create staff record" }, { status: 400 });

    const id = created.user.id;
    const { error: profileError } = await admin.from("profiles").upsert({
      id,
      full_name: fullName,
      email: null,
      role,
      hourly_rate: Number(body.hourly_rate || 0),
      is_active: true,
    });
    if (profileError) {
      await admin.auth.admin.deleteUser(id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    if (venueIds.length) {
      const adminVenueIds: string[] = actorRole === "admin" && Array.isArray(body.admin_venue_ids) ? body.admin_venue_ids : [];
      const { error } = await admin.from("staff_venues").insert(venueIds.map(venue_id => ({
        profile_id: id,
        venue_id,
        is_admin: role === "org_admin" && adminVenueIds.includes(venue_id),
      })));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id });
  }

  if (body.action === "invite_existing") {
    const profileId = String(body.profile_id || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!profileId || !email) return NextResponse.json({ error: "Staff member and email are required" }, { status: 400 });

    const { data: links } = await admin.from("staff_venues").select("venue_id").eq("profile_id", profileId);
    if (actorRole !== "admin" && (links || []).some((x: any) => !allowed.includes(x.venue_id))) {
      return NextResponse.json({ error: "You do not manage this staff member" }, { status: 403 });
    }

    const { data: person } = await admin.from("profiles").select("full_name,email").eq("id", profileId).single();
    if (!person) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });
    if (person.email) return NextResponse.json({ error: "This staff member already has portal access" }, { status: 400 });

    const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
      email,
      email_confirm: true,
      user_metadata: { full_name: person.full_name, placeholder_staff: false },
    });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

    const { error: profileError } = await admin.from("profiles").update({ email }).eq("id", profileId);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 400 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://staff.avgymnastics.co.uk";
    const { error: emailError } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/set-password` });
    if (emailError) return NextResponse.json({ error: emailError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
