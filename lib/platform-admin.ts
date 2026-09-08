import { createClient } from "@/lib/supabase/server";

export async function requirePlatformAdmin(){
  const supabase=await createClient();
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)return null;
  const{data:profile}=await supabase.from("profiles").select("id,role,club_id,is_active").eq("id",user.id).maybeSingle();
  if(!profile||profile.role!=="admin"||!profile.is_active)return null;
  return{user,profile};
}
