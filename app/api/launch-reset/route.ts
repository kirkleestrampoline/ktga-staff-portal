import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !["admin","club_owner"].includes(profile.role)) {
    return NextResponse.json({ error: "Super Admin only" }, { status: 403 });
  }

  const body = await req.json();

  if (body.confirm !== "RESET MY DATA") {
    return NextResponse.json(
      { error: "Confirmation text does not match" },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    return NextResponse.json(
      { error: "Supabase server environment variables are missing" },
      { status: 500 }
    );
  }

  const admin = createAdminClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const operationalTables = [
      "scheduled_shifts",
      "class_staffing_slots",
      "classes",
      "shift_templates",
      "invoices",
      "timesheets",
      "shifts",
      "audit_log",
    ];

    for (const table of operationalTables) {
      const { error } = await admin
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (
        error &&
        !error.message.toLowerCase().includes("does not exist") &&
        !error.message.toLowerCase().includes("schema cache")
      ) {
        throw error;
      }
    }

    if (body.remove_staff === true) {
      const { data: profiles, error } = await admin
        .from("profiles")
        .select("id")
        .neq("id", user.id);

      if (error) throw error;

      for (const person of profiles ?? []) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(
          person.id
        );

        if (
          deleteError &&
          !deleteError.message.toLowerCase().includes("not found")
        ) {
          throw deleteError;
        }
      }

      await admin.from("staff_venues").delete().neq("profile_id", user.id);
      await admin.from("profiles").delete().neq("id", user.id);
    }

    return NextResponse.json({
      ok: true,
      removedStaff: body.remove_staff === true,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "System reset failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
