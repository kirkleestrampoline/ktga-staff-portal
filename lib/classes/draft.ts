import type {ClassProfile,Session} from './model';
// Validate every tab before submitting; hidden required inputs cannot do this.
export function validateDraft(p:Omit<ClassProfile,'id'>,sessions:Partial<Session>[]){
 if(!p.name.trim())return 'Enter a class name.';
 if(!Number.isInteger(p.capacity)||p.capacity<1)return 'Capacity is required.';
 if(!Number.isInteger(p.session_length_minutes)||p.session_length_minutes<1||p.session_length_minutes>1440)return 'Duration must be 1–1440 minutes.';
 if(p.minimum_age!=null&&p.minimum_age<0||p.maximum_age!=null&&(p.maximum_age<0||p.maximum_age<(p.minimum_age??0)))return 'Check minimum and maximum ages.';
 const req=p.lead_coaches_required+p.assistant_coaches_required;
 if([p.lead_coaches_required,p.assistant_coaches_required,p.minimum_coaches??1,p.maximum_coaches??1].some(n=>!Number.isInteger(n)||n<0||n>12)||req<1||req>12||(p.maximum_coaches??1)<(p.minimum_coaches??1))return 'Check staffing requirements (1–12 positions).';
 if(p.end_date&&p.start_date&&p.end_date<p.start_date)return 'End date must be on or after start date.';
 if(p.publication_status==='draft'){
  if(!p.start_date||!sessions.length)return 'Start date and a recurring session are required.';
  if(sessions.some(s=>!s.venue_id||!s.start_time||!Number.isInteger(s.weekday)||s.weekday!<0||s.weekday!>6||!Number.isInteger(s.break_minutes??0)||(s.break_minutes??0)<0||(s.break_minutes??0)>=p.session_length_minutes))return 'Check each recurring day, venue, start time and break.';
  if(new Set(sessions.map(s=>`${s.weekday}:${s.start_time?.slice(0,5)}`)).size!==sessions.length)return 'Each recurring day and time must be unique.';
 }
 return '';
}
