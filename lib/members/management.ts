import type { SupabaseClient } from '@supabase/supabase-js';
import { requireActiveAccount } from '@/lib/security/account-access';
import { canReadMembers } from './access';
import type { MemberResult } from './model';
import { lookupDiagnostic } from '@/lib/security/lookup-diagnostic';
export type MemberCommand={action:'create_family'|'save_family'|'save_contact'|'save_athlete'|'set_status';familyId?:string;recordId?:string;updatedAt?:string;data:unknown};
export type WriteResult={family_id?:string;requires_confirmation:boolean;warnings?:string[]};
async function allowed(client:SupabaseClient){
 const account=await requireActiveAccount(client);
 if(!account)throw new Error('Your account or club is unavailable. Please sign in again.');
 return canReadMembers(account.user.id,account.profile,account.club,account.profile.club_id!);
}
export async function readMemberDirectory(client:SupabaseClient,search='',offset=0,familyId:string|null=null,filters?:{state:string;journey:string;view?:'families'|'athletes'}):Promise<MemberResult|null>{
 if(!await allowed(client))return null;
 const {data,error,status}=await client.rpc(filters?'member_directory_filtered':'member_directory',{p_search:search.trim().slice(0,100),p_offset:offset,p_family_id:familyId,...(filters?{p_state:filters.state,p_journey:filters.journey,p_view:filters.view||'families'}:{})});
 if(error){
  console.error('[members] directory failed',lookupDiagnostic(filters?'member_directory_filtered':'member_directory',error,status));
  throw new Error(error.code==='PGRST202'
   ?'Members setup is incomplete. Ask your administrator to check the Members migration and schema cache.'
   :'Members could not be loaded. Please try again.');
 }
 return data as MemberResult;
}
export async function manageMember(client:SupabaseClient,command:MemberCommand,acknowledged=false):Promise<WriteResult>{
 if(!await allowed(client))throw new Error('Member management is not authorised.');
 const {data,error}=await client.rpc('member_manage',{p_action:command.action,p_family_id:command.familyId||null,p_record_id:command.recordId||null,p_expected_updated_at:command.updatedAt||null,p_data:command.data,p_ack_duplicates:acknowledged});
 if(error)throw new Error(error.code==='40001'?'This record changed. Close the editor and reload before saving.':error.code==='42501'?'Your access or the record is no longer available.':error.code==='22023'?'Check the member details, dates and contact links.':'The change could not be completed. Reload the family before retrying.');
 return data as WriteResult;
}

export async function deleteMember(client:SupabaseClient,familyId:string,athleteId:string|null,confirmation:string){
 const account=await requireActiveAccount(client);
 if(!account||account.profile.role!=='club_owner')throw new Error('Active Club Owner access required.');
 const {data,error}=await client.rpc('member_delete',{p_family_id:familyId,p_athlete_id:athleteId,p_confirmation:confirmation});
 if(error)throw new Error(error.code==='23503'?'This record has retained dependencies. Archive it instead.':error.code==='22023'?'Type the name exactly as shown.':error.code==='42501'?'This record is unavailable or you are not authorised.':'Deletion could not be completed. Reload the family before trying again.');
 return data;
}
