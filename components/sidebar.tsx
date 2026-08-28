"use client";

import { ChartIcon, ClockIcon, HomeIcon, InvoiceIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons";

type Tab = "dashboard"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";

export default function Sidebar({tab,setTab,name,role,onSignOut,mobileOpen,onClose}:{tab:Tab;setTab:(t:Tab)=>void;name:string;role:string;onSignOut:()=>void;mobileOpen:boolean;onClose:()=>void}) {
  const admin = role === "admin";
  const userInitials = name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "AV";
  const items:{id:Tab;label:string;icon:any;admin?:boolean}[] = [
    {id:"dashboard",label:"Dashboard",icon:HomeIcon},
    {id:"timesheets",label:"Timesheets",icon:ClockIcon},
    {id:"invoices",label:"Invoices",icon:InvoiceIcon},
    {id:"staff",label:"Staff",icon:UsersIcon,admin:true},
    {id:"reports",label:"Reports",icon:ChartIcon,admin:true},
    {id:"settings",label:"Invoice settings",icon:SettingsIcon,admin:true},
    {id:"profile",label:"My profile",icon:UserIcon},
  ];
  function choose(id:Tab){setTab(id);onClose()}
  return <>
    <button aria-label="Close menu" className={`mobileScrim ${mobileOpen?"show":""}`} onClick={onClose}/>
    <aside className={`sidebar ${mobileOpen?"mobileOpen":""}`}>
      <div className="brandRow">
        <div className="brand"><div className="brandMark">AV</div><div><div className="brandTitle">AV Gymnastics Solutions</div><div className="brandSub">Staff & coaching portal</div></div></div>
        <button className="sidebarClose" aria-label="Close menu" onClick={onClose}>×</button>
      </div>
      <nav className="nav">
        <div className="navLabel">Workspace</div>
        {items.filter(i=>!i.admin||admin).map(({id,label,icon:Icon})=><button key={id} className={`navButton ${tab===id?"active":""}`} onClick={()=>choose(id)}><Icon/>{label}</button>)}
      </nav>
      <div className="sidebarFooter">
        <div className="userMini"><div className="avatar">{userInitials}</div><div><div className="userMiniName">{name}</div><div className="userMiniRole">{role}</div></div></div>
        <button className="signOut" onClick={onSignOut}>Sign out</button>
      </div>
    </aside>
  </>;
}
