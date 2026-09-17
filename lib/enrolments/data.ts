import type {SupabaseClient} from '@supabase/supabase-js';
import type {EnrolmentContext} from './model';
export async function loadEnrolmentContext(client:SupabaseClient,profileId:string|null,athleteId:string|null,search=''):Promise<EnrolmentContext>{
 const {data,error}=await client.rpc('enrolments_context',{p_profile_id:profileId,p_athlete_id:athleteId,p_search:search.trim().slice(0,100)});
 if(error)throw new Error(error.code==='PGRST202'?'Enrolments setup is incomplete. Apply and verify the Enrolments migration.':error.code==='42501'?'Enrolment access is unavailable.':error.message||'Enrolments could not be loaded.');
 return data as EnrolmentContext;
}
export async function enrolmentCommand(client:SupabaseClient,action:'create'|'edit'|'status'|'end',id:string|null,data:Record<string,unknown>,requestId:string){
 const {data:result,error}=await client.rpc('enrolments_command',{p_action:action,p_enrolment_id:id,p_data:data,p_request_id:requestId});
 if(error)throw new Error(error.code==='23505'?'This athlete already has an overlapping enrolment for a selected session.':error.code==='23514'?'Review the dates and selected weekly sessions.':error.code==='42501'?'The athlete, class or session is outside your club or no longer available.':error.message||'The enrolment change could not be saved.');
 return result as {id:string;status:string};
}
