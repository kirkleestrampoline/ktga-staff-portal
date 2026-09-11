import type {SupabaseClient} from '@supabase/supabase-js';
import type {CalendarData,Session} from './model';
export async function loadCalendar(client:SupabaseClient,from:string,to:string):Promise<CalendarData>{
 const {data,error}=await client.rpc('classes_calendar_data',{p_from:from,p_to:to});
 if(error)throw new Error(error.message);if(!data)throw new Error('Classes data unavailable. Apply and verify the Classes migration first.');return data as CalendarData;
}
export async function saveClass(client:SupabaseClient,profile:Record<string,unknown>,sessions:unknown[]|null){
 const {data,error}=await client.rpc('classes_save_profile',{p_data:profile,p_sessions:sessions});if(error)throw new Error(error.message);return data as string;
}
export async function publishClass(client:SupabaseClient,id:string){
 const {error}=await client.rpc('classes_publish',{p_profile_id:id});if(error)throw new Error(error.message);
}
export async function saveTaxonomy(client:SupabaseClient,kind:'category'|'programme',data:Record<string,unknown>){
 const {error}=await client.rpc('classes_save_taxonomy',{p_kind:kind,p_data:data});if(error)throw new Error(error.message);
}

export async function classCommand(client:SupabaseClient,action:string,id:string|null,data:Record<string,unknown>,requestId:string){
 const {data:result,error}=await client.rpc('classes_command',{p_action:action,p_profile_id:id,p_data:data,p_request_id:requestId});if(error)throw new Error(error.message);return result as {id:string;sessions:Session[]};
}
export async function classDependencies(client:SupabaseClient,id:string){const {data,error}=await client.rpc('classes_deletion_check',{p_profile_id:id});if(error)throw new Error(error.message);return data as {allowed:boolean;blockers:{table:string;count:number}[];reason:string}}
