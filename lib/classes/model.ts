export type Category={id:string;name:string;colour:string;display_order:number;active:boolean};
export type Programme={id:string;name:string;colour:string;category_id:string|null;description:string|null;active:boolean};
export type ClassProfile={id:string;name:string;active:boolean;publication_status:'draft'|'published';visibility:'internal'|'public';category_id:string|null;programme_id:string|null;programme?:string|null;start_date:string|null;end_date:string|null;capacity:number;minimum_age:number|null;maximum_age:number|null;session_length_minutes:number;lead_coaches_required:number;assistant_coaches_required:number;description:string|null;eligibility_description:string|null;archive_state?:{sessions:string[];slots:string[]}|null;session_colour:string;minimum_coaches?:number;maximum_coaches?:number;lead_recommended_qualification_id?:string|null;assistant_recommended_qualification_id?:string|null;warn_if_understaffed?:boolean;critical_if_no_lead?:boolean;allow_below_recommended_qualification?:boolean};
export type Session={id:string;class_profile_id:string;venue_id:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;active:boolean;effective_from?:string|null;effective_to?:string|null;duration_minutes?:number|null;notes?:string|null;staffing?:StaffingDefault[]};
export type StaffingDefault={slot_number:number;default_profile_id:string|null;payment_type:'standard'|'enhanced'|'volunteer'};
export type Slot={id:string;class_id:string;slot_number:number;active:boolean;coach_name:string|null;default_profile_id?:string|null;payment_type?:StaffingDefault['payment_type']};
export type Assignment={class_id:string|null;staffing_slot_id:string|null;shift_date:string;status:string;assigned:boolean;start_time?:string;finish_time?:string;venue_id?:string};
export type Exclusion={class_id:string;staffing_slot_id:string|null;shift_date:string};
export type CalendarData={editing_version?:number;creation_version?:number;lifecycle_version?:number;coaches?:{id:string;full_name:string}[];qualifications?:{id:string;name:string}[];profiles:ClassProfile[];sessions:Session[];categories:Category[];programmes:Programme[];venues:{id:string;name:string;active:boolean}[];slots:Slot[];shifts:Assignment[];exclusions:Exclusion[];activity:{class_profile_id:string;action:string;created_at:string}[]};
export type Event={key:string;date:string;profile:ClassProfile;session:Session;colour:string;coverage:'unknown'|'covered'|'understaffed'|'cancelled';assigned:number;required:number;excludedSlots:number};
export type Filters={category:string;programme:string;venue:string;status:string;visibility:string;coverage:string};
export const emptyFilters:Filters={category:'',programme:'',venue:'',status:'',visibility:'',coverage:''};
// Date-only arithmetic uses UTC, independent of browser DST and timezone.
export function dateKey(date:Date){return date.toISOString().slice(0,10)}
export function addDays(day:string,n:number){const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return dateKey(d)}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
export function calendarRange(anchor:string,view:'month'|'week'|'day'|'list'):{from:string;to:string}{
 if(view==='month'){const first=anchor.slice(0,7)+'-01';const next=new Date(`${first}T12:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);const last=addDays(dateKey(next),-1);return {from:calendarRange(first,'week').from,to:calendarRange(last,'week').to}}
 const dow=new Date(`${anchor}T12:00:00Z`).getUTCDay();const from=view==='day'?anchor:addDays(anchor,-((dow+6)%7));
 return {from,to:addDays(from,view==='day'?0:6)};
}
export function expandCalendar(data:CalendarData,from:string,to:string,filters:Filters=emptyFilters):Event[]{
 const result:Event[]=[];
 for(let date=from;date<=to;date=addDays(date,1)){
  const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
  for(const session of data.sessions){
   const profile=data.profiles.find(p=>p.id===session.class_profile_id);if(!profile||session.weekday!==weekday)continue;
   // Retired recurrences are not archives. A profile archive can still be inspected.
   if(!session.active&&profile.active)continue;
   if(session.effective_from&&date<session.effective_from||session.effective_to&&date>session.effective_to)continue;
   if(profile.start_date&&date<profile.start_date||profile.end_date&&date>profile.end_date)continue;
   const status=profile.active?profile.publication_status:'archived';
   if(filters.status?status!==filters.status:status==='archived')continue;
   const programme=data.programmes.find(p=>p.id===profile.programme_id);
   const categoryId=profile.category_id||programme?.category_id;
   if(filters.category&&categoryId!==filters.category||filters.programme&&profile.programme_id!==filters.programme||filters.venue&&session.venue_id!==filters.venue||filters.visibility&&profile.visibility!==filters.visibility)continue;
   const slots=data.slots.filter(s=>s.class_id===session.id&&s.active);
   const exclusions=data.exclusions.filter(e=>e.class_id===session.id&&e.shift_date===date);
   if(exclusions.some(e=>e.staffing_slot_id===null))continue;
   const remaining=slots.filter(s=>!exclusions.some(e=>e.staffing_slot_id===s.id));
   if(slots.length>0&&remaining.length===0)continue;
   const rows=data.shifts.filter(s=>s.class_id===session.id&&s.shift_date===date&&remaining.some(slot=>slot.id===s.staffing_slot_id));
   const timesMatch=rows.every(s=>(!s.start_time||s.start_time.slice(0,5)===session.start_time.slice(0,5))&&(!s.finish_time||s.finish_time.slice(0,5)===session.finish_time.slice(0,5))&&(!s.venue_id||s.venue_id===session.venue_id));
   const complete=timesMatch&&remaining.length>0&&remaining.every(slot=>rows.some(s=>s.staffing_slot_id===slot.id));
   const assigned=remaining.filter(slot=>rows.some(s=>s.staffing_slot_id===slot.id&&s.status!=='cancelled'&&s.assigned)).length;
   const coverage:Event['coverage']=!complete?'unknown':rows.every(s=>s.status==='cancelled')?'cancelled':assigned>=remaining.length?'covered':'understaffed';
   if(filters.coverage&&coverage!==filters.coverage)continue;
   result.push({key:`${session.id}:${date}`,date,profile,session,colour:programme?.colour||data.categories.find(c=>c.id===categoryId)?.colour||profile.session_colour||'#6D3A91',coverage,assigned,required:remaining.length,excludedSlots:slots.length-remaining.length});
  }
 }
 return result.sort((a,b)=>a.date.localeCompare(b.date)||a.session.start_time.localeCompare(b.session.start_time)||a.profile.name.localeCompare(b.profile.name));
}

export function chronological(a:Event,b:Event){return a.session.start_time.localeCompare(b.session.start_time)||a.profile.name.localeCompare(b.profile.name)||a.key.localeCompare(b.key)}
export function weekRows(events:Event[],dates:string[]){
 const groups=new Map<string,Event[]>();
 for(const event of events.filter(e=>dates.includes(e.date))){const id=event.session.class_profile_id||event.profile.id;groups.set(id,[...(groups.get(id)||[]),event])}
 return [...groups].map(([id,items])=>({id,items:items.sort(chronological)})).sort((a,b)=>chronological(a.items[0],b.items[0])||a.id.localeCompare(b.id)).map(row=>({...row,cells:dates.map(date=>row.items.filter(e=>e.date===date))}));
}
export function moveCalendar(anchor:string,view:string,direction:number){if(view!=='month')return addDays(anchor,direction*(view==='day'?1:7));const d=new Date(`${anchor.slice(0,7)}-01T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+direction);return dateKey(d)}
