import { NextRequest,NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { UUID_RE } from "@/lib/security/account-policy";

// PostgreSQL diagnostics can include entire personal rows. Only retain known
// static messages and schema identifiers; never log arbitrary detail/hint text.
function safePromotionDiagnostic(value:string|null|undefined){
  if(!value)return value??null;
  const staticMessages=["Authentication required","Active Platform Admin required","Active target club required","Target profile unavailable","Target cannot be promoted","Target is inactive or its role changed","Target changed","Profile preservation check failed"];
  if(staticMessages.includes(value))return value;
  if(/^(?:column|relation|function|schema) "[a-z_][a-z0-9_.]*" does not exist$/i.test(value))return value;
  if(/^permission denied for (?:table|schema|function|sequence) [a-z_][a-z0-9_.]*$/i.test(value))return value;
  if(/^record "[a-z_][a-z0-9_]*" has no field "[a-z_][a-z0-9_]*"$/i.test(value))return value;
  return "[redacted: diagnostic may contain personal data]";
}

export async function GET(req:NextRequest){
  const actor=await requirePlatformAdmin();
  if(!actor)return NextResponse.json({error:"Active Platform Admin required"},{status:403});
  const clubId=req.nextUrl.searchParams.get("club_id");
  if(!clubId||!UUID_RE.test(clubId))return NextResponse.json({error:"Valid club required"},{status:400});
  const admin=createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:club,error}=await admin.from("clubs").select("id,name,active").eq("id",clubId).maybeSingle();
  if(error)return NextResponse.json({error:"Could not load club"},{status:500});
  if(!club)return NextResponse.json({error:"Club not found"},{status:404});
  const result=await admin.from("profiles").select("id,full_name,username,role").eq("club_id",clubId).eq("is_active",true).in("role",["coach","org_admin","club_owner"]).order("full_name");
  if(result.error)return NextResponse.json({error:"Could not load Club Owners"},{status:500});
  return NextResponse.json({club,owners:result.data.filter(p=>p.role==="club_owner"),candidates:club.active?result.data.filter(p=>p.role!=="club_owner"):[]},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req:NextRequest){
  const actor=await requirePlatformAdmin();
  if(!actor)return NextResponse.json({error:"Active Platform Admin required"},{status:403});
  let body;
  try{body=await req.json()}catch{return NextResponse.json({error:"Invalid request"},{status:400})}
  if(!body||typeof body!=="object"||Object.keys(body).some(key=>!["club_id","profile_id","expected_role","confirmed"].includes(key))||body.confirmed!==true||
    typeof body.club_id!=="string"||!UUID_RE.test(body.club_id)||typeof body.profile_id!=="string"||!UUID_RE.test(body.profile_id)||!["coach","org_admin"].includes(body.expected_role)){
    return NextResponse.json({error:"Select an eligible profile and explicitly confirm promotion"},{status:400});
  }
  // Cookie-authenticated RPC: actor identity is obtained by PostgreSQL from auth.uid().
  const client=await createClient();
  const {error}=await client.rpc("platform_promote_club_owner",{p_club_id:body.club_id,p_profile_id:body.profile_id,p_expected_role:body.expected_role});
  if(error){
    const debug={
      code:/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(error.code||"")?error.code:"[redacted]",
      message:safePromotionDiagnostic(error.message),
      details:safePromotionDiagnostic(error.details),
      hint:safePromotionDiagnostic(error.hint),
    };
    console.error("[platform-owner-promotion] RPC failed",debug);
    return NextResponse.json({error:error.code==="42501"?"Promotion is not authorised":error.code==="P0001"?"The club or profile changed. Reload Club Owners before trying again.":"Promotion could not be completed. No promotion was committed."},{status:error.code==="42501"?403:error.code==="P0001"?409:500});
  }
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
