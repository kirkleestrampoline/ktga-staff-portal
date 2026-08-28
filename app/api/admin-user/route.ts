import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req:NextRequest){
  const client=await createClient();
  const{data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Not signed in"},{status:401});
  const{data:me}=await client.from("profiles").select("role").eq("id",user.id).single();
  if(me?.role!=="admin")return NextResponse.json({error:"Admin only"},{status:403});
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)return NextResponse.json({error:"SUPABASE_SECRET_KEY is not configured"},{status:500});
  const admin=createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const body=await req.json();
  if(body.action==="delete"){
    if(body.user_id===user.id)return NextResponse.json({error:"You cannot delete your own admin account"},{status:400});
    const{error}=await admin.auth.admin.deleteUser(body.user_id);
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
  }
  if(body.action==="setup_link"){
    const email=String(body.email||"").trim().toLowerCase();
    if(!email)return NextResponse.json({error:"Email required"},{status:400});
    const redirectTo=`${req.nextUrl.origin}/set-password?mode=recovery&email=${encodeURIComponent(email)}`;
    const{data,error}=await admin.auth.admin.generateLink({type:"recovery",email,options:{redirectTo}});
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true,link:data.properties?.action_link});
  }
  return NextResponse.json({error:"Unknown action"},{status:400});
}
