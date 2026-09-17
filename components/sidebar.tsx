"use client";

import { useEffect, useId, useState } from "react";
import { SettingsIcon } from "./icons";
import NavigationIcon from "./navigation-icon";
import { navigationForRole, isFutureModule, type FutureModule, isNavigationGroup, navigationItemActive, type NavigationLink } from "@/lib/navigation";
import ComingSoonModule from "./coming-soon-module";
import AvBrandLockup from "./av-brand-lockup";
import type { DashboardTab as Tab } from "@/types/navigation";

export default function Sidebar({tab,setTab,name,role,onSignOut,mobileOpen,onClose}:{tab:Tab;setTab:(t:Tab)=>void;name:string;role:string;onSignOut:()=>void;mobileOpen:boolean;onClose:()=>void}){
  const admin=role==="admin"||role==="club_owner"||role==="org_admin";
  const initials=name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"AV";
  const items=navigationForRole(role);
  const [future,setFuture]=useState<FutureModule|null>(null);
  const staff=items.find(isNavigationGroup)!;
  const [expanded,setExpanded]=useState(()=>navigationItemActive(staff,tab));
  const groupId=useId();
  useEffect(()=>{if(navigationItemActive(staff,tab))setExpanded(true)},[tab,role]);
  const choose=(id:Tab)=>{if(staff.children.some(child=>child.id===id))setExpanded(true);setTab(id);onClose()};
  const renderLink=({id,label,icon}:NavigationLink)=><button key={id} type="button" aria-current={tab===id?"page":undefined} className={`navButton ${tab===id?"active":""}`} onClick={()=>choose(id)}><span className="v3NavIcon"><NavigationIcon name={icon}/></span><span>{label}</span></button>;
  return <>
    <button aria-label="Close menu" className={`mobileScrim ${mobileOpen?"show":""}`} onClick={onClose}/>
    <aside className={`sidebar v3Sidebar ${mobileOpen?"mobileOpen":""}`}>
      <div className="v3SidebarBrand"><AvBrandLockup size={46} singleLine/><button className="sidebarClose" aria-label="Close menu" onClick={onClose}>×</button></div>
      <nav className="nav v3Nav" aria-label="Primary navigation" tabIndex={0}><div className="navLabel">{admin?"Workspace":"My coaching"}</div>{items.map(item=>isNavigationGroup(item)?<div key={item.id} className="staffNavigationGroup"><button type="button" className={`navButton staffNavigationToggle ${navigationItemActive(item,tab)?"active":""}`} aria-expanded={expanded} aria-controls={groupId} onClick={()=>setExpanded(value=>!value)}><span className="v3NavIcon"><NavigationIcon name={item.icon}/></span><span>{item.label}</span><svg className="staffNavigationChevron" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></button><div id={groupId} className="staffNavigationChildren" hidden={!expanded}>{item.children.map(renderLink)}</div></div>:isFutureModule(item)?<button key={item.id} type="button" className={`navButton ${navigationItemActive(item,tab)?"active":""}`} aria-current={navigationItemActive(item,tab)?"page":undefined} onClick={()=>item.enabled?choose(item.destination):setFuture(item)}><span className="v3NavIcon"><NavigationIcon name={item.icon}/></span><span>{item.label}</span>{!item.enabled&&<small className="navigationSoonBadge">Soon</small>}</button>:renderLink(item))}</nav>
      {role==="admin"&&<a className="platformNavLink" href="/platform-admin"><span className="v3NavIcon"><SettingsIcon/></span><span>Platform Admin</span></a>}
      <div className="sidebarFooter v3SidebarFooter"><div className="userMini"><div className="avatar v3UserAvatar">{initials}</div><div><div className="userMiniName">{name}</div><div className="userMiniRole">{role==="club_owner"?"Club Owner":admin?"Administrator":"Coach"}</div></div></div><button className="signOut v3SignOut" onClick={onSignOut}>Sign out</button></div>
    </aside>
    {admin&&future&&<ComingSoonModule module={future} onClose={()=>setFuture(null)}/>}
  </>;
}
