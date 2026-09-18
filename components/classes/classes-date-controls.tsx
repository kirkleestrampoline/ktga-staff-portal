'use client';
import {CalendarIcon} from '@/components/icons';
export default function ClassesDateControls({date,onPrevious,onToday,onNext,onChange}:{date:string;onPrevious:()=>void;onToday:()=>void;onNext:()=>void;onChange:(date:string)=>void}){
 return <div className="classesDateControls" role="group" aria-label="Calendar date navigation"><button type="button" aria-label="Previous date range" onClick={onPrevious}>‹</button><button type="button" className="classesToday" onClick={onToday}>Today</button><label className="classesSelectedDate"><CalendarIcon/><input aria-label="Calendar date" type="date" value={date} onChange={e=>e.target.value&&onChange(e.target.value)}/></label><button type="button" aria-label="Next date range" onClick={onNext}>›</button></div>;
}
