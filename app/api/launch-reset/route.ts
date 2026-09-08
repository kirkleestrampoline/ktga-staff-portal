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
    .select("role,club_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role!=="admin" || !profile.club_id) {
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
    const targetClubId=profile.club_id;
    const{data:club}=await admin.from("clubs").select("id,name").eq("id",targetClubId).single();
    if(!club)throw new Error("The protected reset tenant could not be resolved");
    const{data:clubClasses}=await admin.from("classes").select("id").eq("club_id",targetClubId);
    const classIds=(clubClasses||[]).map(item=>item.id);
    if(classIds.length){const{error}=await admin.from("class_staffing_slots").delete().in("class_id",classIds);if(error&&!error.message.toLowerCase().includes("does not exist"))throw error;}
    const{data:clubProfiles}=await admin.from("profiles").select("id").eq("club_id",targetClubId);
    const clubProfileIds=(clubProfiles||[]).map(item=>item.id);
    if(clubProfileIds.length){const{error}=await admin.from("shift_templates").delete().in("profile_id",clubProfileIds);if(error&&!error.message.toLowerCase().includes("does not exist"))throw error;}
    const operationalTables = ["scheduled_shifts","classes","invoices","timesheets","shifts","expenses"];

    for (const table of operationalTables) {
      const { error } = await admin
        .from(table)
        .delete()
        .eq("club_id",targetClubId);

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
        .eq("club_id",targetClubId)
        .neq("id", user.id)
        .neq("role","admin");

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

      const removableIds=(profiles||[]).map(person=>person.id);
      if(removableIds.length){const{error:employmentError}=await admin.from("employment_records").delete().in("profile_id",removableIds).eq("club_id",targetClubId);if(employmentError)throw employmentError;}
      if(removableIds.length)await admin.from("staff_venues").delete().in("profile_id",removableIds);
      if(removableIds.length)await admin.from("profiles").delete().in("id",removableIds).eq("club_id",targetClubId);
    }

    return NextResponse.json({
      ok: true,
      removedStaff: body.remove_staff === true,
      clubId: targetClubId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "System reset failed";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
