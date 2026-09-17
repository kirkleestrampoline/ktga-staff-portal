export const enrolmentStatuses=['enquiry','trial','waiting','active','paused','ended'] as const;
export type EnrolmentStatus=typeof enrolmentStatuses[number];
export type EnrolmentAthlete={id:string;family_id:string;display_name:string;family_name:string;status:string};
export type EnrolmentProfile={id:string;name:string;active:boolean;publication_status:string;capacity:number;start_date:string|null;end_date:string|null};
export type Occupancy={enrolment_id:string;start_date:string;end_date:string|null};
export type EnrolmentSession={id:string;class_profile_id:string;weekday:number;start_time:string;finish_time:string;venue_id:string;venue_name:string;capacity:number;active:boolean;effective_from:string|null;effective_to:string|null;occupied_today:number;occupancy:Occupancy[]};
export type SessionSelection={id:string;class_id:string;selected_from:string;selected_to:string|null;superseded_at:string|null;weekday:number;start_time:string;finish_time:string;venue_name:string};
export type StatusHistory={id:string;from_status:EnrolmentStatus|null;to_status:EnrolmentStatus;effective_date:string;reason:string;created_at:string};
export type Enrolment={id:string;athlete_id:string;athlete_name:string;family_id:string;family_name:string;class_profile_id:string;class_name:string;status:EnrolmentStatus;start_date:string;end_date:string|null;source:string;internal_notes:string;updated_at:string;sessions:SessionSelection[];history:StatusHistory[]};
export type EnrolmentContext={today:string;counts:{active:number;trial:number;waiting:number};athletes:EnrolmentAthlete[];profiles:EnrolmentProfile[];sessions:EnrolmentSession[];enrolments:Enrolment[]};
export type EnrolmentDraft={athlete_id:string;class_profile_id:string;status:EnrolmentStatus;start_date:string;end_date:string;source:string;internal_notes:string;session_ids:string[];change_from:string;override_reason:string};

export function rangesOverlap(aStart:string,aEnd:string|null,bStart:string,bEnd:string|null){return aStart<=(bEnd||'9999-12-31')&&bStart<=(aEnd||'9999-12-31')}
export function occupiedFor(session:EnrolmentSession,start:string,end:string|null,excludeId?:string){return new Set(session.occupancy.filter(row=>row.enrolment_id!==excludeId&&rangesOverlap(start,end,row.start_date,row.end_date)).map(row=>row.enrolment_id)).size}
export function availableFor(session:EnrolmentSession,start:string,end:string|null,excludeId?:string){return session.capacity-occupiedFor(session,start,end,excludeId)}
export function enrolmentError(draft:EnrolmentDraft,sessions:EnrolmentSession[],editing=false){
 if(!draft.athlete_id)return 'Select an athlete.';
 if(!draft.class_profile_id)return 'Select a class.';
 if(!enrolmentStatuses.includes(draft.status))return 'Select an enrolment status.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.start_date))return 'Choose a valid inclusive start date.';
 if(draft.end_date&&draft.end_date<draft.start_date)return 'End date must be on or after the start date.';
 if(!draft.session_ids.length)return 'Select at least one weekly session.';
 if(draft.session_ids.some(id=>!sessions.some(session=>session.id===id&&session.class_profile_id===draft.class_profile_id)))return 'A selected weekly session is unavailable.';
 if(editing&&!/^\d{4}-\d{2}-\d{2}$/.test(draft.change_from))return 'Choose when the session change takes effect.';
 if(draft.source.length>120)return 'Source must be 120 characters or fewer.';
 if(draft.internal_notes.length>4000)return 'Internal notes must be 4,000 characters or fewer.';
 return '';
}
export const enrolmentStatusLabel=(value:string)=>value==='waiting'?'Waiting list':value.replace(/^./,letter=>letter.toUpperCase());
export const weekdayLabel=(day:number)=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day]||'Weekly';
