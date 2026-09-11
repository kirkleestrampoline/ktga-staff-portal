'use client';
import {useEffect,useRef,type ReactNode} from 'react';
export default function ClassConsole({title,status,onClose,children,footer,restoreContext=true}:{title:string;status:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;restoreContext?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=dialog.current!,trigger=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow,scroll=window.scrollY;document.body.style.overflow='hidden';d.showModal();return()=>{d.close();document.body.style.overflow=overflow;if(restoreContext){window.scrollTo(0,scroll);trigger?.focus({preventScroll:true})}}},[]);
 return <dialog ref={dialog} className="classesConsole modal v311AdminShiftModal v405ScheduleControlModal" aria-labelledby="classes-console-title" onCancel={e=>{e.preventDefault();onClose()}}><div className="v311AdminShiftHero"><div><span>Class Console</span><h2 id="classes-console-title">{title}</h2><p>{status}</p></div><button type="button" className="iconButton" aria-label="Close class console" onClick={onClose}>×</button></div><div className="modalBody v405ScheduleControlBody">{children}</div><footer className="v405ScheduleControlFoot">{footer??<button type="button" className="btn btnSecondary" onClick={onClose}>Back to Classes</button>}</footer></dialog>;
}
