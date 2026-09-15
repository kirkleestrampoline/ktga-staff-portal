'use client';
import {useState} from 'react';
import {earlierFinish,resetActualTimes,validateActualTimes,type ActualTimes} from '@/lib/timesheet-actual';
export default function ActualTimeCard({staff,className,planned,actual,selected,disabled,error,onSelect,onChange}:{staff:string;className:string;planned:ActualTimes;actual:ActualTimes;selected:boolean;disabled:boolean;error?:string;onSelect:()=>void;onChange:(actual:ActualTimes)=>void}){
 const [editing,setEditing]=useState(false),[custom,setCustom]=useState(''),[quick,setQuick]=useState<number|null>(null),[localError,setLocalError]=useState('');
 const adjusted=actual.start!==planned.start||actual.finish!==planned.finish||actual.breakMinutes!==planned.breakMinutes;
 const invalid=validateActualTimes(actual);
 const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));
 const elapsed=(minute(actual.finish)-minute(actual.start)+1440)%1440;
 function reduce(n:number){try{onChange(earlierFinish(actual,planned,n));setQuick(n);setLocalError('')}catch(e){onChange({...actual,finish:''});setQuick(null);setLocalError((e as Error).message)}}
 return <article className={`actualTimeCard ${selected?'selected':''}`}>
  <label className="actualSelection"><input type="checkbox" checked={selected} disabled={disabled} onChange={onSelect}/><span><strong>{staff}</strong><span>{className}</span></span></label>
  <p>Scheduled: <strong>{planned.start}–{planned.finish}</strong> · {planned.breakMinutes} min break</p>
  <strong>{adjusted?'Adjusted':'As scheduled'}</strong>
  <button className="btn btnSecondary" type="button" aria-expanded={editing} disabled={disabled||!selected} onClick={()=>setEditing(!editing)}>Adjust actual times</button>
  {editing&&<fieldset disabled={disabled||!selected}>
   <legend>Actual time adjustments</legend>
   <div className="actualQuick">{[5,10,15,30].map(n=><button type="button" key={n} aria-pressed={quick===n} onClick={()=>reduce(n)}>Finished {n} min earlier</button>)}</div>
   <div className="actualCustom"><label>Custom minutes earlier<input type="number" min="1" step="1" value={custom} onChange={e=>setCustom(e.target.value)}/></label><button className="btn btnSecondary" type="button" onClick={()=>reduce(Number(custom))}>Apply</button></div>
   <div className="actualFields">{(['start','finish'] as const).map(field=><label key={field}>Actual {field==='finish'?'end':'start'}<input type="time" value={actual[field]} onChange={e=>{onChange({...actual,[field]:e.target.value});setQuick(null);setLocalError('')}}/></label>)}<label>Break minutes<input type="number" min="0" value={Number.isNaN(actual.breakMinutes)?'':actual.breakMinutes} onChange={e=>onChange({...actual,breakMinutes:e.target.value===''?NaN:Number(e.target.value)})}/></label></div>
   <button className="btn btnSecondary" type="button" onClick={()=>{onChange(resetActualTimes(planned));setQuick(null);setCustom('');setLocalError('');setEditing(false)}}>Reset to scheduled</button>
  </fieldset>}
  <p aria-live="polite">{invalid?'Actual duration unavailable':`Actual duration: ${((elapsed-actual.breakMinutes)/60).toFixed(2)}h`}{adjusted?` · ${planned.start}–${planned.finish} → ${actual.start||'…'}–${actual.finish||'…'} (${actual.breakMinutes} min break)`:' · No changes'}{!invalid&&actual.finish<actual.start?' · End is next day':''}</p>
  {(error||localError||invalid)&&<p role="alert">{error||localError||invalid}</p>}
 </article>;
}
