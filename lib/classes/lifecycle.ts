import {addDays,calendarRange,today,type ClassProfile,type Session} from './model';
export type ClassState='draft'|'published'|'ended'|'archived';
export function classState(p:Pick<ClassProfile,'active'|'publication_status'|'end_date'>,date=today()):ClassState{return !p.active?'archived':p.end_date&&p.end_date<date?'ended':p.publication_status}
export function inEffectiveRange(date:string,from?:string|null,to?:string|null){return (!from||date>=from)&&(!to||date<=to)}
export function recurrenceEligible(p:Pick<ClassProfile,'active'|'publication_status'|'start_date'|'end_date'>|undefined,s:Pick<Session,'active'|'effective_from'|'effective_to'>,date:string){return !!p&&p.active&&p.publication_status==='published'&&s.active&&inEffectiveRange(date,p.start_date,p.end_date)&&inEffectiveRange(date,s.effective_from,s.effective_to)}
// Resolve the recurrence's actual day inside the staff view's selected week.
export function masterOccurrenceDate(weekday:number,selected:string){return addDays(calendarRange(selected,'week').from,(weekday+6)%7)}
export function masterClassEligible(row:{active:boolean;publication_status?:string;profile_active?:boolean;weekday:number;start_date?:string|null;end_date?:string|null;effective_from?:string|null;effective_to?:string|null},selected:string){return row.active&&row.profile_active===true&&row.publication_status==='published'&&inEffectiveRange(masterOccurrenceDate(row.weekday,selected),row.start_date,row.end_date)&&inEffectiveRange(masterOccurrenceDate(row.weekday,selected),row.effective_from,row.effective_to)}
export const classSections=['Class Library','Timetable','Categories & Programmes'] as const;
