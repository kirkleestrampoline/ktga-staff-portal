"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Profile = {
 id:string; full_name:string; email:string; phone:string|null; address:string|null; role:"coach"|"admin";
 hourly_rate:number; account_name:string|null; sort_code:string|null; account_number:string|null; utr:string|null; invoice_prefix:string|null;
};
type Shift={id?:string;coach_id:string;shift_date:string;start_time:string;finish_time:string;break_minutes:number;session_location:string|null;notes:string|null};
type Timesheet={id:string;coach_id:string;month_start:string;status:"draft"|"submitted"|"paid";submitted_at:string|null;paid_at:string|null};
type Invoice={id:string;coach_id:string;timesheet_id:string;invoice_number:string;invoice_date:string;hours:number;hourly_rate:number;total_amount:number;status:string};

const supabase=createClient();
const money=(n:number)=>`£${Number(n||0).toFixed(2)}`;
const monthKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthStart=(k:string)=>`${k}-01`;
const monthLabel=(k:string)=>new Date(`${k}-01T12:00:00`).toLocaleDateString("en-GB",{month:"long",year:"numeric"});
const shiftHours=(s:Shift)=>{
 const [sh,sm]=s.start_time.slice(0,5).split(":").map(Number),[fh,fm]=s.finish_time.slice(0,5).split(":").map(Number);
 let mins=(fh*60+fm)-(sh*60+sm)-Number(s.break_minutes||0); if(mins<0)mins+=1440; return Math.max(0,mins/60);
};

