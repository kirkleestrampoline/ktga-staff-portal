'use client';
import {useState} from 'react';
import {CalendarIcon,PlusIcon} from '@/components/icons';
import ClassesDateControls from './classes-date-controls';
import {chronological,moveCalendar,addDays,emptyFilters,today,type CalendarData,type ClassProfile,type Event,type Filters} from '@/lib/classes/model';

type View='month'|'week'|'day'|'list';
const label=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
function dateLabel(date:string,options:Intl.DateTimeFormatOptions){return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB',{...options,timeZone:'UTC'})}
export default function ClassCalendar({data,events,loading,anchor,view,filters,from,to,onAnchor,onView,onFilters,onOpen}:{
 data:CalendarData|null;events:Event[];loading:boolean;anchor:string;view:View;filters:Filters;from:string;to:string;
 onAnchor:(date:string)=>void;onView:(view:View)=>void;onFilters:(filters:Filters)=>void;onOpen:(profile?:ClassProfile)=>void;
}){
 const [moreOpen,setMoreOpen]=useState(false);
 const additionalCount=[filters.status,filters.visibility,filters.coverage].filter(Boolean).length;
 const filterCount=Object.values(filters).filter(Boolean).length;
 const dates=Array.from({length:Math.round((Date.parse(to)-Date.parse(from))/86400000)+1},(_,i)=>addDays(from,i));
 const period=view==='month'?dateLabel(anchor,{month:'long',year:'numeric'}):from===to?dateLabel(from,{day:'numeric',month:'long',year:'numeric'}):`${dateLabel(from,{day:'numeric',month:'short'})} – ${dateLabel(to,{day:'numeric',month:'short',year:'numeric'})}`;
 function renderEvent(event:Event){
       const programme=data!.programmes.find(p=>p.id===event.profile.programme_id);
       const category=data!.categories.find(c=>c.id===(event.profile.category_id||programme?.category_id));
       const status=event.profile.active?event.profile.publication_status:'archived';
       return <button type="button" className="classesEvent" key={event.key} style={{borderLeftColor:event.colour}} onClick={()=>onOpen(event.profile)}>
        <span className="classesEventTime">{event.session.start_time.slice(0,5)}<span>– {event.session.finish_time.slice(0,5)}</span></span>
        <span className="classesEventIdentity"><strong className="classesEventName">{event.profile.name}</strong>{(programme||category)&&<span className="classesEventProgramme">{programme?.name||category?.name}</span>}<span className="classesEventVenue">{data!.venues.find(v=>v.id===event.session.venue_id)?.name||'Venue unavailable'}</span></span>
       <span className="classesEventMeta">{(status!=='published'||event.coverage==='understaffed'||event.coverage==='cancelled')&&<span className="classesEventBadges"><span className={`classesBadge classesBadge-${status}`}>{label(status)}</span>{status!=='published'&&<span className={`classesBadge classesBadge-${event.profile.visibility}`}>{label(event.profile.visibility)}</span>}</span>}
         <span className={`classesCoverage classesCoverage-${event.coverage}`}><span aria-hidden="true" className="classesCoverageDot"/>{label(event.coverage)}{event.coverage!=='unknown'&&<span className="classesCoverageNumbers">{event.assigned}/{event.required}</span>}</span>{event.excludedSlots>0&&<span className="classesEventNote">{event.excludedSlots} excluded {event.excludedSlots===1?'slot':'slots'}</span>}
        </span>
       </button>;
 }
 return <>
  <header className="classesHeader">
   <div className="classesHeroIdentity"><span className="classesHeroIcon" aria-hidden="true"><CalendarIcon/></span><div><span className="classesEyebrow">SCHEDULING</span><h1>Timetable</h1><p>View and manage your club’s recurring class schedule.</p></div></div>
   <button className="btn btnPrimary classesCreate" disabled={!data||loading} onClick={()=>onOpen()}><PlusIcon/>Create class</button>
  </header>
  <section className="classesCalendarPanel" aria-label="Class calendar">
   <div className="classesToolbar">
    <ClassesDateControls date={anchor} onPrevious={()=>onAnchor(moveCalendar(anchor,view,-1))} onToday={()=>onAnchor(today())} onNext={()=>onAnchor(moveCalendar(anchor,view,1))} onChange={onAnchor}/>
    <div className="classesSegments" role="group" aria-label="Calendar view">{(['month','week','day','list'] as const).map(v=><button type="button" key={v} aria-pressed={view===v} onClick={()=>onView(v)}>{label(v)}</button>)}</div>
   </div>
   <div className="classesFilters">
    <label>All classes<input type="search" aria-label="All classes" value={filters.className||''} onChange={e=>onFilters({...filters,className:e.target.value})} placeholder="Search class names"/></label>
    {moreOpen&&<div className="classesFrequentFilters"><label>Category<select aria-label="Category" value={filters.category} onChange={e=>onFilters({...filters,category:e.target.value})}><option value="">All categories</option>{data?.categories.map(c=><option key={c.id} value={c.id}>{c.name}{!c.active?' (Archived)':''}</option>)}</select></label>
    <label>Programme<select aria-label="Programme" value={filters.programme} onChange={e=>onFilters({...filters,programme:e.target.value})}><option value="">All programmes</option>{data?.programmes.map(p=><option key={p.id} value={p.id}>{p.name}{!p.active?' (Archived)':''}</option>)}</select></label>
    <label>Venue<select aria-label="Venue" value={filters.venue} onChange={e=>onFilters({...filters,venue:e.target.value})}><option value="">All venues</option>{data?.venues.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>}
    <div className="classesFilterActions"><button type="button" className="classesMoreFilters" aria-expanded={moreOpen} aria-controls="classes-additional-filters" onClick={()=>setMoreOpen(!moreOpen)}>More filters{additionalCount>0&&<span className="classesFilterCount">{additionalCount}</span>}<span aria-hidden="true">{moreOpen?'−':'+'}</span></button>{filterCount>0&&<button type="button" className="classesClearFilters" onClick={()=>onFilters({...emptyFilters})}>Clear filters ({filterCount})</button>}</div>
   </div>
   <div id="classes-additional-filters" className="classesAdditionalFilters" hidden={!moreOpen}>
    <label>Status<select aria-label="Status" value={filters.status} onChange={e=>onFilters({...filters,status:e.target.value})}><option value="">Draft and Published</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
    <label>Visibility<select aria-label="Visibility" value={filters.visibility} onChange={e=>onFilters({...filters,visibility:e.target.value})}><option value="">All visibility</option><option value="internal">Internal</option><option value="public">Public</option></select></label>
    <label>Staffing<select aria-label="Staffing" value={filters.coverage} onChange={e=>onFilters({...filters,coverage:e.target.value})}><option value="">All staffing</option><option value="unknown">Unknown / Not generated</option><option value="covered">Covered</option><option value="understaffed">Understaffed</option><option value="cancelled">Cancelled</option></select></label>
   </div>
   <div className="classesCalendarHeading"><h2>{period}</h2><span role="status">{loading?'Loading…':`${events.length} ${events.length===1?'session':'sessions'}`}{filterCount>0?' · Filtered':''}</span></div>
   {loading?<div className="classesLoading" role="status">Loading your class calendar…</div>:!data?<div className="classesLoading">The calendar is unavailable. Check the message above.</div>:<div className="classesCalendarViewport" tabIndex={view==='week'||view==='month'?0:undefined} role="region" aria-label={view==='week'?'Weekly calendar. Scroll horizontally for more days.':`${label(view)} calendar`}>
    <div className={`classesCalendar classesCalendar-${view}`}>{view==='week'?<>
     {dates.map(date=><section className="classesWeekDay" key={date}><header className="classesDayHeading"><time dateTime={date}>{dateLabel(date,{weekday:'short',day:'numeric',month:'short'})}</time></header><div className="classesDayEvents">{events.filter(e=>e.date===date).sort(chronological).map(renderEvent)}{!events.some(e=>e.date===date)&&<div className="classesEmptyDay"><span aria-hidden="true">—</span><p>No classes scheduled</p></div>}</div></section>)}
     {!events.length&&<p className="classesWeekEmpty">No classes scheduled</p>}
    </>:dates.map(date=>{
     const dayEvents=events.filter(e=>e.date===date).sort(chronological);
     return <section className={`classesDay ${date===today()?'classesDayToday':''}`} key={date}>
      <header className="classesDayHeading"><time dateTime={date}><span>{dateLabel(date,{weekday:'short'})}</span><strong>{dateLabel(date,{day:'numeric',month:'short'})}</strong></time><span className="classesDayCount">{dayEvents.length}</span></header>
      <div className="classesDayEvents">{dayEvents.map(event=>{
       return renderEvent(event);
      })}{!dayEvents.length&&<div className="classesEmptyDay"><span aria-hidden="true">—</span><p>No classes scheduled</p></div>}</div>
     </section>;
    })}</div>
   </div>}
   <div className="classesCalendarFoot"><span>Shared with Master Timetable</span><span>Unknown staffing means coverage has not been verified.</span></div>
  </section>
 </>;
}
