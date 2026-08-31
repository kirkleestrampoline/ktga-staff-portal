"use client";

import { CalendarIcon, ChartIcon, ClockIcon, HomeIcon, InvoiceIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons";

type Tab = "dashboard"|"schedule"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";

export default function Sidebar({tab,setTab,name,role,onSignOut,mobileOpen,onClose}:{tab:Tab;setTab:(t:Tab)=>void;name:string;role:string;onSignOut:()=>void;mobileOpen:boolean;onClose:()=>void}) {
  const admin = role === "admin" || role === "org_admin";
  const userInitials = name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase() || "AV";
  const adminItems:{id:Tab;label:string;icon:any}[] = [
    {id:"dashboard",label:"Dashboard",icon:HomeIcon},
    {id:"schedule",label:"Schedule & Staffing",icon:CalendarIcon},
    {id:"timesheets",label:"Timesheets",icon:ClockIcon},
    {id:"invoices",label:"Invoices",icon:InvoiceIcon},
    {id:"staff",label:"Staff",icon:UsersIcon},
    {id:"reports",label:"Reports",icon:ChartIcon},
    {id:"settings",label:"Settings",icon:SettingsIcon},
    {id:"profile",label:"My Profile",icon:UserIcon},
  ];
  const coachItems:{id:Tab;label:string;icon:any}[] = [
    {id:"schedule",label:"My Schedule",icon:CalendarIcon},
    {id:"timesheets",label:"My Timesheet",icon:ClockIcon},
    {id:"invoices",label:"My Payslips",icon:InvoiceIcon},
    {id:"profile",label:"My Profile",icon:UserIcon},
  ];
  const items=admin?adminItems:coachItems;
  function choose(id:Tab){setTab(id);onClose()}
  return <>
    <button aria-label="Close menu" className={`mobileScrim ${mobileOpen?"show":""}`} onClick={onClose}/>
    <aside className={`sidebar ${mobileOpen?"mobileOpen":""}`}>
      <div className="brandRow">
        <div className="brand"><div className="brandMark">AV</div><div><div className="brandTitle">AV Gymnastics Solutions</div><div className="brandSub">{admin?"Admin & staffing portal":"My coaching portal"}</div></div></div>
        <button className="sidebarClose" aria-label="Close menu" onClick={onClose}>×</button>
      </div>
      <nav className="nav">
        <div className="navLabel">{admin?"Workspace":"My Work"}</div>
        {items.map(({id,label,icon:Icon})=><button key={id} className={`navButton ${tab===id?"active":""}`} onClick={()=>choose(id)}><Icon/>{label}</button>)}
      </nav>
      <div className="sidebarFooter">
        <div className="userMini"><div className="avatar">{userInitials}</div><div><div className="userMiniName">{name}</div><div className="userMiniRole">{admin?"Administrator":"Coach"}</div></div></div>
        <button className="signOut" onClick={onSignOut}>Sign out</button>
      </div>
    </aside>
  </>;
}
