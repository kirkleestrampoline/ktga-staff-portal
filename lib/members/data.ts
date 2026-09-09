import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveAccount } from "@/lib/security/account-access";
import { canReadMembers } from "./access";
export type FamilySummary={id:string;display_name:string;status:string};
export type AthleteSummary={id:string;family_id:string;display_name:string;status:string};
export async function loadMembers(client:SupabaseClient,query:string,view:"families"|"athletes",familyId:string|null){
  const account=await requireActiveAccount(client);
  if(!account)throw new Error("Your account or club is unavailable. Please sign in again.");
  const clubId=account.profile.club_id!;
  if(!canReadMembers(account.user.id,account.profile,account.club,clubId))return {restricted:true as const};
  // Literal contains search: supplied wildcard characters cannot broaden matching.
  const search=query.trim().slice(0,100).replace(/[\\%_*]/g,char=>char==='*'?'\\*':`\\${char}`);
  const table=view==="families"?"member_families":"member_athletes";
  let records=client.from(table).select(view==="families"?"id,display_name,status":"id,family_id,display_name,status",{count:"exact"}).eq("club_id",clubId);
  if(search)records=records.ilike("display_name",`%${search}%`);
  if(familyId)records=records.eq(view==="athletes"?"family_id":"id",familyId);
  const results=await Promise.all([
    client.from("member_families").select("id",{head:true,count:"exact"}).eq("club_id",clubId),
    client.from("member_athletes").select("id",{head:true,count:"exact"}).eq("club_id",clubId),
    records.order("display_name").order("id").limit(50)
  ]);
  if(results.some(result=>result.error))throw new Error("Members could not be loaded. Please try again or contact your club administrator.");
  return {restricted:false as const,familyCount:results[0].count||0,athleteCount:results[1].count||0,total:results[2].count||0,records:results[2].data as unknown as (FamilySummary|AthleteSummary)[]};
}
