"use client";
import {useEffect,useRef,useState} from 'react';
import type {Family,Athlete} from '@/lib/members/model';
import {singleFlight} from '@/lib/members/single-flight';
export default function MemberDelete({family,athlete,onClose,onDelete}:{family:Family;athlete?:Athlete;onClose:()=>void;onDelete:(name:string)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),run=useRef(singleFlight());const [name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const expected=athlete?.display_name||family.display_name;
 useEffect(()=>{const d=dialog.current!,trigger=document.activeElement as HTMLElement|null;d.showModal();return()=>{d.close();trigger?.focus()}},[]);
 return <dialog ref={dialog} className="memberEditor memberDangerModal memberScheduleForm" aria-labelledby="member-delete-title" onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
 <div className="v311AdminShiftHero"><div><span>Permanent deletion</span><h2 id="member-delete-title">Delete {athlete?'athlete':'family'}?</h2></div><button className="iconButton" aria-label="Close deletion confirmation" disabled={busy} onClick={onClose}>×</button></div>
 <div className="memberEditorBody"><p><strong>{expected}</strong> will be permanently removed. This cannot be undone.</p>
 {athlete?<p>Only this athlete and their contact relationships will be removed. The family, contacts and other athletes will remain.</p>:<><p>This removes the family account, {family.contacts.length} contacts, {family.athletes.length} athletes and their contact relationships:</p><ul>{family.contacts.map(c=><li key={c.id}>Contact: {c.display_name}</li>)}{family.athletes.map(a=><li key={a.id}>Athlete: {a.display_name}</li>)}</ul></>}
 <p>Deletion is blocked if retained operational records or protected relationships exist. Use Archive to preserve history.</p>
 <label className="memberFormFields">Type <strong>{expected}</strong> exactly to confirm<input autoComplete="off" value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>{error&&<div role="alert" className="notice danger">{error}<button type="button" className="btn btnSecondary" onClick={()=>setError('')}>Dismiss error</button></div>}</div>
 <footer><button className="btn btnSecondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn memberDangerButton" disabled={busy||name!==expected} onClick={()=>void run.current(async()=>{setBusy(true);setError('');try{await onDelete(name)}catch(e){setError(e instanceof Error?e.message:'Deletion failed.')}finally{setBusy(false)}})}>{busy?'Deleting…':'Permanently delete'}</button></footer></dialog>;
}
