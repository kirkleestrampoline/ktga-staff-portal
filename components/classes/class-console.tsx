'use client';
import {useRef,useId,type ReactNode} from 'react';
import {useMemberDialog} from '../members/use-member-dialog';
export default function ClassConsole({title,status,onClose,children,footer}:{title:string;status:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 const titleId=useId();
 useMemberDialog(dialog);
 return <dialog ref={dialog} className="classesConsole" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose()}}><div className="v311AdminShiftHero"><div><span>Class Console</span><h2 id={titleId}>{title}</h2><p>{status}</p></div><button type="button" className="iconButton" aria-label="Close class console" onClick={onClose}>×</button></div><div className="modalBody v405ScheduleControlBody">{children}</div><footer className="v405ScheduleControlFoot">{footer??<button type="button" className="btn btnSecondary" onClick={onClose}>Back to Classes</button>}</footer></dialog>;
}
