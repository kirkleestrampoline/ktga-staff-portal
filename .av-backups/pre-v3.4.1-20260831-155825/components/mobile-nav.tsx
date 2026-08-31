"use client";

import { CalendarIcon, ChartIcon, ClockIcon, HomeIcon, InvoiceIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons";

type Tab = "dashboard"|"schedule"|"leave"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";
type Props={tab:Tab;setTab:(t:Tab)=>void;role:string;name:string;open:boolean;setOpen:(v:boolean)=>void;onSignOut:()=>void};

export default function MobileNav({tab,setTab,role,name,open,setOpen,onSignOut}:Props){
  const admin=role==="admin"||role==="org_admin";
  const choose=(t:Tab)=>{setTab(t);setOpen(false)};
  if(!admin)return <>
    <nav className="mobileBottomNav coachMobileNav" aria-label="Mobile navigation">
      <button className={tab==="schedule"?"active":""} onClick={()=>choose("schedule")}><CalendarIcon/><span>Schedule</span></button>
      <button className={tab==="timesheets"?"active":""} onClick={()=>choose("timesheets")}><ClockIcon/><span>Timesheet</span></button>
      <button className={tab==="leave"?"active":""} onClick={()=>choose("leave")}><ClockIcon/><span>Leave</span></button>
      <button className={tab==="profile"?"active":""} onClick={()=>choose("profile")}><UserIcon/><span>Profile</span></button>
      <button className={open?"active":""} onClick={()=>setOpen(!open)}><span className="moreGlyph">•••</span><span>More</span></button>
    </nav>
    {open&&<button className="mobileMoreScrim" aria-label="Close more menu" onClick={()=>setOpen(false)}/>}
    <section className={`mobileMoreSheet ${open?"open":""}`} aria-hidden={!open}>
      <div className="mobileMoreHandle"/>
      <div className="mobileMoreHead"><div><strong>My Coaching</strong><span>{name}</span></div><button onClick={()=>setOpen(false)} aria-label="Close">×</button></div>
      <div className="mobileMoreLinks">
        <button onClick={()=>choose("schedule")}><CalendarIcon/><span><strong>My Schedule</strong><small>Today, week and month rota</small></span></button>
        <button onClick={()=>choose("timesheets")}><ClockIcon/><span><strong>My Timesheet</strong><small>Confirmed and approved work</small></span></button>
        <button onClick={()=>choose("leave")}><ClockIcon/><span><strong>Leave & Availability</strong><small>Requests and unavailable dates</small></span></button>
        <button onClick={()=>choose("invoices")}><InvoiceIcon/><span><strong>My Payslips</strong><small>Monthly pay history</small></span></button>
        <button onClick={()=>choose("profile")}><UserIcon/><span><strong>My Profile</strong><small>Personal and payment details</small></span></button>
      </div>
      <button className="mobileSignOut" onClick={onSignOut}>Sign out</button>
    </section>
  </>;

  return <>
    <nav className="mobileBottomNav" aria-label="Mobile navigation">
      <button className={tab==="dashboard"?"active":""} onClick={()=>choose("dashboard")}><HomeIcon/><span>Overview</span></button>
      <button className={tab==="schedule"?"active":""} onClick={()=>choose("schedule")}><CalendarIcon/><span>Schedule</span></button>
      <button className={tab==="timesheets"?"active":""} onClick={()=>choose("timesheets")}><ClockIcon/><span>Payroll</span></button>
      <button className={tab==="staff"?"active":""} onClick={()=>choose("staff")}><UsersIcon/><span>People</span></button>
      <button className={open||(["leave","invoices","reports","settings","profile"] as string[]).includes(tab)?"active":""} onClick={()=>setOpen(!open)}><span className="moreGlyph">•••</span><span>More</span></button>
    </nav>
    {open&&<button className="mobileMoreScrim" aria-label="Close more menu" onClick={()=>setOpen(false)}/>}
    <section className={`mobileMoreSheet ${open?"open":""}`} aria-hidden={!open}>
      <div className="mobileMoreHandle"/>
      <div className="mobileMoreHead"><div><strong>AV Gymnastics</strong><span>{name}</span></div><button onClick={()=>setOpen(false)} aria-label="Close">×</button></div>
      <div className="mobileMoreLinks">
        <button onClick={()=>choose("leave")}><ClockIcon/><span><strong>Leave Management</strong><small>Approve leave and availability</small></span></button>
        <button onClick={()=>choose("invoices")}><InvoiceIcon/><span><strong>Invoices</strong><small>Coach invoices and payment history</small></span></button>
        <button onClick={()=>choose("reports")}><ChartIcon/><span><strong>Reports</strong><small>Hours and costs</small></span></button>
        <button onClick={()=>choose("settings")}><SettingsIcon/><span><strong>Settings</strong><small>Portal and invoice settings</small></span></button>
        <button onClick={()=>choose("profile")}><UserIcon/><span><strong>My Profile</strong><small>Personal and payment details</small></span></button>
      </div>
      <button className="mobileSignOut" onClick={onSignOut}>Sign out</button>
    </section>
  </>;
}
