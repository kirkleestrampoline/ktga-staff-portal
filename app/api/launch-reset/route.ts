import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req:NextRequest){
  const client=await createClient();
  const{data:{user}}=await client.auth.getUser();
  if(!user)return NextResponse.json({error:"Not signed in"},{status:401});

  const{data:me}=await client.from("profiles").select("role").eq("id",user.id).single();
  if(!me||me.role!=="admin")return NextResponse.json({error:"Super Admin only"},{status:403});

  const body=await req.json();
  if(body.confirm!=="RESET MY DATA")return NextResponse.json({error:"Confirmation text does not match"},{status:400});

  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!secret)return NextResponse.json({error:"SUPABASE_SECRET_KEY is not configured"},{status:500});

  const admin=createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{
    auth:{autoRefreshToken:false,persistSession:false}
  });

  // Delete operational data in dependency-safe order.
  // Ignore "table not found" errors for optional modules so the reset remains
  // compatible with installations that do not yet use every feature.
  async function clearTable(table:string){
    const{error}=await admin.from(table).delete().not("id","is",null);
    if(error && !/does not exist|not found|schema cache/i.test(error.message))throw error;
  }

  try{
    await clearTable("scheduled_shifts");
    await clearTable("class_staffing_slots");
    await clearTable("classes");
    await clearTable("shift_templates");
    await clearTable("invoices");
    await clearTable("timesheets");
    await clearTable("shifts");
    await clearTable("audit_log");

    if(Boolean(body.remove_staff)){
      const{data:profiles,error:profileError}=await admin.from("profiles").select("id").neq("id",user.id);
      if(profileError)throw profileError;

      for(const p of profiles||[]){
        const{error}=await admin.auth.admin.deleteUser(p.id);
        if(error && !/not found/i.test(error.message))throw error;
      }

      // Defensive cleanup in case a profile was not backed by an auth user.
      await admin.from("staff_venues").delete().neq("profile_id",user.id);
      await admin.from("profiles").delete().neq("id",user.id);
    }

    return NextResponse.json({
      ok:true,
      removed_staff:Boolean(body.remove_staff)
    });
  }catch(e:any){
    return NextResponse.json({error:e?.message||"Reset failed"},{status:500});
  }
}
