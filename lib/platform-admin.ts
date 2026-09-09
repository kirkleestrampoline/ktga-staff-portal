import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/security/account-access";

export async function requirePlatformAdmin(){
  const actor=await requireActiveAccount(await createClient());
  return actor?.profile.role === "admin" ? actor : null;
}
