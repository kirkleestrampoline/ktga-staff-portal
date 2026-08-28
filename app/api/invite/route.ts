import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: me } = await userClient.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { full_name, email, hourly_rate, venue_ids=[] } = await req.json();
  if (!email || !full_name) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });

  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not configured on the server" }, { status: 500 });

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {auth:{autoRefreshToken:false,persistSession:false}});
  const safeEmail=String(email).trim().toLowerCase();
  const redirectTo = `${req.nextUrl.origin}/set-password?mode=invite&email=${encodeURIComponent(safeEmail)}`;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(safeEmail, {redirectTo,data:{full_name}});
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (data.user) {
    await admin.from("profiles").update({
      full_name,email:safeEmail,role:"coach",hourly_rate:Number(hourly_rate||0),is_active:true,
      invoice_prefix: full_name.split(" ").map((x:string)=>x[0]).join("").slice(0,3).toUpperCase() || "INV"
    }).eq("id", data.user.id);
    if(Array.isArray(venue_ids)&&venue_ids.length){
      await admin.from("staff_venues").upsert(venue_ids.map((venue_id:string)=>({profile_id:data.user!.id,venue_id})),{onConflict:"profile_id,venue_id"});
    }
  }
  return NextResponse.json({ ok: true });
}
