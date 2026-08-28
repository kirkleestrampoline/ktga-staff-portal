"use client";

import { ChartIcon, ClockIcon, HomeIcon, InvoiceIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons";

type Tab = "dashboard"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";
export default function Sidebar({tab,setTab,name,role,onSignOut}:{tab:Tab;setTab:(t:Tab)=>void;name:string;role:string;onSignOut:()=>void}) {
  const admin = role === "admin";
  const initials = name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "KT";
  const items:{id:Tab;label:string;icon:any;admin?:boolean}[] = [
    {id:"dashboard",label:"Dashboard",icon:HomeIcon},
    {id:"timesheets",label:"Timesheets",icon:ClockIcon},
    {id:"invoices",label:"Invoices",icon:InvoiceIcon},
    {id:"staff",label:"Staff",icon:UsersIcon,admin:true},
    {id:"reports",label:"Reports",icon:ChartIcon,admin:true},
    {id:"settings",label:"Business settings",icon:SettingsIcon,admin:true},
    {id:"profile",label:"My profile",icon:UserIcon},
  ];
  return <aside className="sidebar">
    <div className="brand"><div className="brandMark">KT</div><div className="brandTitle">KTGA Staff Portal</div><div className="brandSub">Staff administration</div></div>
    <nav className="nav">
      <div className="navLabel">Workspace</div>
      {items.filter(i=>!i.admin||admin).map(({id,label,icon:Icon})=><button key={id} className={`navButton ${tab===id?"active":""}`} onClick={()=>setTab(id)}><Icon/>{label}</button>)}
    </nav>
    <div className="sidebarFooter">
      <div className="userMini"><div className="avatar">{initials}</div><div><div className="userMiniName">{name}</div><div className="userMiniRole">{role}</div></div></div>
      <button className="signOut" onClick={onSignOut}>Sign out</button>
    </div>
  </aside>;
}
