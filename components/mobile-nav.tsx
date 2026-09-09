"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { DashboardTab as Tab } from "@/types/navigation";
import { navigationForRole, isFutureModule, type FutureModule, isNavigationGroup, navigationItemActive } from "@/lib/navigation";
import ComingSoonModule from "./coming-soon-module";
import NavigationIcon from "./navigation-icon";

type Props={tab:Tab;setTab:(t:Tab)=>void;role:string;name:string;clubName?:string;open:boolean;setOpen:(v:boolean)=>void;onSignOut:()=>void};

export default function MobileNav({tab,setTab,role,name,clubName,open,setOpen,onSignOut}:Props){
  const items=navigationForRole(role);
  const primaryItems=items.filter(item=>!isFutureModule(item));
  const [future,setFuture]=useState<FutureModule|null>(null);
  const staff=items.find(isNavigationGroup)!;
  const [submenu,setSubmenu]=useState(false);
  const staffButton=useRef<HTMLButtonElement>(null);
  const sheetButton=useRef<HTMLButtonElement>(null);
  const sheetId=useId();
  useEffect(()=>{if(open)sheetButton.current?.focus()},[open,submenu]);
  const close=()=>{setOpen(false);staffButton.current?.focus()};
  const choose=(t:Tab)=>{setTab(t);close()};
  const openStaff=()=>{setSubmenu(true);setOpen(true)};
  return <>
    <nav className="mobileBottomNav" style={{gridTemplateColumns:`repeat(${primaryItems.length},1fr)`}} aria-label="Mobile navigation">
      {primaryItems.map(item=>isNavigationGroup(item)?<button key={item.id} ref={staffButton} type="button" className={navigationItemActive(item,tab)||open?"active":""} aria-expanded={open} aria-controls={sheetId} onClick={openStaff}><NavigationIcon name={item.icon}/><span>{item.label}</span></button>:<button key={item.id} type="button" className={tab===item.id?"active":""} aria-current={tab===item.id?"page":undefined} onClick={()=>{setTab(item.id);setOpen(false)}}><NavigationIcon name={item.icon}/><span>{item.label}</span></button>)}
    </nav>
    {open&&<>
      <button className="mobileMoreScrim" aria-label="Close navigation menu" onClick={close}/>
      <section id={sheetId} className="mobileMoreSheet open staffMobileSheet" aria-label={submenu?"Staff navigation":"Modules"} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();close()}}}>
        <div className="mobileMoreHandle"/>
        <div className="mobileMoreHead"><div><strong>AV Gymnastics Solutions</strong><span>{clubName||name}</span></div><button type="button" onClick={close} aria-label="Close navigation menu">×</button></div>
        <button ref={sheetButton} type="button" className="staffMobileBack" onClick={()=>submenu?setSubmenu(false):close()}>{submenu?"← All modules":"← Close menu"}</button>
        <nav className="mobileMoreLinks" aria-label={submenu?"Staff":"Modules"}>
          {(submenu?staff.children:items).map(item=>isNavigationGroup(item)?<button type="button" key={item.id} onClick={openStaff}><NavigationIcon name={item.icon}/><span><strong>{item.label}</strong></span><span aria-hidden="true">›</span></button>:isFutureModule(item)?<button type="button" key={item.id} onClick={()=>item.enabled?choose(item.destination):setFuture(item)}><NavigationIcon name={item.icon}/><span><strong>{item.label}</strong></span>{!item.enabled&&<small className="navigationSoonBadge">Soon</small>}</button>:<button type="button" key={item.id} aria-current={tab===item.id?"page":undefined} className={tab===item.id?"active":""} onClick={()=>choose(item.id)}><NavigationIcon name={item.icon}/><span><strong>{item.label}</strong></span></button>)}
        </nav>
        <button type="button" className="mobileSignOut" onClick={onSignOut}>Sign out</button>
      </section>
    </>}
    {future&&items.some(item=>item.id===future.id)&&<ComingSoonModule module={future} onClose={()=>setFuture(null)}/>}
  </>;
}
