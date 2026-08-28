"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Sidebar from "@/components/sidebar";
import StatCard from "@/components/stat-card";
import StatusPill from "@/components/status-pill";
import { CalendarIcon, CheckIcon, ClockIcon, InvoiceIcon, MenuIcon, PlusIcon, PoundIcon, SearchIcon, UsersIcon } from "@/components/icons";

type Tab="dashboard"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";
type Profile={
  id:string;full_name:string;email:string|null;phone:string|null;address:string|null;role:"coach"|"admin";
  hourly_rate:number;account_name:string|null;sort_code:string|null;account_number:string|null;utr:string|null;
  invoice_prefix:string|null;is_active:boolean;
  emergency_contact_name?:string|null;emergency_contact_phone?:string|null;
  dbs_expiry?:string|null;first_aid_expiry?:string|null;safeguarding_expiry?:string|null;qualifications?:string|null;
};
type Shift={id?:string;coach_id:string;shift_date:string;start_time:string;finish_time:string;break_minutes:number;session_location:string|null;notes:string|null};
type Timesheet={id:string;coach_id:string;month_start:string;status:"draft"|"submitted"|"paid";submitted_at:string|null;paid_at:string|null};
type Invoice={id:string;coach_id:string;timesheet_id:string;invoice_number:string;invoice_date:string;hours:number;hourly_rate:number;total_amount:number;status:"awaiting_payment"|"paid"|"cancelled";created_at?:string};
type Business={id:number;business_name:string;business_address:string|null;payment_note:string|null;cutoff_day:number};
type AdminRow={coach:Profile;hours:number;value:number;timesheet:Timesheet|null;invoice:Invoice|null};
type Audit={id:string;actor_id:string|null;subject_id:string|null;action:string;entity_type:string;entity_id:string|null;details:any;created_at:string};

const supabase=createClient();
const money=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(n||0));
const monthKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthLabel=(k:string)=>new Date(`${k}-01T12:00:00`).toLocaleDateString("en-GB",{month:"long",year:"numeric"});
const initials=(n:string)=>n.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"KT";
const monthRange=(month:string)=>{const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate();return{from:`${month}-01`,to:`${month}-${String(last).padStart(2,"0")}`}};
const shiftHours=(s:Shift)=>{const[sh,sm]=s.start_time.slice(0,5).split(":").map(Number),[fh,fm]=s.finish_time.slice(0,5).split(":").map(Number);let mins=(fh*60+fm)-(sh*60+sm)-Number(s.break_minutes||0);if(mins<0)mins+=1440;return Math.max(0,mins/60)};
const dateText=(s:string|null|undefined)=>s?new Date(`${s.slice(0,10)}T12:00:00`).toLocaleDateString("en-GB"):"—";
const cutoffDate=(month:string,day=1)=>{const[y,m]=month.split("-").map(Number);return new Date(y,m,day,23,59,59)};
const fmtStamp=(s:string)=>new Date(s).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});

