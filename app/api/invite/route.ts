import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: me } = await userClient.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json();
  const { full_name, email, hourly_rate } = body;
  if (!email || !full_name) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not configured on the server" }, { status: 500 });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name }
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data.user) {
    await admin.from("profiles").update({
      full_name,
      email,
      role: "coach",
      hourly_rate: Number(hourly_rate || 0),
      invoice_prefix: full_name.split(" ").map((x:string)=>x[0]).join("").slice(0,3).toUpperCase()
    }).eq("id", data.user.id);
  }

  return NextResponse.json({ ok: true });
}
