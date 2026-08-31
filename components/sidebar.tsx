"use client";

import { CalendarIcon, ChartIcon, ClockIcon, HomeIcon, InvoiceIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons";
import AvLogo from "./av-logo";

type Tab="dashboard"|"schedule"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";

export default function Sidebar({tab,setTab,name,role,onSignOut,mobileOpen,onClose}:{tab:Tab;setTab:(t:Tab)=>void;name:string;role:string;onSignOut:()=>void;mobileOpen:boolean;onClose:()=>void}){
  const admin=role==="admin"||role==="org_admin";
  const initials=name.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"AV";
  const adminItems:{id:Tab;label:string;icon:any}[]=[
    {id:"dashboard",label:"Overview",icon:HomeIcon},
    {id:"schedule",label:"Schedule",icon:CalendarIcon},
    {id:"timesheets",label:"Payroll",icon:ClockIcon},
    {id:"invoices",label:"Invoices",icon:InvoiceIcon},
    {id:"staff",label:"People",icon:UsersIcon},
    {id:"reports",label:"Reports",icon:ChartIcon},
    {id:"settings",label:"Settings",icon:SettingsIcon},
    {id:"profile",label:"My Profile",icon:UserIcon},
  ];
  const coachItems:{id:Tab;label:string;icon:any}[]=[
    {id:"schedule",label:"My Schedule",icon:CalendarIcon},
    {id:"timesheets",label:"My Timesheet",icon:ClockIcon},
    {id:"invoices",label:"My Payslips",icon:InvoiceIcon},
    {id:"profile",label:"My Profile",icon:UserIcon},
  ];
  const items=admin?adminItems:coachItems;
  const choose=(id:Tab)=>{setTab(id);onClose()};
  return <>
    <button aria-label="Close menu" className={`mobileScrim ${mobileOpen?"show":""}`} onClick={onClose}/>
    <aside className={`sidebar v3Sidebar ${mobileOpen?"mobileOpen":""}`}>
      <div className="v3SidebarBrand"><AvLogo size={43} showWordmark inverse/><button className="sidebarClose" aria-label="Close menu" onClick={onClose}>×</button></div>
      <nav className="nav v3Nav"><div className="navLabel">{admin?"Workspace":"My coaching"}</div>{items.map(({id,label,icon:Icon})=><button key={id} className={`navButton ${tab===id?"active":""}`} onClick={()=>choose(id)}><span className="v3NavIcon"><Icon/></span><span>{label}</span></button>)}</nav>
      <div className="sidebarFooter v3SidebarFooter"><div className="userMini"><div className="avatar v3UserAvatar">{initials}</div><div><div className="userMiniName">{name}</div><div className="userMiniRole">{admin?"Administrator":"Coach"}</div></div></div><button className="signOut v3SignOut" onClick={onSignOut}>Sign out</button></div>
    </aside>
  </>;
}
