import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req:NextRequest){
  const client=await createClient();
  const{data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Not signed in"},{status:401});
  const{data:me}=await client.from("profiles").select("role").eq("id",user.id).single();
  if(!me||!["admin","org_admin"].includes(me.role))return NextResponse.json({error:"Admin only"},{status:403});
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)return NextResponse.json({error:"SUPABASE_SECRET_KEY is not configured on the server"},{status:500});
  const body=await req.json();
  const full_name=String(body.full_name||"").trim(),email=String(body.email||"").trim().toLowerCase();
  let venue_ids:string[]=Array.isArray(body.venue_ids)?body.venue_ids:[];
  let role:string=body.role==="org_admin"?"org_admin":"coach";
  let admin_venue_ids:string[]=Array.isArray(body.admin_venue_ids)?body.admin_venue_ids:[];
  if(!full_name||!email)return NextResponse.json({error:"Name and email are required"},{status:400});
  if(me.role==="org_admin"){
    role="coach"; admin_venue_ids=[];
    const{data:managed}=await client.from("staff_venues").select("venue_id").eq("profile_id",user.id).eq("is_admin",true);
    const allowed=new Set((managed||[]).map((x:any)=>x.venue_id));
    venue_ids=venue_ids.filter(v=>allowed.has(v));
    if(!venue_ids.length)return NextResponse.json({error:"Choose an organisation you administer"},{status:400});
  }
  if(role==="org_admin"&&!admin_venue_ids.length)return NextResponse.json({error:"Choose at least one organisation for this organisation admin"},{status:400});
  const admin=createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const redirectTo=`${req.nextUrl.origin}/set-password?mode=invite&email=${encodeURIComponent(email)}`;
  const{data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{full_name}});
  if(error)return NextResponse.json({error:error.message},{status:400});
  if(data.user){
    await admin.from("profiles").update({full_name,email,role,hourly_rate:Number(body.hourly_rate||0),is_active:true,invoice_prefix:full_name.split(" ").map((x:string)=>x[0]).join("").slice(0,3).toUpperCase()||"INV"}).eq("id",data.user.id);
    if(venue_ids.length)await admin.from("staff_venues").upsert(venue_ids.map(venue_id=>({profile_id:data.user!.id,venue_id,is_admin:role==="org_admin"&&admin_venue_ids.includes(venue_id)})),{onConflict:"profile_id,venue_id"});
  }
  return NextResponse.json({ok:true});
}
