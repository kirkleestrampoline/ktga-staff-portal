import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req:NextRequest){
  const client=await createClient();
  const{data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Not signed in"},{status:401});
  const{data:me}=await client.from("profiles").select("role,club_id,is_active").eq("id",user.id).single();
  if(!me||!me.is_active||!["admin","club_owner","org_admin"].includes(me.role))return NextResponse.json({error:"Admin only"},{status:403});
  // Capture narrowed values before using them inside nested async functions.
  const currentUserId=user.id;
  const currentRole=me.role;
  const currentClubId=me.club_id;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)return NextResponse.json({error:"SUPABASE_SECRET_KEY is not configured"},{status:500});
  const admin=createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const body=await req.json();
  const targetId=String(body.user_id||"");
  async function canManageTarget(id:string){
    const{data:target}=await admin.from("profiles").select("club_id,role").eq("id",id).maybeSingle();
    if(!target||target.role==="admin")return false;
    if(currentRole==="admin")return true;
    if(currentRole==="club_owner")return target.club_id===currentClubId;
    const{data:mine}=await client.from("staff_venues").select("venue_id").eq("profile_id",currentUserId).eq("is_admin",true);
    const{data:theirs}=await client.from("staff_venues").select("venue_id").eq("profile_id",id);
    const allowed=new Set((mine||[]).map((x:any)=>x.venue_id));
    return (theirs||[]).some((x:any)=>allowed.has(x.venue_id));
  }
  if(body.action==="delete"){
    if(targetId===currentUserId)return NextResponse.json({error:"You cannot delete your own admin account"},{status:400});
    if(!await canManageTarget(targetId))return NextResponse.json({error:"No permission for this staff member"},{status:403});
    const{data:target}=await admin.from("profiles").select("role,club_id").eq("id",targetId).single();
    if(target?.role==="admin")return NextResponse.json({error:"The protected Platform Admin account cannot be deleted here"},{status:403});
    if(!["admin","club_owner"].includes(currentRole)&&target?.role!=="coach")return NextResponse.json({error:"Managers cannot delete other administrators"},{status:403});
    const{error}=await admin.auth.admin.deleteUser(targetId);
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Unknown action"},{status:400});
}