export default function Dashboard({initialProfile}:{initialProfile:Profile}){
 const [profile,setProfile]=useState(initialProfile);
 const [tab,setTab]=useState(profile.role==="admin"?"admin":"dashboard");
 const [month,setMonth]=useState(monthKey());
 const [shifts,setShifts]=useState<Shift[]>([]);
 const [timesheet,setTimesheet]=useState<Timesheet|null>(null);
 const [invoice,setInvoice]=useState<Invoice|null>(null);
 const [staff,setStaff]=useState<Profile[]>([]);
 const [adminRows,setAdminRows]=useState<any[]>([]);
 const [modal,setModal]=useState<null|Shift>(null);
 const [message,setMessage]=useState("");
 const [inviteOpen,setInviteOpen]=useState(false);
 const [invite,setInvite]=useState({name:"",email:"",rate:""});
 const total=useMemo(()=>shifts.reduce((a,s)=>a+shiftHours(s),0),[shifts]);

 useEffect(()=>{load();},[month,profile.id]);
 useEffect(()=>{if(profile.role==="admin") loadAdmin();},[month,profile.role]);

 async function load(){
  const from=`${month}-01`, last=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(), to=`${month}-${String(last).padStart(2,"0")}`;
  const [{data:ss},{data:ts},{data:inv}]=await Promise.all([
    supabase.from("shifts").select("*").eq("coach_id",profile.id).gte("shift_date",from).lte("shift_date",to).order("shift_date"),
    supabase.from("timesheets").select("*").eq("coach_id",profile.id).eq("month_start",from).maybeSingle(),
    supabase.from("invoices").select("*").eq("coach_id",profile.id).gte("invoice_date",from).lte("invoice_date",to).maybeSingle()
  ]);
  setShifts((ss||[]) as Shift[]); setTimesheet(ts as any); setInvoice(inv as any);
 }

 async function loadAdmin(){
  const {data:coaches}=await supabase.from("profiles").select("*").eq("role","coach").eq("is_active",true).order("full_name");
  setStaff((coaches||[]) as Profile[]);
  const rows=[];
  for(const c of (coaches||[]) as Profile[]){
    const from=`${month}-01`,last=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate(),to=`${month}-${String(last).padStart(2,"0")}`;
    const [{data:ss},{data:ts},{data:inv}]=await Promise.all([
      supabase.from("shifts").select("*").eq("coach_id",c.id).gte("shift_date",from).lte("shift_date",to),
      supabase.from("timesheets").select("*").eq("coach_id",c.id).eq("month_start",from).maybeSingle(),
      supabase.from("invoices").select("*").eq("coach_id",c.id).gte("invoice_date",from).lte("invoice_date",to).maybeSingle()
    ]);
    const h=((ss||[]) as Shift[]).reduce((a,s)=>a+shiftHours(s),0);
    rows.push({coach:c,shifts:ss||[],timesheet:ts,invoice:inv,hours:h,value:h*Number(c.hourly_rate)});
  }
  setAdminRows(rows);
 }

 async function saveShift(){
  if(!modal)return;
  if(timesheet?.status==="submitted"||timesheet?.status==="paid"){setMessage("Unsubmit the month before editing.");return}
  const payload={...modal,coach_id:profile.id};
  if(modal.id) await supabase.from("shifts").update(payload).eq("id",modal.id);
  else await supabase.from("shifts").insert(payload);
  setModal(null); await load();
 }
 async function deleteShift(){
  if(!modal?.id)return;
  if(!confirm("Delete this shift?"))return;
  await supabase.from("shifts").delete().eq("id",modal.id);setModal(null);await load();
 }
 async function repeatWeekly(){
  const dow=Number(prompt("Day of week: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun","1"));
  const start=prompt("Start time e.g. 16:30","16:30"); const finish=prompt("Finish time e.g. 21:00","21:00");
  if(start===null||finish===null||Number.isNaN(dow))return;
  const loc=prompt("Session / location","Coaching")||"";
  const [y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),rows=[];
  for(let d=1;d<=last;d++){const dt=new Date(y,m-1,d);if(dt.getDay()===dow)rows.push({coach_id:profile.id,shift_date:`${month}-${String(d).padStart(2,"0")}`,start_time:start,finish_time:finish,break_minutes:0,session_location:loc,notes:""});}
  if(rows.length) await supabase.from("shifts").insert(rows);await load();
 }
 async function copyPrevious(){
  const [y,m]=month.split("-").map(Number), prev=new Date(y,m-2,1),pk=monthKey(prev),lastPrev=new Date(prev.getFullYear(),prev.getMonth()+1,0).getDate();
  const {data:ss}=await supabase.from("shifts").select("*").eq("coach_id",profile.id).gte("shift_date",`${pk}-01`).lte("shift_date",`${pk}-${String(lastPrev).padStart(2,"0")}`);
  if(!ss?.length){setMessage("No shifts found in the previous month.");return}
  const newLast=new Date(y,m,0).getDate(),rows:any[]=[];
  for(const s of ss as Shift[]){
    const old=new Date(`${s.shift_date}T12:00:00`), dow=old.getDay(), week=Math.floor((old.getDate()-1)/7),cands=[];
    for(let d=1;d<=newLast;d++)if(new Date(y,m-1,d).getDay()===dow)cands.push(d);
    const nd=cands[Math.min(week,cands.length-1)]; if(!nd)continue;
    rows.push({coach_id:profile.id,shift_date:`${month}-${String(nd).padStart(2,"0")}`,start_time:s.start_time,finish_time:s.finish_time,break_minutes:s.break_minutes,session_location:s.session_location,notes:s.notes});
  }
  await supabase.from("shifts").insert(rows);await load();
 }
 async function submit(){
  if(!shifts.length){setMessage("Add at least one shift first.");return}
  const {data:ts,error}=await supabase.from("timesheets").upsert({coach_id:profile.id,month_start:monthStart(month),status:"submitted",submitted_at:new Date().toISOString(),paid_at:null},{onConflict:"coach_id,month_start"}).select().single();
  if(error){setMessage(error.message);return}
  const prefix=profile.invoice_prefix||profile.full_name.split(" ").map(x=>x[0]).join("").slice(0,3).toUpperCase()||"INV";
  const no=`${prefix}-${month.replace("-","")}`;
  const payload={coach_id:profile.id,timesheet_id:ts.id,invoice_number:no,invoice_date:new Date().toISOString().slice(0,10),hours:Number(total.toFixed(2)),hourly_rate:Number(profile.hourly_rate),total_amount:Number((total*Number(profile.hourly_rate)).toFixed(2)),status:"awaiting_payment"};
  await supabase.from("invoices").upsert(payload,{onConflict:"timesheet_id"});
  await load();if(profile.role==="admin")await loadAdmin();
 }
 async function unsubmit(){
  if(timesheet?.status==="paid"){setMessage("Paid months can only be reopened by admin.");return}
  if(invoice) await supabase.from("invoices").delete().eq("id",invoice.id);
  if(timesheet) await supabase.from("timesheets").update({status:"draft",submitted_at:null}).eq("id",timesheet.id);
  await load();
 }
 async function saveProfile(){
  const {error}=await supabase.from("profiles").update(profile).eq("id",profile.id);setMessage(error?error.message:"Profile saved.");
 }
 async function signOut(){await supabase.auth.signOut();window.location.href="/";}
 async function sendInvite(){
  const r=await fetch("/api/invite",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({full_name:invite.name,email:invite.email,hourly_rate:Number(invite.rate)})});
  const j=await r.json();setMessage(j.error||"Invitation sent.");if(r.ok){setInviteOpen(false);setInvite({name:"",email:"",rate:""});await loadAdmin();}
 }
 async function adminOpenCoach(row:any){
   setProfile(row.coach);setTab("calendar");await new Promise(r=>setTimeout(r,0));
 }
 async function markPaid(row:any){
  if(!row.timesheet)return;
  await supabase.from("timesheets").update({status:"paid",paid_at:new Date().toISOString()}).eq("id",row.timesheet.id);
  if(row.invoice)await supabase.from("invoices").update({status:"paid"}).eq("id",row.invoice.id);
  await loadAdmin();
 }
 async function reopenAdmin(row:any){
  if(row.invoice)await supabase.from("invoices").delete().eq("id",row.invoice.id);
  if(row.timesheet)await supabase.from("timesheets").update({status:"draft",submitted_at:null,paid_at:null}).eq("id",row.timesheet.id);
  await loadAdmin();
 }

 const months=Array.from({length:8},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()+i-5);return monthKey(d)});
 const isAdmin=initialProfile.role==="admin";
 const coachView=profile.id!==initialProfile.id;
 const locked=timesheet?.status==="submitted"||timesheet?.status==="paid";

 function Calendar(){
  const [y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),start=(new Date(y,m-1,1).getDay()+6)%7;
  return <div className="card">
   <div className="row space"><div><h2>{monthLabel(month)}</h2><div className="small">Click + to add a shift. Click an existing shift to edit or delete it.</div></div>
   {!locked&&<div className="row"><button className="btn secondary" onClick={copyPrevious}>Copy previous month</button><button className="btn secondary" onClick={repeatWeekly}>Repeating weekly shift</button></div>}</div>
   <div style={{height:14}} />
   <div className="calendar">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=><div className="dow" key={x}>{x}</div>)}{Array.from({length:start},(_,i)=><div key={"b"+i}/>)}
   {Array.from({length:last},(_,idx)=>{const d=idx+1,date=`${month}-${String(d).padStart(2,"0")}`,items=shifts.filter(s=>s.shift_date===date);return <div className="day" key={date}><span className="date">{d}</span>{!locked&&<button className="plus" onClick={()=>setModal({coach_id:profile.id,shift_date:date,start_time:"16:30",finish_time:"20:30",break_minutes:0,session_location:"",notes:""})}>+</button>}{items.map(s=><div className="chip" key={s.id} onClick={()=>!locked&&setModal(s)}>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}<br/>{s.session_location||"Shift"} · {shiftHours(s).toFixed(2)}h</div>)}</div>})}</div>
   <div className="row space" style={{marginTop:16,borderTop:"1px solid var(--border)",paddingTop:16}}><strong>Total: {total.toFixed(2)} hours · {money(total*Number(profile.hourly_rate))}</strong>
   {!coachView&&<div className="row">{timesheet?.status==="submitted"&&!timesheet.paid_at?<button className="btn danger" onClick={unsubmit}>Unsubmit & correct</button>:timesheet?.status==="paid"?<span className="pill paid">Paid</span>:<button className="btn primary" onClick={submit}>Submit month & create invoice</button>}</div>}</div>
  </div>
 }

 return <div className="shell">
  <header className="topbar"><strong>Coach Hours & Invoicing</strong><div className="row"><span>{initialProfile.full_name}</span><button className="btn secondary" onClick={signOut}>Sign out</button></div></header>
  <div className="layout"><aside className="sidebar">
   {!isAdmin&&<><button className={tab==="dashboard"?"active":""} onClick={()=>setTab("dashboard")}>Dashboard</button><button className={tab==="calendar"?"active":""} onClick={()=>setTab("calendar")}>Monthly Calendar</button><button className={tab==="invoice"?"active":""} onClick={()=>setTab("invoice")}>My Invoice</button><button className={tab==="profile"?"active":""} onClick={()=>setTab("profile")}>My Profile</button></>}
   {isAdmin&&<><button className={tab==="admin"?"active":""} onClick={()=>{setProfile(initialProfile);setTab("admin")}}>Admin Dashboard</button><button className={tab==="staff"?"active":""} onClick={()=>setTab("staff")}>Staff & Invites</button><button className={tab==="invoices"?"active":""} onClick={()=>setTab("invoices")}>Invoices</button>{coachView&&<button className="active" onClick={()=>setTab("calendar")}>Editing: {profile.full_name}</button>}</>}
  </aside><main>
   <div className="row space"><div><h1>{tab==="admin"?"Admin Dashboard":tab==="staff"?"Staff & Invites":tab==="invoices"?"Invoices":tab==="profile"?"My Profile":tab==="invoice"?"My Invoice":coachView?profile.full_name:"My Hours"}</h1><div className="sub">{coachView?"Admin editing coach record":monthLabel(month)}</div></div>{!["profile","staff"].includes(tab)&&<select style={{width:"auto"}} value={month} onChange={e=>setMonth(e.target.value)}>{months.map(x=><option key={x} value={x}>{monthLabel(x)}</option>)}</select>}</div>
   {message&&<div className="notice">{message}</div>}

   {tab==="dashboard"&&<><div className="grid grid4"><div className="card"><div className="statLabel">Hours logged</div><div className="stat">{total.toFixed(2)}</div></div><div className="card"><div className="statLabel">Hourly rate</div><div className="stat">{money(profile.hourly_rate)}</div></div><div className="card"><div className="statLabel">Invoice value</div><div className="stat">{money(total*profile.hourly_rate)}</div></div><div className="card"><div className="statLabel">Status</div><div className="stat" style={{fontSize:18}}>{timesheet?.status||"Draft"}</div></div></div><div style={{height:16}}/><Calendar/></>}
   {tab==="calendar"&&<Calendar/>}
   {tab==="invoice"&&<div className="invoice">{invoice?<><div className="row space"><div><h2>INVOICE</h2><strong>{profile.full_name}</strong><div>{profile.address}</div></div><div style={{textAlign:"right"}}><strong>{invoice.invoice_number}</strong><div>{monthLabel(month)}</div></div></div><hr/><p>Coaching services — {invoice.hours} hours @ {money(invoice.hourly_rate)}</p><h2 style={{textAlign:"right"}}>Total {money(invoice.total_amount)}</h2><p className="small">Payment: {profile.account_name} · {profile.sort_code} · {profile.account_number}</p></>:<div className="notice">Submit the month to generate an invoice.</div>}</div>}
   {tab==="profile"&&<div className="grid grid2"><div className="card"><div className="field"><label>Name / trading name</label><input value={profile.full_name} onChange={e=>setProfile({...profile,full_name:e.target.value})}/></div><div className="field"><label>Email</label><input value={profile.email||""} disabled/></div><div className="field"><label>Phone</label><input value={profile.phone||""} onChange={e=>setProfile({...profile,phone:e.target.value})}/></div><div className="field"><label>Address</label><textarea value={profile.address||""} onChange={e=>setProfile({...profile,address:e.target.value})}/></div></div><div className="card"><div className="field"><label>Account name</label><input value={profile.account_name||""} onChange={e=>setProfile({...profile,account_name:e.target.value})}/></div><div className="field"><label>Sort code</label><input value={profile.sort_code||""} onChange={e=>setProfile({...profile,sort_code:e.target.value})}/></div><div className="field"><label>Account number</label><input value={profile.account_number||""} onChange={e=>setProfile({...profile,account_number:e.target.value})}/></div><div className="field"><label>UTR (optional)</label><input value={profile.utr||""} onChange={e=>setProfile({...profile,utr:e.target.value})}/></div><button className="btn primary" onClick={saveProfile}>Save profile</button></div></div>}
   {tab==="admin"&&<><div className="grid grid4"><div className="card"><div className="statLabel">Coaches</div><div className="stat">{adminRows.length}</div></div><div className="card"><div className="statLabel">Hours</div><div className="stat">{adminRows.reduce((a,r)=>a+r.hours,0).toFixed(2)}</div></div><div className="card"><div className="statLabel">Invoices</div><div className="stat">{money(adminRows.reduce((a,r)=>a+r.value,0))}</div></div><div className="card"><div className="statLabel">Submitted</div><div className="stat">{adminRows.filter(r=>r.timesheet?.status==="submitted"||r.timesheet?.status==="paid").length}/{adminRows.length}</div></div></div><div className="card" style={{marginTop:16}}><table><thead><tr><th>Coach</th><th className="num">Hours</th><th className="num">Value</th><th>Status</th><th>Actions</th></tr></thead><tbody>{adminRows.map(r=><tr key={r.coach.id}><td>{r.coach.full_name}</td><td className="num">{r.hours.toFixed(2)}</td><td className="num">{money(r.value)}</td><td>{r.timesheet?.status||"draft"}</td><td><div className="row"><button className="btn secondary" onClick={()=>adminOpenCoach(r)}>Edit shifts</button>{r.timesheet?.status==="submitted"&&<button className="btn secondary" onClick={()=>reopenAdmin(r)}>Reopen</button>}{r.timesheet?.status==="submitted"&&<button className="btn success" onClick={()=>markPaid(r)}>Mark paid</button>}</div></td></tr>)}</tbody></table></div></>}
   {tab==="staff"&&<div className="card"><div className="row space"><h2>Staff accounts</h2><button className="btn primary" onClick={()=>setInviteOpen(true)}>+ Invite coach</button></div><table><thead><tr><th>Name</th><th>Email</th><th>Rate</th><th>Bank details</th></tr></thead><tbody>{staff.map(s=><tr key={s.id}><td>{s.full_name}</td><td>{s.email}</td><td>{money(s.hourly_rate)}</td><td>{s.account_number?`••••${s.account_number.slice(-4)}`:"Not supplied"}</td></tr>)}</tbody></table></div>}
   {tab==="invoices"&&<div className="card"><table><thead><tr><th>Coach</th><th>Invoice</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody>{adminRows.filter(r=>r.invoice).map(r=><tr key={r.invoice.id}><td>{r.coach.full_name}</td><td>{r.invoice.invoice_number}</td><td className="num">{money(r.invoice.total_amount)}</td><td>{r.invoice.status}</td></tr>)}</tbody></table></div>}
  </main></div>

  {modal&&<div className="modalBg"><div className="modal"><div className="row space"><h2>{modal.id?"Edit shift":"Add shift"}</h2><button className="btn secondary" onClick={()=>setModal(null)}>Close</button></div><div className="field"><label>Date</label><input type="date" value={modal.shift_date} onChange={e=>setModal({...modal,shift_date:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Start</label><input type="time" value={modal.start_time.slice(0,5)} onChange={e=>setModal({...modal,start_time:e.target.value})}/></div><div className="field"><label>Finish</label><input type="time" value={modal.finish_time.slice(0,5)} onChange={e=>setModal({...modal,finish_time:e.target.value})}/></div></div><div className="field"><label>Break minutes</label><input type="number" value={modal.break_minutes} onChange={e=>setModal({...modal,break_minutes:Number(e.target.value)})}/></div><div className="field"><label>Session / location</label><input value={modal.session_location||""} onChange={e=>setModal({...modal,session_location:e.target.value})}/></div><div className="row space">{modal.id?<button className="btn danger" onClick={deleteShift}>Delete shift</button>:<span/>}<button className="btn primary" onClick={saveShift}>Save shift</button></div></div></div>}
  {inviteOpen&&<div className="modalBg"><div className="modal"><div className="row space"><h2>Invite coach</h2><button className="btn secondary" onClick={()=>setInviteOpen(false)}>Close</button></div><div className="field"><label>Name</label><input value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})}/></div><div className="field"><label>Email</label><input value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/></div><div className="field"><label>Hourly rate</label><input type="number" step="0.01" value={invite.rate} onChange={e=>setInvite({...invite,rate:e.target.value})}/></div><button className="btn primary" style={{width:"100%"}} onClick={sendInvite}>Send invitation</button></div></div>}
 </div>
}
