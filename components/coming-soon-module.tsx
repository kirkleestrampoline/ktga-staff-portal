"use client";

import { useEffect, useId, useRef } from "react";
import type { FutureModule } from "@/lib/navigation";
import NavigationIcon from "./navigation-icon";

export default function ComingSoonModule({module,onClose}:{module:FutureModule;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  const titleId=useId(),descriptionId=useId();
  useEffect(()=>{
    const element=dialog.current!;
    const trigger=document.activeElement as HTMLElement|null;
    element.showModal();
    return ()=>{element.close();trigger?.focus()};
  },[]);
  return <dialog ref={dialog} className="comingSoonModule" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();onClose()}}>
    <div className="comingSoonModuleBody">
      <span className="comingSoonModuleIcon"><NavigationIcon name={module.icon}/></span>
      <span className="comingSoonModuleEyebrow">AV Gymnastics Solutions · Coming soon</span>
      <h1 id={titleId}>{module.label}</h1>
      <p id={descriptionId}>{module.description}</p>
      <button type="button" className="btn btnPrimary" onClick={onClose} autoFocus>Back to workspace</button>
    </div>
  </dialog>;
}
