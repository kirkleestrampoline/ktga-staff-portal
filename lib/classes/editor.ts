import type {ClassProfile,Session,Slot} from './model';
// Select writable profile values explicitly: imported rows can carry arbitrary
// database metadata, but never supply tenant identity or lifecycle mutations.
const fields=['name','category_id','programme_id','programme','session_colour','description','capacity','minimum_age','maximum_age','eligibility_description','visibility','lead_coaches_required','assistant_coaches_required','minimum_coaches','maximum_coaches','lead_recommended_qualification_id','assistant_recommended_qualification_id','warn_if_understaffed','critical_if_no_lead','allow_below_recommended_qualification','session_length_minutes','start_date','end_date'] as const;
export function safeProfilePayload(profile:Omit<ClassProfile,'id'>,sessions:Partial<Session>[],supportsDefaults:boolean){
 return {...Object.fromEntries(fields.map(key=>[key,profile[key]])),required_coaches:profile.lead_coaches_required+profile.assistant_coaches_required,
  session_notes:sessions.map(s=>({id:s.id,notes:s.notes||null})),
  ...(profile.publication_status==='published'&&supportsDefaults?{session_defaults:sessions.map(s=>({id:s.id,staffing:(s.staffing||[]).map(x=>({slot_number:x.slot_number,default_profile_id:x.default_profile_id,payment_type:x.payment_type}))}))}:{})};
}
export function publishedDefaultsChanged(sessions:Partial<Session>[],slots:Slot[]){
 return sessions.some(s=>s.staffing?.some(x=>{const saved=slots.find(slot=>slot.class_id===s.id&&slot.slot_number===x.slot_number);return (x.default_profile_id||null)!==(saved?.default_profile_id||null)||x.payment_type!==(saved?.payment_type||'standard')}));
}
