"use client";

import { ChartIcon, ClockIcon, HomeIcon, InvoiceIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons";

type Tab = "dashboard"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";

type Props = {
  tab: Tab;
  setTab: (t:Tab)=>void;
  role: string;
  name: string;
  open: boolean;
  setOpen: (v:boolean)=>void;
  onSignOut: ()=>void;
};

export default function MobileNav({tab,setTab,role,name,open,setOpen,onSignOut}:Props){
  const admin=role==="admin"||role==="org_admin";
  const choose=(t:Tab)=>{setTab(t);setOpen(false)};
  return <>
    <nav className="mobileBottomNav" aria-label="Mobile navigation">
      <button className={tab==="dashboard"?"active":""} onClick={()=>choose("dashboard")}><HomeIcon/><span>Home</span></button>
      <button className={tab==="timesheets"?"active":""} onClick={()=>choose("timesheets")}><ClockIcon/><span>Hours</span></button>
      <button className={tab==="invoices"?"active":""} onClick={()=>choose("invoices")}><InvoiceIcon/><span>Invoices</span></button>
      <button className={tab==="profile"?"active":""} onClick={()=>choose("profile")}><UserIcon/><span>Profile</span></button>
      <button className={open||(["staff","reports","settings"] as string[]).includes(tab)?"active":""} onClick={()=>setOpen(!open)} aria-expanded={open}><span className="moreGlyph">•••</span><span>More</span></button>
    </nav>
    {open&&<button className="mobileMoreScrim" aria-label="Close more menu" onClick={()=>setOpen(false)}/>}
    <section className={`mobileMoreSheet ${open?"open":""}`} aria-hidden={!open}>
      <div className="mobileMoreHandle"/>
      <div className="mobileMoreHead"><div><strong>AV Gymnastics Solutions</strong><span>{name}</span></div><button onClick={()=>setOpen(false)} aria-label="Close">×</button></div>
      <div className="mobileMoreLinks">
        {admin&&<button onClick={()=>choose("staff")}><UsersIcon/><span><strong>Staff</strong><small>People, venues and rates</small></span></button>}
        {admin&&<button onClick={()=>choose("reports")}><ChartIcon/><span><strong>Reports</strong><small>Hours and costs by venue</small></span></button>}
        {admin&&<button onClick={()=>choose("settings")}><SettingsIcon/><span><strong>Settings</strong><small>Invoice and submission settings</small></span></button>}
        <button onClick={()=>choose("profile")}><UserIcon/><span><strong>My profile</strong><small>Personal and payment details</small></span></button>
      </div>
      <button className="mobileSignOut" onClick={onSignOut}>Sign out</button>
    </section>
  </>;
}
