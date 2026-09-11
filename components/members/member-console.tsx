"use client";
import {useMemberDialog} from './use-member-dialog';
import {useRef,type ReactNode} from 'react';
export default function MemberConsole({title,reference,onClose,children}:{title:string;reference:string;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 useMemberDialog(dialog);
 return <dialog ref={dialog} className="memberConsole modal v311AdminShiftModal v405ScheduleControlModal" aria-labelledby="family-console-title" onCancel={e=>{e.preventDefault();onClose()}}><div className="v311AdminShiftHero"><div><span>Family account</span><h2 id="family-console-title">{title}</h2><p>{reference}</p></div><button className="iconButton" aria-label="Close family account" onClick={onClose}>×</button></div><div className="modalBody v405ScheduleControlBody">{children}</div><footer className="v405ScheduleControlFoot"><button className="btn btnSecondary" onClick={onClose}>Back to members</button></footer></dialog>;
}