export default function Dashboard({initialProfile}:{initialProfile:Profile}){
  const isAdmin=initialProfile.role==="admin";
  const [tab,setTab]=useState<Tab>("dashboard");
  const [month,setMonth]=useState(monthKey());
  const [ownProfile,setOwnProfile]=useState<Profile>(initialProfile);
  const [activeCoach,setActiveCoach]=useState<Profile>(initialProfile);
  const [shifts,setShifts]=useState<Shift[]>([]);
  const [timesheet,setTimesheet]=useState<Timesheet|null>(null);
  const [invoice,setInvoice]=useState<Invoice|null>(null);
  const [allInvoices,setAllInvoices]=useState<any[]>([]);
  const [staff,setStaff]=useState<Profile[]>([]);
  const [adminRows,setAdminRows]=useState<AdminRow[]>([]);
  const [business,setBusiness]=useState<Business>({id:1,business_name:"Kirklees Trampoline Gymnastics Academy Ltd",business_address:"",payment_note:"Payment by bank transfer",cutoff_day:1});
  const [audits,setAudits]=useState<Audit[]>([]);
  const [search,setSearch]=useState("");
  const [message,setMessage]=useState("");
  const [shiftModal,setShiftModal]=useState<Shift|null>(null);
  const [inviteOpen,setInviteOpen]=useState(false);
  const [staffEdit,setStaffEdit]=useState<Profile|null>(null);
  const [invite,setInvite]=useState({name:"",email:"",rate:""});
  const [saving,setSaving]=useState(false);

  const totalHours=useMemo(()=>shifts.reduce((a,s)=>a+shiftHours(s),0),[shifts]);
  const totalValue=totalHours*Number(activeCoach.hourly_rate||0);
  const months=Array.from({length:18},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()+i-12);return monthKey(d)});
  const locked=timesheet?.status==="submitted"||timesheet?.status==="paid";
  const overdue=new Date()>cutoffDate(month,business.cutoff_day||1)&&!timesheet?.submitted_at;
  const viewingOther=isAdmin&&activeCoach.id!==initialProfile.id;

  useEffect(()=>{void loadBusiness();void loadStaff();void loadInvoices();if(isAdmin)void loadAudits();},[]);
  useEffect(()=>{void loadCoachMonth(activeCoach.id);if(isAdmin)void loadAdmin();},[month,activeCoach.id]);
  useEffect(()=>{if(tab==="invoices")void loadInvoices();if(tab==="staff"&&isAdmin)void loadStaff();if(tab==="reports"&&isAdmin)void loadAudits();},[tab]);

  async function loadCoachMonth(coachId:string){
    const {from,to}=monthRange(month);
    const [{data:ss},{data:ts}]=await Promise.all([
      supabase.from("shifts").select("*").eq("coach_id",coachId).gte("shift_date",from).lte("shift_date",to).order("shift_date").order("start_time"),
      supabase.from("timesheets").select("*").eq("coach_id",coachId).eq("month_start",from).maybeSingle()
    ]);
    setShifts((ss||[]) as Shift[]);
    const t=(ts||null) as Timesheet|null;
    setTimesheet(t);
    if(t){
      const {data:inv}=await supabase.from("invoices").select("*").eq("timesheet_id",t.id).maybeSingle();
      setInvoice((inv||null) as Invoice|null);
    } else setInvoice(null);
  }

  async function loadStaff(){
    const{data}=await supabase.from("profiles").select("*").eq("role","coach").order("full_name");
    setStaff((data||[]) as Profile[]);
  }

  async function loadBusiness(){
    const{data}=await supabase.from("business_settings").select("*").eq("id",1).maybeSingle();
    if(data)setBusiness(data as Business);
  }

  async function loadAudits(){
    if(!isAdmin)return;
    const{data}=await supabase.from("audit_log").select("*").order("created_at",{ascending:false}).limit(100);
    setAudits((data||[]) as Audit[]);
  }

  async function loadInvoices(){
    if(isAdmin){
      const{data}=await supabase.from("invoices").select("*,profiles(full_name,email,account_name,sort_code,account_number,address)").order("invoice_date",{ascending:false}).limit(300);
      setAllInvoices(data||[]);
    }else{
      const{data}=await supabase.from("invoices").select("*").eq("coach_id",initialProfile.id).order("invoice_date",{ascending:false}).limit(120);
      setAllInvoices(data||[]);
    }
  }

  async function loadAdmin(){
    if(!isAdmin)return;
    const{from,to}=monthRange(month);
    const [{data:coaches},{data:ss},{data:ts}]=await Promise.all([
      supabase.from("profiles").select("*").eq("role","coach").eq("is_active",true).order("full_name"),
      supabase.from("shifts").select("*").gte("shift_date",from).lte("shift_date",to),
      supabase.from("timesheets").select("*").eq("month_start",from)
    ]);
    const tids=((ts||[]) as Timesheet[]).map(t=>t.id);
    let inv:Invoice[]=[];
    if(tids.length){
      const{data}=await supabase.from("invoices").select("*").in("timesheet_id",tids);
      inv=(data||[]) as Invoice[];
    }
    const rows=((coaches||[]) as Profile[]).map(c=>{
      const csh=((ss||[]) as Shift[]).filter(s=>s.coach_id===c.id);
      const h=csh.reduce((a,s)=>a+shiftHours(s),0);
      const cts=((ts||[]) as Timesheet[]).find(t=>t.coach_id===c.id)||null;
      return{coach:c,hours:h,value:h*Number(c.hourly_rate||0),timesheet:cts,invoice:cts?inv.find(i=>i.timesheet_id===cts.id)||null:null};
    });
    setAdminRows(rows);
  }

  function flash(t:string){setMessage(t);window.setTimeout(()=>setMessage(""),4500)}
  async function signOut(){await supabase.auth.signOut();window.location.href="/"}
  function selectCoach(c:Profile){setActiveCoach(c);setTab("timesheets")}
  function backToAdmin(){setActiveCoach(initialProfile)}

  async function saveOwnProfile(){
    setSaving(true);
    const p=ownProfile;
    const editable={
      full_name:p.full_name,phone:p.phone,address:p.address,account_name:p.account_name,sort_code:p.sort_code,account_number:p.account_number,utr:p.utr,invoice_prefix:p.invoice_prefix,
      emergency_contact_name:p.emergency_contact_name||null,emergency_contact_phone:p.emergency_contact_phone||null,
      dbs_expiry:p.dbs_expiry||null,first_aid_expiry:p.first_aid_expiry||null,safeguarding_expiry:p.safeguarding_expiry||null,qualifications:p.qualifications||null
    };
    const{error}=await supabase.from("profiles").update(editable).eq("id",initialProfile.id);
    setSaving(false);
    flash(error?error.message:"Profile saved.");
    if(!error){setOwnProfile({...p,...editable} as Profile);if(!isAdmin)setActiveCoach({...activeCoach,...editable} as Profile);void loadStaff()}
  }

  async function saveStaff(){
    if(!staffEdit)return;
    setSaving(true);
    const payload={
      full_name:staffEdit.full_name,phone:staffEdit.phone,address:staffEdit.address,hourly_rate:Number(staffEdit.hourly_rate||0),is_active:staffEdit.is_active,
      account_name:staffEdit.account_name,sort_code:staffEdit.sort_code,account_number:staffEdit.account_number,utr:staffEdit.utr,invoice_prefix:staffEdit.invoice_prefix,
      emergency_contact_name:staffEdit.emergency_contact_name||null,emergency_contact_phone:staffEdit.emergency_contact_phone||null,
      dbs_expiry:staffEdit.dbs_expiry||null,first_aid_expiry:staffEdit.first_aid_expiry||null,safeguarding_expiry:staffEdit.safeguarding_expiry||null,qualifications:staffEdit.qualifications||null
    };
    const{error}=await supabase.from("profiles").update(payload).eq("id",staffEdit.id);
    setSaving(false);
    flash(error?error.message:"Staff profile saved.");
    if(!error){setStaffEdit(null);void loadStaff();void loadAdmin();void loadAudits()}
  }

  async function saveBusiness(){
    setSaving(true);
    const{error}=await supabase.from("business_settings").update({
      business_name:business.business_name,business_address:business.business_address,payment_note:business.payment_note,cutoff_day:business.cutoff_day
    }).eq("id",1);
    setSaving(false);
    flash(error?error.message:"Business settings saved.");
  }

  async function sendInvite(e:FormEvent){
    e.preventDefault();setSaving(true);
    const res=await fetch("/api/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({full_name:invite.name,email:invite.email,hourly_rate:Number(invite.rate)})});
    const j=await res.json();setSaving(false);
    if(!res.ok){flash(j.error||"Could not send invitation.");return}
    flash("Invitation sent.");setInviteOpen(false);setInvite({name:"",email:"",rate:""});void loadStaff();void loadAdmin();
  }

  async function saveShift(){
    if(!shiftModal)return;
    if(locked&&!isAdmin){flash("Unsubmit the month before editing shifts.");return}
    if(timesheet?.status==="paid"){flash("Paid months are locked.");return}
    const payload={coach_id:activeCoach.id,shift_date:shiftModal.shift_date,start_time:shiftModal.start_time,finish_time:shiftModal.finish_time,break_minutes:Number(shiftModal.break_minutes||0),session_location:shiftModal.session_location,notes:shiftModal.notes};
    const result=shiftModal.id
      ? await supabase.from("shifts").update(payload).eq("id",shiftModal.id)
      : await supabase.from("shifts").insert(payload);
    if(result.error){flash(result.error.message);return}
    setShiftModal(null);await loadCoachMonth(activeCoach.id);if(isAdmin){void loadAdmin();void loadAudits()}
  }

  async function deleteShift(){
    if(!shiftModal?.id)return;
    if(!confirm("Delete this shift?"))return;
    const{error}=await supabase.from("shifts").delete().eq("id",shiftModal.id);
    if(error){flash(error.message);return}
    setShiftModal(null);void loadCoachMonth(activeCoach.id);if(isAdmin){void loadAdmin();void loadAudits()}
  }

  async function copyPrevious(){
    if(locked&&!isAdmin){flash("Unsubmit the month before changing shifts.");return}
    if(timesheet?.status==="paid"){flash("Paid months are locked.");return}
    const[y,m]=month.split("-").map(Number),pd=new Date(y,m-2,1),prev=monthKey(pd),r=monthRange(prev);
    const{data:ss}=await supabase.from("shifts").select("*").eq("coach_id",activeCoach.id).gte("shift_date",r.from).lte("shift_date",r.to);
    if(!ss?.length){flash("No shifts found in the previous month.");return}
    if(shifts.length&&!confirm("This month already contains shifts. Copy the previous month as well?"))return;
    const newLast=new Date(y,m,0).getDate(),rows:any[]=[];
    for(const s of ss as Shift[]){
      const old=new Date(`${s.shift_date}T12:00:00`),dow=old.getDay(),week=Math.floor((old.getDate()-1)/7),cand:number[]=[];
      for(let d=1;d<=newLast;d++)if(new Date(y,m-1,d).getDay()===dow)cand.push(d);
      const nd=cand[Math.min(week,cand.length-1)];
      if(nd)rows.push({coach_id:activeCoach.id,shift_date:`${month}-${String(nd).padStart(2,"0")}`,start_time:s.start_time,finish_time:s.finish_time,break_minutes:s.break_minutes,session_location:s.session_location,notes:s.notes});
    }
    const{error}=await supabase.from("shifts").insert(rows);
    flash(error?error.message:"Previous month copied.");
    void loadCoachMonth(activeCoach.id);if(isAdmin)void loadAdmin();
  }

  async function repeatWeekly(){
    if(locked&&!isAdmin){flash("Unsubmit the month before changing shifts.");return}
    if(timesheet?.status==="paid"){flash("Paid months are locked.");return}
    const dow=Number(prompt("Day of week: 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday, 0 Sunday","1"));
    if(Number.isNaN(dow))return;
    const start=prompt("Start time","16:30"),finish=prompt("Finish time","20:30");if(!start||!finish)return;
    const loc=prompt("Session / location","Coaching")||"",brk=Number(prompt("Break minutes","0")||0),[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),rows:any[]=[];
    for(let d=1;d<=last;d++)if(new Date(y,m-1,d).getDay()===dow)rows.push({coach_id:activeCoach.id,shift_date:`${month}-${String(d).padStart(2,"0")}`,start_time:start,finish_time:finish,break_minutes:brk,session_location:loc,notes:""});
    const{error}=await supabase.from("shifts").insert(rows);
    flash(error?error.message:"Weekly shifts added.");void loadCoachMonth(activeCoach.id);if(isAdmin)void loadAdmin();
  }

  async function submitMonth(){
    if(viewingOther){flash("The coach should submit their own month. You can edit it before they submit.");return}
    const{error}=await supabase.rpc("submit_own_timesheet",{p_month_start:`${month}-01`});
    flash(error?error.message:"Month submitted and invoice created.");
    if(!error){await loadCoachMonth(initialProfile.id);void loadInvoices();if(isAdmin)void loadAdmin()}
  }

  async function unsubmitMonth(){
    if(viewingOther){const row=adminRows.find(r=>r.coach.id===activeCoach.id);if(row)await reopen(row);return}
    const{error}=await supabase.rpc("unsubmit_own_timesheet",{p_month_start:`${month}-01`});
    flash(error?error.message:"Month returned to draft.");
    if(!error){await loadCoachMonth(initialProfile.id);void loadInvoices()}
  }

  async function markPaid(row:AdminRow){
    if(!row.timesheet)return;
    const{error}=await supabase.rpc("admin_mark_timesheet_paid",{p_timesheet_id:row.timesheet.id});
    flash(error?error.message:`${row.coach.full_name} marked paid.`);
    if(!error){void loadAdmin();void loadInvoices();void loadAudits()}
  }

  async function reopen(row:AdminRow){
    if(!row.timesheet)return;
    const{error}=await supabase.rpc("admin_reopen_timesheet",{p_timesheet_id:row.timesheet.id});
    flash(error?error.message:`${row.coach.full_name}'s month reopened.`);
    if(!error){void loadAdmin();if(activeCoach.id===row.coach.id)void loadCoachMonth(row.coach.id);void loadInvoices();void loadAudits()}
  }

  function pdfEscape(t:any){
    return String(t??"").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/£/g,"\\243").replace(/[^\x20-\x7E\\]/g,"-");
  }

  function downloadPDF(inv:Invoice,coach:Profile){
    const amount=money(inv.total_amount),rate=money(inv.hourly_rate);
    const address=(coach.address||"").split("\n").slice(0,4);
    const bill=(business.business_address||"").split("\n").slice(0,4);
    const lines:any[]=[
      [50,800,20,"INVOICE"],[50,775,11,coach.full_name],[50,759,9,coach.email||""],
      [410,800,11,inv.invoice_number],[410,784,9,new Date(inv.invoice_date).toLocaleDateString("en-GB")],
      [50,700,9,"Bill to:"],[50,684,11,business.business_name],
      [50,610,10,"Description"],[310,610,10,"Hours"],[385,610,10,"Rate"],[470,610,10,"Amount"],
      [50,584,10,`Coaching services - ${monthLabel(inv.invoice_date.slice(0,7))}`],[310,584,10,Number(inv.hours).toFixed(2)],[385,584,10,rate],[470,584,10,amount],
      [390,530,13,"TOTAL"],[470,530,13,amount],
      [50,465,9,"Payment details:"],[50,449,9,`${coach.account_name||""}  ${coach.sort_code||""}  ${coach.account_number||""}`],
      [50,425,8,business.payment_note||""]
    ];
    let ay=744;for(const a of address){if(a)lines.push([50,ay,9,a]);ay-=13}
    let by=668;for(const b of bill){if(b)lines.push([50,by,9,b]);by-=13}
    let content="BT\n";
    for(const[x,y,size,text]of lines.filter(x=>x[3]))content+=`/F1 ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj\n`;
    content+="ET";
    const objs:any[]=[];
    objs[1]="<< /Type /Catalog /Pages 2 0 R >>";
    objs[2]="<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
    objs[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>";
    objs[4]=`<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    objs[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    let pdf="%PDF-1.4\n",offsets=[0];
    for(let i=1;i<=5;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objs[i]}\nendobj\n`}
    const xref=pdf.length;pdf+="xref\n0 6\n0000000000 65535 f \n";
    for(let i=1;i<=5;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
    pdf+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const blob=new Blob([pdf],{type:"application/pdf"}),a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=`${inv.invoice_number}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  const submittedCount=adminRows.filter(r=>r.timesheet?.status==="submitted"||r.timesheet?.status==="paid").length;
  const unpaidTotal=adminRows.filter(r=>r.invoice&&r.invoice.status!=="paid").reduce((a,r)=>a+Number(r.invoice?.total_amount||0),0);
  const adminHours=adminRows.reduce((a,r)=>a+r.hours,0);
  const filteredStaff=staff.filter(s=>`${s.full_name} ${s.email||""}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="portal">
    <Sidebar tab={tab} setTab={(t:any)=>{setTab(t);if(t!=="timesheets")backToAdmin()}} name={initialProfile.full_name} role={initialProfile.role} onSignOut={signOut}/>
    <div className="mainWrap">
      <header className="topbar"><div className="row"><button className="iconButton mobileMenu"><MenuIcon/></button><div className="topTitle">KTGA Staff Portal</div></div><div className="topActions"><span className="muted" style={{fontSize:12}}>{initialProfile.email}</span></div></header>
      <main className="main">
        {message&&<div className={`notice ${/(saved|sent|submitted|added|copied|reopened|created|paid)/i.test(message)?"success":""}`}>{message}</div>}
        {tab==="dashboard"&&DashboardView()}
        {tab==="timesheets"&&TimesheetView()}
        {tab==="invoices"&&InvoicesView()}
        {tab==="staff"&&isAdmin&&StaffView()}
        {tab==="reports"&&isAdmin&&ReportsView()}
        {tab==="settings"&&isAdmin&&SettingsView()}
        {tab==="profile"&&ProfileView()}
      </main>
    </div>
    {shiftModal&&ShiftModal()}
    {inviteOpen&&InviteModal()}
    {staffEdit&&StaffModal()}
  </div>;

  function PageHead({title,sub,children}:{title:string;sub:string;children?:React.ReactNode}){return <div className="pageHead"><div><h1>{title}</h1><p>{sub}</p></div>{children}</div>}
  function MonthSelect(){return <select style={{width:"auto",minWidth:170}} value={month} onChange={e=>setMonth(e.target.value)}>{months.map(x=><option key={x} value={x}>{monthLabel(x)}</option>)}</select>}

  function DashboardView(){
    if(isAdmin)return <><PageHead title={`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${initialProfile.full_name.split(" ")[0]}`} sub="Your current staffing, timesheet and invoice position."><MonthSelect/></PageHead>
      <div className="grid grid4"><StatCard label="Active coaches" value={String(adminRows.length)} foot="Self-employed staff" icon={<UsersIcon/>}/><StatCard label="Hours this month" value={adminHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Submitted" value={`${submittedCount}/${adminRows.length}`} foot={`${Math.max(0,adminRows.length-submittedCount)} outstanding`} icon={<CheckIcon/>}/><StatCard label="Unpaid invoices" value={money(unpaidTotal)} foot="Awaiting payment" icon={<PoundIcon/>}/></div>
      <div className="grid grid2 section"><div className="card"><div className="sectionHeader"><div><h2>Monthly status</h2><p>Open a coach to review or edit their shifts.</p></div><button className="btn btnSecondary" onClick={()=>setTab("timesheets")}>View all</button></div><div className="tableWrap"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th>Status</th><th></th></tr></thead><tbody>{adminRows.slice(0,8).map(r=><tr key={r.coach.id}><td><strong>{r.coach.full_name}</strong></td><td className="num">{r.hours.toFixed(2)}</td><td><StatusPill status={r.timesheet?.status}/></td><td><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open</button></td></tr>)}</tbody></table></div></div>
      <div className="card"><div className="sectionHeader"><div><h2>Recent activity</h2><p>Changes recorded by the portal.</p></div></div><div className="activityList">{audits.slice(0,8).map(a=><div className="activityItem" key={a.id}><div className="activityIcon"><ClockIcon/></div><div><div className="activityText">{a.action.replaceAll("_"," ")}</div><div className="activityTime">{fmtStamp(a.created_at)}</div></div></div>)}{!audits.length&&<div className="empty">Activity will appear here as staff use the portal.</div>}</div></div></div></>;

    return <><PageHead title={`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${ownProfile.full_name.split(" ")[0]}`} sub="Your hours and invoice for this month."><MonthSelect/></PageHead>
      {overdue&&<div className="notice danger">The normal submission deadline for {monthLabel(month)} has passed. Please submit your hours as soon as possible.</div>}
      <div className="grid grid4"><StatCard label="Hours logged" value={totalHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Hourly rate" value={money(ownProfile.hourly_rate)} foot="Set by admin" icon={<PoundIcon/>}/><StatCard label="Estimated invoice" value={money(totalValue)} foot="Based on logged hours" icon={<InvoiceIcon/>}/><StatCard label="Timesheet status" value={(timesheet?.status||"Draft").replace(/^./,x=>x.toUpperCase())} foot={`Due ${business.cutoff_day||1} ${new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toLocaleDateString("en-GB",{month:"long"})}`} icon={<CalendarIcon/>}/></div>
      <div className="section">{TimesheetCalendar({compact:true})}</div></>
  }

  function TimesheetView(){
    if(isAdmin&&!viewingOther)return <><PageHead title="Timesheets" sub="Open a coach to review, add, edit or delete their shifts."><MonthSelect/></PageHead><div className="card"><div className="sectionHeader"><div><h2>{monthLabel(month)}</h2><p>{submittedCount} of {adminRows.length} coaches submitted.</p></div></div><div className="tableWrap"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th className="num">Value</th><th>Status</th><th>Actions</th></tr></thead><tbody>{adminRows.map(r=><tr key={r.coach.id}><td><strong>{r.coach.full_name}</strong><div className="muted" style={{fontSize:11}}>{r.coach.email}</div></td><td className="num">{r.hours.toFixed(2)}</td><td className="num">{money(r.value)}</td><td><StatusPill status={r.timesheet?.status}/></td><td><div className="row"><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open / edit</button>{r.timesheet?.status==="submitted"&&<><button className="btn btnSecondary" onClick={()=>reopen(r)}>Reopen</button><button className="btn btnPrimary" onClick={()=>markPaid(r)}>Mark paid</button></>}</div></td></tr>)}</tbody></table></div></div></>;

    return <><PageHead title={viewingOther?`${activeCoach.full_name}'s timesheet`:"My timesheet"} sub={viewingOther?"Admin view — reopen submitted months before changing them.":"Add, check and submit your monthly hours."}><div className="row">{viewingOther&&<button className="btn btnSecondary" onClick={backToAdmin}>← All coaches</button>}<MonthSelect/></div></PageHead>{TimesheetCalendar({})}</>
  }

  function TimesheetCalendar({compact=false}:{compact?:boolean}){
    const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),start=(new Date(y,m-1,1).getDay()+6)%7;
    const canEdit=isAdmin ? timesheet?.status!=="submitted"&&timesheet?.status!=="paid" : !locked;
    return <div className="card"><div className="calendarToolbar"><div><strong>{monthLabel(month)}</strong><div className="muted" style={{fontSize:11,marginTop:3}}>{viewingOther?`Viewing ${activeCoach.full_name}`:locked?"Submitted months are locked until unsubmitted.":"Click + on a day to add a shift."}</div></div><div className="row">{canEdit&&<><button className="btn btnSecondary" onClick={copyPrevious}>Copy previous month</button><button className="btn btnSecondary" onClick={repeatWeekly}>Repeat weekly</button></>}</div></div>
      <div className="calendarScroll"><div className="calendar">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div className="dow" key={d}>{d}</div>)}{Array.from({length:start},(_,i)=><div className="day dayBlank" key={`b${i}`}/>)}
        {Array.from({length:last},(_,i)=>{const d=i+1,date=`${month}-${String(d).padStart(2,"0")}`,items=shifts.filter(s=>s.shift_date===date);return <div className="day" key={date}><div className="dayNum">{d}</div>{canEdit&&<button className="dayAdd" onClick={()=>setShiftModal({coach_id:activeCoach.id,shift_date:date,start_time:"16:30",finish_time:"20:30",break_minutes:0,session_location:"",notes:""})}>+</button>}{items.map(s=><div className="shiftChip" key={s.id} onClick={()=>canEdit&&setShiftModal(s)}><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong><br/>{s.session_location||"Coaching"}<br/><span className="muted">{shiftHours(s).toFixed(2)}h</span></div>)}</div>})}</div></div>
      <div className="calendarFooter"><div><strong>{totalHours.toFixed(2)} hours</strong><div className="muted" style={{fontSize:11}}>{money(totalValue)} at {money(activeCoach.hourly_rate)}/hr</div></div><div className="row">
        {viewingOther?<>{timesheet?.status==="submitted"&&<button className="btn btnDanger" onClick={()=>{const r=adminRows.find(x=>x.coach.id===activeCoach.id);if(r)void reopen(r)}}>Reopen to edit</button>}{timesheet?.status==="paid"&&<span className="pill pillPaid"><span className="dot"/>Paid</span>}</>:<>
          {timesheet?.status==="submitted"&&<button className="btn btnDanger" onClick={unsubmitMonth}>Unsubmit & correct</button>}
          {timesheet?.status==="paid"?<span className="pill pillPaid"><span className="dot"/>Paid</span>:timesheet?.status!=="submitted"&&<button className="btn btnPrimary" onClick={submitMonth}>Submit month & create invoice</button>}
        </>}
      </div></div>
    </div>
  }

  function InvoicesView(){
    return <><PageHead title="Invoices" sub={isAdmin?"All generated coach invoices and payment history.":"Your generated invoice archive."}/>
      <div className="card"><div className="tableWrap"><table><thead><tr><th>Invoice</th>{isAdmin&&<th>Coach</th>}<th>Date</th><th className="num">Hours</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>{allInvoices.map((inv:any)=>{const coach=isAdmin?({...staff.find(s=>s.id===inv.coach_id),...(inv.profiles||{})} as Profile):ownProfile;return <tr key={inv.id}><td><strong>{inv.invoice_number}</strong></td>{isAdmin&&<td>{inv.profiles?.full_name||coach.full_name}</td>}<td>{dateText(inv.invoice_date)}</td><td className="num">{Number(inv.hours).toFixed(2)}</td><td className="num"><strong>{money(inv.total_amount)}</strong></td><td><StatusPill status={inv.status==="awaiting_payment"?"submitted":inv.status}/></td><td><button className="btn btnSecondary" onClick={()=>downloadPDF(inv,coach)}>Download PDF</button></td></tr>})}{!allInvoices.length&&<tr><td colSpan={isAdmin?7:6} className="empty">No invoices yet.</td></tr>}</tbody></table></div></div>
    </>
  }

  function StaffView(){
    return <><PageHead title="Staff" sub="Manage coach accounts, rates, payment details and compliance."><button className="btn btnPrimary" onClick={()=>setInviteOpen(true)}><PlusIcon/>Invite coach</button></PageHead>
      <div className="card"><div className="sectionHeader"><div className="searchBar"><SearchIcon/><input placeholder="Search staff…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="muted" style={{fontSize:12}}>{filteredStaff.length} staff</div></div><div className="tableWrap"><table><thead><tr><th>Coach</th><th className="num">Rate</th><th>Bank</th><th>DBS</th><th>First aid</th><th>Status</th><th></th></tr></thead><tbody>{filteredStaff.map(s=><tr key={s.id}><td><div className="row"><div className="avatar" style={{background:"#eef1f4",color:"#344054"}}>{initials(s.full_name)}</div><div><strong>{s.full_name||"Unnamed coach"}</strong><div className="muted" style={{fontSize:11}}>{s.email}</div></div></div></td><td className="num">{money(s.hourly_rate)}</td><td>{s.account_number?"Supplied":"Missing"}</td><td>{dateText(s.dbs_expiry)}</td><td>{dateText(s.first_aid_expiry)}</td><td><span className={`pill ${s.is_active?"pillSubmitted":"pillDraft"}`}><span className="dot"/>{s.is_active?"Active":"Inactive"}</span></td><td><div className="row"><button className="btn btnSecondary" onClick={()=>setStaffEdit({...s})}>Edit profile</button><button className="btn btnSecondary" onClick={()=>selectCoach(s)}>Timesheet</button></div></td></tr>)}</tbody></table></div></div>
    </>
  }

  function ReportsView(){
    const avg=adminRows.length?adminHours/adminRows.length:0;
    return <><PageHead title="Reports & audit" sub="Monthly staffing cost plus a trace of changes made in the portal."><MonthSelect/></PageHead>
      <div className="grid grid4"><StatCard label="Total hours" value={adminHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Estimated coach cost" value={money(adminRows.reduce((a,r)=>a+r.value,0))} foot="Hours × agreed rates" icon={<PoundIcon/>}/><StatCard label="Average hours" value={avg.toFixed(2)} foot="Per active coach" icon={<UsersIcon/>}/><StatCard label="Submission rate" value={adminRows.length?`${Math.round(submittedCount/adminRows.length*100)}%`:"0%"} foot={`${submittedCount} submitted`} icon={<CheckIcon/>}/></div>
      <div className="grid grid2 section"><div className="card"><div className="sectionHeader"><div><h2>Cost by coach</h2><p>Current selected month.</p></div></div><div className="tableWrap"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th className="num">Cost</th></tr></thead><tbody>{[...adminRows].sort((a,b)=>b.value-a.value).map(r=><tr key={r.coach.id}><td>{r.coach.full_name}</td><td className="num">{r.hours.toFixed(2)}</td><td className="num">{money(r.value)}</td></tr>)}</tbody></table></div></div>
      <div className="card"><div className="sectionHeader"><div><h2>Audit history</h2><p>Latest recorded changes.</p></div></div><div className="activityList">{audits.slice(0,30).map(a=><div className="activityItem" key={a.id}><div className="activityIcon"><ClockIcon/></div><div><div className="activityText"><strong>{a.action.replaceAll("_"," ")}</strong> · {a.entity_type}</div><div className="activityTime">{fmtStamp(a.created_at)}</div></div></div>)}{!audits.length&&<div className="empty">No recorded activity yet.</div>}</div></div></div>
    </>
  }

  function SettingsView(){
    return <><PageHead title="Business settings" sub="Details used on invoices and monthly submission."/><div className="card" style={{maxWidth:780}}>
      <div className="formSection"><div className="formSectionTitle"><h3>Organisation</h3><p>Shown on generated invoices.</p></div><div className="field"><label>Business name</label><input value={business.business_name} onChange={e=>setBusiness({...business,business_name:e.target.value})}/></div><div className="field"><label>Business address</label><textarea value={business.business_address||""} onChange={e=>setBusiness({...business,business_address:e.target.value})}/></div></div>
      <div className="formSection"><div className="formSectionTitle"><h3>Timesheets & payment</h3><p>Submission is due on this day of the following month.</p></div><div className="grid grid2"><div className="field"><label>Cut-off day</label><select value={business.cutoff_day} onChange={e=>setBusiness({...business,cutoff_day:Number(e.target.value)})}>{Array.from({length:7},(_,i)=>i+1).map(d=><option value={d} key={d}>{d}{d===1?"st":d===2?"nd":d===3?"rd":"th"} of following month</option>)}</select></div><div className="field"><label>Payment note</label><input value={business.payment_note||""} onChange={e=>setBusiness({...business,payment_note:e.target.value})}/></div></div><button className="btn btnPrimary" onClick={saveBusiness} disabled={saving}>{saving?"Saving…":"Save settings"}</button></div>
    </div></>
  }

  function ProfileView(){
    const p=ownProfile,fields=[p.full_name,p.email,p.phone,p.address,p.account_name,p.sort_code,p.account_number,p.invoice_prefix,p.emergency_contact_name,p.emergency_contact_phone],complete=Math.round(fields.filter(Boolean).length/fields.length*100);
    return <><PageHead title="My profile" sub="Personal, payment, emergency and compliance information."/><div className="card profileHero"><div className="profileAvatar">{initials(p.full_name)}</div><div><div className="profileName">{p.full_name}</div><div className="profileMeta">{p.email} · {p.role}</div></div><div className="completion"><strong>{complete}% complete</strong><div className="progress"><span style={{width:`${complete}%`}}/></div></div></div>
      <div className="grid grid2 section"><div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Personal details</h3></div><div className="field"><label>Name / trading name</label><input value={p.full_name} onChange={e=>setOwnProfile({...p,full_name:e.target.value})}/></div><div className="field"><label>Email</label><input value={p.email||""} disabled/></div><div className="field"><label>Mobile</label><input value={p.phone||""} onChange={e=>setOwnProfile({...p,phone:e.target.value})}/></div><div className="field"><label>Address</label><textarea value={p.address||""} onChange={e=>setOwnProfile({...p,address:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Emergency contact</label><input value={p.emergency_contact_name||""} onChange={e=>setOwnProfile({...p,emergency_contact_name:e.target.value})}/></div><div className="field"><label>Emergency phone</label><input value={p.emergency_contact_phone||""} onChange={e=>setOwnProfile({...p,emergency_contact_phone:e.target.value})}/></div></div></div></div>
      <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Payment details</h3><p>Used on self-employed invoices.</p></div><div className="field"><label>Account name</label><input value={p.account_name||""} onChange={e=>setOwnProfile({...p,account_name:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Sort code</label><input value={p.sort_code||""} onChange={e=>setOwnProfile({...p,sort_code:e.target.value})}/></div><div className="field"><label>Account number</label><input value={p.account_number||""} onChange={e=>setOwnProfile({...p,account_number:e.target.value})}/></div></div><div className="grid grid2"><div className="field"><label>UTR</label><input value={p.utr||""} onChange={e=>setOwnProfile({...p,utr:e.target.value})}/></div><div className="field"><label>Invoice prefix</label><input value={p.invoice_prefix||""} onChange={e=>setOwnProfile({...p,invoice_prefix:e.target.value.toUpperCase()})}/></div></div></div></div>
      <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Compliance</h3></div><div className="grid grid2"><div className="field"><label>DBS expiry</label><input type="date" value={p.dbs_expiry||""} onChange={e=>setOwnProfile({...p,dbs_expiry:e.target.value})}/></div><div className="field"><label>First Aid expiry</label><input type="date" value={p.first_aid_expiry||""} onChange={e=>setOwnProfile({...p,first_aid_expiry:e.target.value})}/></div></div><div className="field"><label>Safeguarding expiry</label><input type="date" value={p.safeguarding_expiry||""} onChange={e=>setOwnProfile({...p,safeguarding_expiry:e.target.value})}/></div><div className="field"><label>Qualifications</label><textarea placeholder="e.g. Level 2 Trampoline, DMT Module..." value={p.qualifications||""} onChange={e=>setOwnProfile({...p,qualifications:e.target.value})}/></div></div></div>
      <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Rate</h3><p>Your agreed hourly rate is controlled by admin.</p></div><div className="statValue">{money(p.hourly_rate)}</div></div></div></div>
      <div className="section"><button className="btn btnPrimary" onClick={saveOwnProfile} disabled={saving}>{saving?"Saving…":"Save profile"}</button></div>
    </>
  }

  function ShiftModal(){
    return <div className="modalBackdrop"><div className="modal"><div className="modalHead"><h2>{shiftModal?.id?"Edit shift":"Add shift"}</h2><button className="iconButton" onClick={()=>setShiftModal(null)}>×</button></div><div className="modalBody"><div className="field"><label>Date</label><input type="date" value={shiftModal!.shift_date} onChange={e=>setShiftModal({...shiftModal!,shift_date:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Start</label><input type="time" value={shiftModal!.start_time.slice(0,5)} onChange={e=>setShiftModal({...shiftModal!,start_time:e.target.value})}/></div><div className="field"><label>Finish</label><input type="time" value={shiftModal!.finish_time.slice(0,5)} onChange={e=>setShiftModal({...shiftModal!,finish_time:e.target.value})}/></div></div><div className="field"><label>Break (minutes)</label><input type="number" min={0} value={shiftModal!.break_minutes} onChange={e=>setShiftModal({...shiftModal!,break_minutes:Number(e.target.value)})}/></div><div className="field"><label>Session / location</label><input value={shiftModal!.session_location||""} onChange={e=>setShiftModal({...shiftModal!,session_location:e.target.value})}/></div><div className="field"><label>Notes</label><textarea value={shiftModal!.notes||""} onChange={e=>setShiftModal({...shiftModal!,notes:e.target.value})}/></div></div><div className="modalFoot"><div>{shiftModal?.id&&<button className="btn btnDanger" onClick={deleteShift}>Delete shift</button>}</div><div className="row"><button className="btn btnSecondary" onClick={()=>setShiftModal(null)}>Cancel</button><button className="btn btnPrimary" onClick={saveShift}>Save shift</button></div></div></div></div>
  }

  function InviteModal(){
    return <div className="modalBackdrop"><form className="modal" onSubmit={sendInvite}><div className="modalHead"><h2>Invite coach</h2><button type="button" className="iconButton" onClick={()=>setInviteOpen(false)}>×</button></div><div className="modalBody"><div className="field"><label>Full name</label><input value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})} required/></div><div className="field"><label>Email</label><input type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})} required/></div><div className="field"><label>Hourly rate</label><input type="number" min={0} step="0.01" value={invite.rate} onChange={e=>setInvite({...invite,rate:e.target.value})} required/></div><div className="notice">Real invite emails require the server-only <strong>SUPABASE_SECRET_KEY</strong> in your <code>.env.local</code>.</div></div><div className="modalFoot"><span/><button className="btn btnPrimary" disabled={saving}>{saving?"Sending…":"Send invitation"}</button></div></form></div>
  }

  function StaffModal(){
    const s=staffEdit!;
    return <div className="modalBackdrop"><div className="modal modalWide"><div className="modalHead"><h2>Edit {s.full_name}</h2><button className="iconButton" onClick={()=>setStaffEdit(null)}>×</button></div><div className="modalBody">
      <div className="grid grid2"><div className="field"><label>Name</label><input value={s.full_name} onChange={e=>setStaffEdit({...s,full_name:e.target.value})}/></div><div className="field"><label>Hourly rate</label><input type="number" step="0.01" value={s.hourly_rate} onChange={e=>setStaffEdit({...s,hourly_rate:Number(e.target.value)})}/></div></div>
      <div className="grid grid2"><div className="field"><label>Phone</label><input value={s.phone||""} onChange={e=>setStaffEdit({...s,phone:e.target.value})}/></div><div className="field"><label>Status</label><select value={s.is_active?"active":"inactive"} onChange={e=>setStaffEdit({...s,is_active:e.target.value==="active"})}><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div>
      <div className="field"><label>Address</label><textarea value={s.address||""} onChange={e=>setStaffEdit({...s,address:e.target.value})}/></div>
      <div className="grid grid2"><div className="field"><label>Emergency contact</label><input value={s.emergency_contact_name||""} onChange={e=>setStaffEdit({...s,emergency_contact_name:e.target.value})}/></div><div className="field"><label>Emergency phone</label><input value={s.emergency_contact_phone||""} onChange={e=>setStaffEdit({...s,emergency_contact_phone:e.target.value})}/></div></div>
      <div className="grid grid2"><div className="field"><label>Account name</label><input value={s.account_name||""} onChange={e=>setStaffEdit({...s,account_name:e.target.value})}/></div><div className="field"><label>UTR</label><input value={s.utr||""} onChange={e=>setStaffEdit({...s,utr:e.target.value})}/></div></div>
      <div className="grid grid2"><div className="field"><label>Sort code</label><input value={s.sort_code||""} onChange={e=>setStaffEdit({...s,sort_code:e.target.value})}/></div><div className="field"><label>Account number</label><input value={s.account_number||""} onChange={e=>setStaffEdit({...s,account_number:e.target.value})}/></div></div>
      <div className="grid grid3"><div className="field"><label>DBS expiry</label><input type="date" value={s.dbs_expiry||""} onChange={e=>setStaffEdit({...s,dbs_expiry:e.target.value})}/></div><div className="field"><label>First Aid</label><input type="date" value={s.first_aid_expiry||""} onChange={e=>setStaffEdit({...s,first_aid_expiry:e.target.value})}/></div><div className="field"><label>Safeguarding</label><input type="date" value={s.safeguarding_expiry||""} onChange={e=>setStaffEdit({...s,safeguarding_expiry:e.target.value})}/></div></div>
      <div className="field"><label>Qualifications</label><textarea value={s.qualifications||""} onChange={e=>setStaffEdit({...s,qualifications:e.target.value})}/></div>
    </div><div className="modalFoot"><span/><div className="row"><button className="btn btnSecondary" onClick={()=>setStaffEdit(null)}>Cancel</button><button className="btn btnPrimary" onClick={saveStaff} disabled={saving}>{saving?"Saving…":"Save staff"}</button></div></div></div></div>
  }
}
