import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { requireActiveAccount, authoriseStaffTarget } from "@/lib/security/account-access";

export async function POST(req:NextRequest){
  const actor=await requireActiveAccount(await createClient());
  if(!actor)return NextResponse.json({error:"Active account and club required"},{status:403});
  const body=await req.json();
  if(body.action!=="delete")return NextResponse.json({error:"Unknown action"},{status:400});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret)return NextResponse.json({error:"Server configuration is missing"},{status:500});
  const admin=createAdminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const target=await authoriseStaffTarget(admin,actor,String(body.user_id||""));
  if(!target)return NextResponse.json({error:"You do not manage this staff member"},{status:403});
  const{error}=await admin.auth.admin.deleteUser(target.id);
  return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
}
