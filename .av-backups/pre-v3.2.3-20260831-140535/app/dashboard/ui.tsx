"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";
import StatCard from "@/components/stat-card";
import StatusPill from "@/components/status-pill";
import AvLogo from "@/components/av-logo";
import { CalendarIcon, ChartIcon, CheckIcon, ClockIcon, InvoiceIcon, MenuIcon, PlusIcon, PoundIcon, SearchIcon, UsersIcon } from "@/components/icons";

type Tab="dashboard"|"schedule"|"timesheets"|"invoices"|"staff"|"reports"|"settings"|"profile";
type Profile={
  id:string;full_name:string;email:string|null;phone:string|null;address:string|null;role:"coach"|"org_admin"|"admin";
  hourly_rate:number;account_name:string|null;sort_code:string|null;account_number:string|null;utr:string|null;
  invoice_prefix:string|null;is_active:boolean;
  emergency_contact_name?:string|null;emergency_contact_phone?:string|null;
  dbs_expiry?:string|null;first_aid_expiry?:string|null;safeguarding_expiry?:string|null;qualifications?:string|null;
  job_title?:string|null;employment_status?:string|null;start_date?:string|null;payroll_id?:string|null;
  last_login_at?:string|null;force_password_reset?:boolean|null;password_changed_at?:string|null;admin_notes?:string|null;
};
type Venue={id:string;name:string;slug:string;active:boolean;brand_color:string|null;legal_name?:string|null;invoice_address?:string|null;invoice_prefix?:string|null;payment_note?:string|null};
type ShiftTemplate={id:string;profile_id:string;venue_id:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;session_location:string|null;notes:string|null;active:boolean};
type Shift={id?:string;coach_id:string;shift_date:string;start_time:string;finish_time:string;break_minutes:number;venue_id?:string|null;session_location:string|null;notes:string|null;source?:string|null;approval_status?:"pending"|"approved"|"rejected"|null;scheduled_shift_id?:string|null};
type Timesheet={id:string;coach_id:string;month_start:string;status:"draft"|"submitted"|"paid";submitted_at:string|null;paid_at:string|null;submitted_by?:string|null};
type Invoice={id:string;coach_id:string;timesheet_id:string;venue_id?:string|null;invoice_number:string;invoice_date:string;hours:number;hourly_rate:number;total_amount:number;status:"awaiting_payment"|"paid"|"cancelled";created_at?:string};
type Business={id:number;business_name:string;business_address:string|null;payment_note:string|null;cutoff_day:number};
type AdminRow={coach:Profile;hours:number;value:number;timesheet:Timesheet|null;invoice:Invoice|null};
type Audit={id:string;actor_id:string|null;subject_id:string|null;action:string;entity_type:string;entity_id:string|null;details:any;created_at:string};
type ClassTemplate={id:string;venue_id:string;name:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;coaches_required:number;active:boolean;notes:string|null};
type ClassStaffingSlot={id:string;class_id:string;slot_number:number;default_profile_id:string|null};
type ScheduledShift={id:string;class_id:string|null;staffing_slot_id:string|null;venue_id:string;profile_id:string|null;original_profile_id:string|null;shift_date:string;start_time:string;finish_time:string;break_minutes:number;class_name:string;status:"scheduled"|"confirmed"|"cancelled";actual_shift_id:string|null;notes:string|null;adjustment_status?:"none"|"pending"|null;requested_start_time?:string|null;requested_finish_time?:string|null;requested_break_minutes?:number|null;adjustment_reason?:string|null};
type RemovedOccurrence={class_id:string;shift_date:string;class_name:string;venue_id:string;start_time:string;finish_time:string;removed_slots:number};
type ClassOccurrenceDraft={key:string;id?:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;coaches_required:number;coach_ids:string[];notes:string};
type ClassDraft={id?:string;original_ids?:string[];venue_id:string;name:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;coaches_required:number;notes:string;coach_ids:string[];occurrences?:ClassOccurrenceDraft[]};

const supabase=createClient();
const money=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(n||0));
const monthKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const monthLabel=(k:string)=>new Date(`${k}-01T12:00:00`).toLocaleDateString("en-GB",{month:"long",year:"numeric"});
const initials=(n:string)=>n.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"AV";
const monthRange=(month:string)=>{const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate();return{from:`${month}-01`,to:`${month}-${String(last).padStart(2,"0")}`}};
const shiftHours=(s:Shift)=>{const[sh,sm]=s.start_time.slice(0,5).split(":").map(Number),[fh,fm]=s.finish_time.slice(0,5).split(":").map(Number);let mins=(fh*60+fm)-(sh*60+sm)-Number(s.break_minutes||0);if(mins<0)mins+=1440;return Math.max(0,mins/60)};
const dateText=(s:string|null|undefined)=>s?new Date(`${s.slice(0,10)}T12:00:00`).toLocaleDateString("en-GB"):"—";
const cutoffDate=(month:string,day=1)=>{const[y,m]=month.split("-").map(Number);return new Date(y,m,day,23,59,59)};
const fmtStamp=(s:string)=>new Date(s).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});

export default function Dashboard({initialProfile}:{initialProfile:Profile}){
  const isGlobalAdmin=initialProfile.role==="admin";
  const isAdmin=initialProfile.role==="admin"||initialProfile.role==="org_admin";
  const [tab,setTab]=useState<Tab>(
    initialProfile.role==="admin"||initialProfile.role==="org_admin"?"dashboard":"schedule"
  );
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
  const [venueFilter,setVenueFilter]=useState("");
  const [message,setMessage]=useState("");
  const [shiftModal,setShiftModal]=useState<Shift|null>(null);
  const [inviteOpen,setInviteOpen]=useState(false);
  const [staffEdit,setStaffEdit]=useState<Profile|null>(null);
  const [invite,setInvite]=useState({name:"",email:"",rate:""});
  const [saving,setSaving]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [mobileMoreOpen,setMobileMoreOpen]=useState(false);
  const [venues,setVenues]=useState<Venue[]>([]);
  const [staffVenueMap,setStaffVenueMap]=useState<Record<string,string[]>>({});
  const [ownVenueIds,setOwnVenueIds]=useState<string[]>([]);
  const [staffEditVenueIds,setStaffEditVenueIds]=useState<string[]>([]);
  const [inviteVenueIds,setInviteVenueIds]=useState<string[]>([]);
  const [adminMonthShifts,setAdminMonthShifts]=useState<Shift[]>([]);
  const [templates,setTemplates]=useState<ShiftTemplate[]>([]);
  const [templateOpen,setTemplateOpen]=useState(false);
  const [auditOpen,setAuditOpen]=useState(false);
  const [staffEditAdminVenueIds,setStaffEditAdminVenueIds]=useState<string[]>([]);
  const [inviteRole,setInviteRole]=useState<"coach"|"org_admin">("coach");
  const [venueDrafts,setVenueDrafts]=useState<Record<string,Venue>>({});
  const [managedVenueIds,setManagedVenueIds]=useState<string[]>([]);
  const [classes,setClasses]=useState<ClassTemplate[]>([]);
  const [classSlots,setClassSlots]=useState<ClassStaffingSlot[]>([]);
  const [scheduledShifts,setScheduledShifts]=useState<ScheduledShift[]>([]);
  const [classModal,setClassModal]=useState<ClassDraft|null>(null);
  const [scheduleFilter,setScheduleFilter]=useState("");
  const [resetConfirm,setResetConfirm]=useState("");
  const [resetRemoveStaff,setResetRemoveStaff]=useState(false);
  const [resetBusy,setResetBusy]=useState(false);
  const [scheduleView,setScheduleView]=useState<"calendar"|"agenda">("calendar");
  const [dragShiftId,setDragShiftId]=useState<string|null>(null);
  const [rotaView,setRotaView]=useState<"month"|"week"|"day">("day");
  const [rotaDate,setRotaDate]=useState(new Date().toISOString().slice(0,10));
  const [adjustShift,setAdjustShift]=useState<ScheduledShift|null>(null);
  const [confirmShift,setConfirmShift]=useState<ScheduledShift|null>(null);
  const [adjustStart,setAdjustStart]=useState("");
  const [adjustFinish,setAdjustFinish]=useState("");
  const [adjustBreak,setAdjustBreak]=useState(0);
  const [adjustReason,setAdjustReason]=useState("");
  const [adminPersonalRota,setAdminPersonalRota]=useState(false);
  const [adminScheduleShift,setAdminScheduleShift]=useState<ScheduledShift|null>(null);
  const [pendingExtraShifts,setPendingExtraShifts]=useState<Shift[]>([]);
  const [monthActionsOpen,setMonthActionsOpen]=useState(false);
  const [removedOccurrences,setRemovedOccurrences]=useState<RemovedOccurrence[]>([]);
  const [staffPanel,setStaffPanel]=useState<"profile"|"employment"|"security"|"notes">("profile");
  const [newPassword,setNewPassword]=useState("");
  const [confirmNewPassword,setConfirmNewPassword]=useState("");
  const [passwordBusy,setPasswordBusy]=useState(false);
  const [temporaryPassword,setTemporaryPassword]=useState("");
  const [temporaryPasswordConfirm,setTemporaryPasswordConfirm]=useState("");
  const [forceTempPasswordChange,setForceTempPasswordChange]=useState(true);
  const [temporaryPasswordBusy,setTemporaryPasswordBusy]=useState(false);

  const totalHours=useMemo(()=>shifts.filter(s=>!s.approval_status||s.approval_status==="approved").reduce((a,s)=>a+shiftHours(s),0),[shifts]);
  const totalValue=totalHours*Number(activeCoach.hourly_rate||0);
  const changeMonth=(delta:number)=>{
    const [y,m]=month.split("-").map(Number);
    const d=new Date(y,m-1+delta,1);
    setMonth(monthKey(d));
  };
  const locked=timesheet?.status==="submitted"||timesheet?.status==="paid";
  const overdue=new Date()>cutoffDate(month,business.cutoff_day||1)&&!timesheet?.submitted_at;
  const viewingOther=isAdmin&&activeCoach.id!==initialProfile.id;

  useEffect(()=>{void loadBusiness();void loadVenues();void loadStaff();void loadInvoices();if(isAdmin)void loadAudits();},[]);
  useEffect(()=>{void loadCoachMonth(activeCoach.id);void loadTemplates(activeCoach.id);void loadSchedule();if(isAdmin){void loadAdmin();void loadPendingExtraShifts()}},[month,activeCoach.id]);
  useEffect(()=>{if(tab==="invoices")void loadInvoices();if(tab==="staff"&&isAdmin)void loadStaff();if(tab==="reports"&&isAdmin)void loadAudits();if(tab==="schedule"){void loadSchedule();if(isAdmin)void loadPendingExtraShifts()}},[tab]);

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
      const {data:inv}=await supabase.from("invoices").select("*").eq("timesheet_id",t.id).limit(1).maybeSingle();
      setInvoice((inv||null) as Invoice|null);
    } else setInvoice(null);
  }

  async function loadVenues(){
    const{data}=await supabase.from("venues").select("*").eq("active",true).order("name");
    setVenues((data||[]) as Venue[]);
    setVenueDrafts(Object.fromEntries(((data||[]) as Venue[]).map(v=>[v.id,{...v}])));
    const{data:links}=await supabase.from("staff_venues").select("profile_id,venue_id,is_admin");
    const map:Record<string,string[]>={};
    for(const l of links||[]){if(!map[l.profile_id])map[l.profile_id]=[];map[l.profile_id].push(l.venue_id)}
    setStaffVenueMap(map);
    setOwnVenueIds(map[initialProfile.id]||[]);
    setManagedVenueIds(initialProfile.role==="admin"?((data||[]) as Venue[]).map(v=>v.id):(links||[]).filter((x:any)=>x.profile_id===initialProfile.id&&x.is_admin).map((x:any)=>x.venue_id));
  }

  async function refreshVenueMemberships(){
    const{data:links}=await supabase.from("staff_venues").select("profile_id,venue_id,is_admin");
    const map:Record<string,string[]>={};
    for(const l of links||[]){if(!map[l.profile_id])map[l.profile_id]=[];map[l.profile_id].push(l.venue_id)}
    setStaffVenueMap(map);setOwnVenueIds(map[initialProfile.id]||[]);
  }

  async function saveVenueMemberships(profileId:string,ids:string[],adminIds:string[]|null=null){
    let keepAdminIds=adminIds;
    if(keepAdminIds===null){const{data:existing}=await supabase.from("staff_venues").select("venue_id,is_admin").eq("profile_id",profileId);keepAdminIds=(existing||[]).filter((x:any)=>x.is_admin).map((x:any)=>x.venue_id)}
    const del=await supabase.from("staff_venues").delete().eq("profile_id",profileId);
    if(del.error)return del.error;
    if(ids.length){const ins=await supabase.from("staff_venues").insert(ids.map(venue_id=>({profile_id:profileId,venue_id,is_admin:(keepAdminIds||[]).includes(venue_id)})));if(ins.error)return ins.error}
    await refreshVenueMemberships();return null;
  }

  function venueName(id?:string|null){return venues.find(v=>v.id===id)?.name||"Unassigned"}
  function venueColourClass(id?:string|null){
    const name=venueName(id).toLowerCase();
    if(name.includes("greenhead"))return "orgGreenhead";
    if(name.includes("kirklees"))return "orgKirklees";
    return "orgOther";
  }
  function profileVenues(id:string){return (staffVenueMap[id]||[]).map(v=>venues.find(x=>x.id===v)).filter(Boolean) as Venue[]}
  function adminVenues(){return isGlobalAdmin?venues:venues.filter(v=>managedVenueIds.includes(v.id))}

  async function loadTemplates(profileId:string){
    const{data}=await supabase.from("shift_templates").select("*").eq("profile_id",profileId).eq("active",true).order("weekday").order("start_time");
    setTemplates((data||[]) as ShiftTemplate[]);
  }

  async function loadStaff(){
    const{data}=await supabase.from("profiles").select("*").neq("role","admin").order("full_name");
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
      const{data}=await supabase.from("invoices").select("*,profiles(full_name,email,account_name,sort_code,account_number,address),venues(name,legal_name,invoice_address,invoice_prefix,payment_note)").order("invoice_date",{ascending:false}).limit(300);
      setAllInvoices(data||[]);
    }else{
      const{data}=await supabase.from("invoices").select("*,venues(name,legal_name,invoice_address,invoice_prefix,payment_note)").eq("coach_id",initialProfile.id).order("invoice_date",{ascending:false}).limit(120);
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
    setAdminMonthShifts((ss||[]) as Shift[]);
    const rows=((coaches||[]) as Profile[]).map(c=>{
      const csh=((ss||[]) as Shift[]).filter(s=>s.coach_id===c.id);
      const h=csh.reduce((a,s)=>a+shiftHours(s),0);
      const cts=((ts||[]) as Timesheet[]).find(t=>t.coach_id===c.id)||null;
      return{coach:c,hours:h,value:h*Number(c.hourly_rate||0),timesheet:cts,invoice:cts?inv.find(i=>i.timesheet_id===cts.id)||null:null};
    });
    setAdminRows(rows);
  }

  async function loadPendingExtraShifts(){
    if(!isAdmin)return;
    const{data,error}=await supabase.rpc("get_schedule_extra_shifts",{p_month_start:`${month}-01`});
    if(error){console.error(error);return}
    setPendingExtraShifts((data||[]) as Shift[]);
  }

  function flash(t:string){setMessage(t);window.setTimeout(()=>setMessage(""),4500)}
  async function signOut(){await supabase.auth.signOut();window.location.href="/"}
  function selectCoach(c:Profile){setActiveCoach(c);setTab("timesheets")}
  async function openStaffEdit(s:Profile){
    setStaffPanel("profile");
    setTemporaryPassword("");
    setTemporaryPasswordConfirm("");
    setForceTempPasswordChange(true);
    setStaffEdit({...s});setStaffEditVenueIds(staffVenueMap[s.id]||[]);
    const{data}=await supabase.from("staff_venues").select("venue_id,is_admin").eq("profile_id",s.id);
    setStaffEditAdminVenueIds((data||[]).filter((x:any)=>x.is_admin).map((x:any)=>x.venue_id));
  }
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
    if(!error){if(initialProfile.role==="coach"){const ve=await saveVenueMemberships(initialProfile.id,ownVenueIds);if(ve){flash(ve.message);return}}setOwnProfile({...p,...editable} as Profile);if(!isAdmin)setActiveCoach({...activeCoach,...editable} as Profile);void loadStaff()}
  }

  async function saveStaff(){
    if(!staffEdit)return;
    setSaving(true);
    const payload={
      full_name:staffEdit.full_name,phone:staffEdit.phone,address:staffEdit.address,hourly_rate:Number(staffEdit.hourly_rate||0),is_active:staffEdit.is_active,
      ...(isGlobalAdmin?{role:staffEdit.role}:{}),
      account_name:staffEdit.account_name,sort_code:staffEdit.sort_code,account_number:staffEdit.account_number,utr:staffEdit.utr,invoice_prefix:staffEdit.invoice_prefix,
      emergency_contact_name:staffEdit.emergency_contact_name||null,emergency_contact_phone:staffEdit.emergency_contact_phone||null,
      dbs_expiry:staffEdit.dbs_expiry||null,first_aid_expiry:staffEdit.first_aid_expiry||null,safeguarding_expiry:staffEdit.safeguarding_expiry||null,qualifications:staffEdit.qualifications||null,
      job_title:staffEdit.job_title||null,employment_status:staffEdit.employment_status||"active",start_date:staffEdit.start_date||null,payroll_id:staffEdit.payroll_id||null,
      force_password_reset:Boolean(staffEdit.force_password_reset),admin_notes:staffEdit.admin_notes||null
    };
    const{error}=await supabase.from("profiles").update(payload).eq("id",staffEdit.id);
    setSaving(false);
    flash(error?error.message:"Staff profile saved.");
    if(!error){const ve=await saveVenueMemberships(staffEdit.id,staffEditVenueIds,staffEdit.role==="org_admin"?staffEditAdminVenueIds:[]);if(ve){flash(ve.message);return}setStaffEdit(null);void loadStaff();void loadAdmin();void loadAudits()}
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
    const hasEmail=Boolean(invite.email.trim());
    const endpoint=hasEmail?"/api/invite":"/api/staff-access";
    const body=hasEmail
      ? {full_name:invite.name,email:invite.email.trim(),hourly_rate:Number(invite.rate),venue_ids:inviteVenueIds,role:inviteRole,admin_venue_ids:inviteRole==="org_admin"?inviteVenueIds:[]}
      : {action:"create_placeholder",full_name:invite.name,hourly_rate:Number(invite.rate),venue_ids:inviteVenueIds,role:inviteRole,admin_venue_ids:inviteRole==="org_admin"?inviteVenueIds:[]};
    const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const j=await res.json();setSaving(false);
    if(!res.ok){flash(j.error||"Could not add staff member.");return}
    flash(hasEmail?"Invitation sent.":"Staff member added without portal access.");
    setInviteOpen(false);setInvite({name:"",email:"",rate:""});setInviteVenueIds([]);setInviteRole("coach");void loadStaff();void loadAdmin();
  }

  async function inviteExistingStaff(s:Profile){
    const email=window.prompt(`Enter the email address to invite ${s.full_name} to the portal.`);
    if(!email)return;
    const res=await fetch("/api/staff-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"invite_existing",profile_id:s.id,email:email.trim()})});
    const j=await res.json();
    if(!res.ok){flash(j.error||"Could not invite staff member.");return}
    flash("Portal invitation sent.");setStaffEdit(null);void loadStaff();
  }

  async function saveShift(){
    if(!shiftModal)return;
    if(locked&&!isAdmin){flash("Unsubmit the month before editing shifts.");return}
    if(timesheet?.status==="paid"){flash("Paid months are locked.");return}
    const payload={
      coach_id:activeCoach.id,
      shift_date:shiftModal.shift_date,
      start_time:shiftModal.start_time,
      finish_time:shiftModal.finish_time,
      break_minutes:Number(shiftModal.break_minutes||0),
      venue_id:shiftModal.venue_id||null,
      session_location:shiftModal.session_location,
      notes:shiftModal.notes,
      source:shiftModal.source||"extra",
      approval_status:isAdmin?"approved":(shiftModal.approval_status==="pending"?"pending":"pending")
    };
    const result=shiftModal.id
      ? await supabase.from("shifts").update(payload).eq("id",shiftModal.id)
      : await supabase.from("shifts").insert(payload);
    if(result.error){flash(result.error.message);return}
    setShiftModal(null);flash(isAdmin?"Extra shift saved.":"Extra shift sent to admin for approval.");await loadCoachMonth(activeCoach.id);if(isAdmin){void loadAdmin();void loadAudits();void loadPendingExtraShifts()}
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
      if(nd)rows.push({coach_id:activeCoach.id,shift_date:`${month}-${String(nd).padStart(2,"0")}`,start_time:s.start_time,finish_time:s.finish_time,break_minutes:s.break_minutes,venue_id:s.venue_id||null,session_location:s.session_location,notes:s.notes});
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
    const available=(isAdmin?adminVenues():profileVenues(activeCoach.id));
    if(!available.length){flash("Select at least one venue on the staff profile first.");return}
    const venueText=available.map((v,i)=>`${i+1}. ${v.name}`).join("\n");
    const venueChoice=Number(prompt(`Choose venue:\n${venueText}`,"1")||1)-1;
    const venue=available[venueChoice]||available[0];
    const loc=prompt("Session / group (optional)","Coaching")||"",brk=Number(prompt("Break minutes","0")||0),[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),rows:any[]=[];
    for(let d=1;d<=last;d++)if(new Date(y,m-1,d).getDay()===dow)rows.push({coach_id:activeCoach.id,shift_date:`${month}-${String(d).padStart(2,"0")}`,start_time:start,finish_time:finish,break_minutes:brk,venue_id:venue.id,session_location:loc,notes:""});
    const{error}=await supabase.from("shifts").insert(rows);
    flash(error?error.message:"Weekly shifts added.");void loadCoachMonth(activeCoach.id);if(isAdmin)void loadAdmin();
  }

  async function submitMonth(){
    if(viewingOther){flash("The coach should submit their own month. You can edit it before they submit.");return}
    const{error}=await supabase.rpc("submit_own_timesheet",{p_month_start:`${month}-01`});
    flash(error?error.message:"Month submitted and invoice created.");
    if(!error){await loadCoachMonth(initialProfile.id);void loadInvoices();if(isAdmin)void loadAdmin()}
  }

  async function adminSubmitMonth(coachId=activeCoach.id){
    const{error}=await supabase.rpc("admin_submit_timesheet",{p_coach_id:coachId,p_month_start:`${month}-01`});
    flash(error?error.message:"Submitted on behalf of coach. Separate organisation invoices created.");
    if(!error){await loadCoachMonth(coachId);void loadAdmin();void loadInvoices();void loadAudits()}
  }

  async function saveOrganisation(v:Venue){
    const{error}=await supabase.from("venues").update({legal_name:v.legal_name||v.name,invoice_address:v.invoice_address||null,invoice_prefix:(v.invoice_prefix||"").toUpperCase(),payment_note:v.payment_note||null}).eq("id",v.id);
    flash(error?error.message:`${v.name} invoice settings saved.`);
    if(!error)void loadVenues();
  }

  async function addTemplate(){
    const available=isAdmin?adminVenues():profileVenues(activeCoach.id);if(!available.length){flash("Assign an organisation first.");return}
    const day=Number(prompt("Regular day: 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday, 0 Sunday","1"));
    if(Number.isNaN(day)||day<0||day>6)return;
    const choice=Number(prompt(`Organisation:\n${available.map((v,i)=>`${i+1}. ${v.name}`).join("\n")}`,"1")||1)-1;
    const venue=available[choice]||available[0];
    const start=prompt("Start time","16:30"),finish=prompt("Finish time","20:30");if(!start||!finish)return;
    const session=prompt("Session / group","Coaching")||"";const brk=Number(prompt("Break minutes","0")||0);
    const{error}=await supabase.from("shift_templates").insert({profile_id:activeCoach.id,venue_id:venue.id,weekday:day,start_time:start,finish_time:finish,break_minutes:brk,session_location:session,notes:""});
    flash(error?error.message:"Regular shift saved.");if(!error)void loadTemplates(activeCoach.id);
  }

  async function deleteTemplate(t:ShiftTemplate){
    if(!confirm("Delete this regular shift?"))return;const{error}=await supabase.from("shift_templates").delete().eq("id",t.id);flash(error?error.message:"Regular shift deleted.");if(!error)void loadTemplates(activeCoach.id);
  }

  async function fillMonthFromTemplates(){
    if(!templates.length){flash("Add at least one regular shift first.");return}
    if(shifts.length&&!confirm("This month already has shifts. Add regular shifts as well?"))return;
    const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),rows:any[]=[];
    for(const t of templates)for(let d=1;d<=last;d++)if(new Date(y,m-1,d).getDay()===t.weekday)rows.push({coach_id:activeCoach.id,shift_date:`${month}-${String(d).padStart(2,"0")}`,start_time:t.start_time,finish_time:t.finish_time,break_minutes:t.break_minutes,venue_id:t.venue_id,session_location:t.session_location,notes:t.notes});
    const{error}=await supabase.from("shifts").insert(rows);flash(error?error.message:`Added ${rows.length} regular shifts.`);if(!error){void loadCoachMonth(activeCoach.id);if(isAdmin)void loadAdmin()}
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

  function generateTemporaryPassword(){
    const upper="ABCDEFGHJKLMNPQRSTUVWXYZ",lower="abcdefghijkmnopqrstuvwxyz",nums="23456789",symbols="!@#$%*?";
    const all=upper+lower+nums+symbols;
    const pick=(chars:string)=>chars[Math.floor(Math.random()*chars.length)];
    let value=pick(upper)+pick(lower)+pick(nums)+pick(symbols);
    for(let i=0;i<8;i++)value+=pick(all);
    value=value.split("").sort(()=>Math.random()-.5).join("");
    setTemporaryPassword(value);setTemporaryPasswordConfirm(value);
  }

  async function setStaffTemporaryPassword(s:Profile){
    if(!s.email){flash("Add an email address and enable portal access first.");return}
    if(temporaryPassword.length<8){flash("Temporary password must be at least 8 characters.");return}
    if(temporaryPassword!==temporaryPasswordConfirm){flash("The temporary passwords do not match.");return}
    setTemporaryPasswordBusy(true);
    try{
      const res=await fetch("/api/staff-access",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"set_password",
          profile_id:s.id,
          password:temporaryPassword,
          force_password_reset:forceTempPasswordChange
        })
      });
      const body=await res.json();
      if(!res.ok)throw new Error(body.error||"Could not set password");
      const updated={...s,force_password_reset:forceTempPasswordChange,password_changed_at:new Date().toISOString()};
      setStaffEdit(updated);
      setTemporaryPassword("");setTemporaryPasswordConfirm("");
      flash(forceTempPasswordChange?"Temporary password set. Coach must choose a new password after signing in.":"Password set successfully.");
      void loadStaff();
    }catch(e:any){flash(e?.message||"Could not set password")}
    finally{setTemporaryPasswordBusy(false)}
  }

  async function copyTemporaryPassword(){
    if(!temporaryPassword){flash("Generate or enter a temporary password first.");return}
    await navigator.clipboard.writeText(temporaryPassword);
    flash("Temporary password copied.");
  }

  async function sendPasswordResetEmail(s:Profile){
    if(!s.email){flash("Add an email address before sending a password reset.");return}
    const{error}=await supabase.auth.resetPasswordForEmail(s.email,{redirectTo:`${window.location.origin}/set-password?mode=recovery&email=${encodeURIComponent(s.email)}`});
    flash(error?error.message:`Password reset email sent to ${s.email}.`);
  }

  async function toggleForcePasswordReset(s:Profile){
    const next=!Boolean(s.force_password_reset);
    const{error}=await supabase.from("profiles").update({force_password_reset:next}).eq("id",s.id);
    if(error){flash(error.message);return}
    setStaffEdit({...s,force_password_reset:next});
    flash(next?"Password change required at next portal use.":"Forced password change removed.");
    void loadStaff();
  }

  async function changeOwnPassword(){
    if(newPassword.length<8){flash("Use a password of at least 8 characters.");return}
    if(newPassword!==confirmNewPassword){flash("The new passwords do not match.");return}
    setPasswordBusy(true);
    const{error}=await supabase.auth.updateUser({password:newPassword});
    if(!error)await supabase.from("profiles").update({force_password_reset:false,password_changed_at:new Date().toISOString()}).eq("id",initialProfile.id);
    setPasswordBusy(false);
    if(error){flash(error.message);return}
    setNewPassword("");setConfirmNewPassword("");
    setOwnProfile({...ownProfile,force_password_reset:false});
    flash("Password changed successfully.");
  }

  async function createSetupLink(s:Profile){
    const res=await fetch("/api/admin-user",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"setup_link",email:s.email})});
    const j=await res.json();if(!res.ok){flash(j.error||"Could not create setup link.");return}
    if(j.link){try{await navigator.clipboard.writeText(j.link);flash("Secure password/setup link copied to clipboard.")}catch{window.prompt("Copy this secure setup link and send it privately to the staff member:",j.link)}}
  }

  async function deleteStaffAccount(s:Profile){
    const typed=window.prompt(`Permanently delete ${s.full_name} and their portal data? Type DELETE to confirm.`);
    if(typed!=="DELETE")return;
    const res=await fetch("/api/admin-user",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete",user_id:s.id})});
    const j=await res.json();if(!res.ok){flash(j.error||"Could not delete account.");return}
    setStaffEdit(null);flash("Staff account deleted.");void loadStaff();void loadAdmin();void refreshVenueMemberships();
  }

  async function markInvoicePaid(inv:Invoice){
    const{error}=await supabase.rpc("admin_mark_invoice_paid",{p_invoice_id:inv.id});
    flash(error?error.message:`${(inv as any).venues?.name||venueName(inv.venue_id)} invoice marked paid.`);
    if(!error){void loadInvoices();void loadAdmin()}
  }

  function pdfEscape(t:any){
    return String(t??"").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/£/g,"\\243").replace(/[^\x20-\x7E\\]/g,"-");
  }

  function downloadPDF(inv:Invoice,coach:Profile){
    const amount=money(inv.total_amount),rate=money(inv.hourly_rate);
    const address=(coach.address||"").split("\n").slice(0,4);
    const org=(inv as any).venues||venues.find(v=>v.id===inv.venue_id)||null;
    const bill=String(org?.invoice_address||"").split("\n").slice(0,4);
    const billName=org?.legal_name||org?.name||business.business_name;
    const lines:any[]=[
      [50,800,20,"INVOICE"],[50,775,11,coach.full_name],[50,759,9,coach.email||""],
      [410,800,11,inv.invoice_number],[410,784,9,new Date(inv.invoice_date).toLocaleDateString("en-GB")],
      [50,700,9,"Bill to:"],[50,684,11,billName],
      [50,610,10,"Description"],[310,610,10,"Hours"],[385,610,10,"Rate"],[470,610,10,"Amount"],
      [50,584,10,`Coaching services - ${monthLabel(inv.invoice_date.slice(0,7))}`],[310,584,10,Number(inv.hours).toFixed(2)],[385,584,10,rate],[470,584,10,amount],
      [390,530,13,"TOTAL"],[470,530,13,amount],
      [50,465,9,"Payment details:"],[50,449,9,`${coach.account_name||""}  ${coach.sort_code||""}  ${coach.account_number||""}`],
      [50,425,8,org?.payment_note||business.payment_note||""]
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

  async function loadSchedule(){
    const {from,to}=monthRange(month);
    const [{data:c},{data:slots},{data:ss},{data:removed,error:removedError}]=await Promise.all([
      supabase.from("classes").select("*").eq("active",true).order("weekday").order("start_time"),
      supabase.from("class_staffing_slots").select("*").order("slot_number"),
      supabase.from("scheduled_shifts").select("*").gte("shift_date",from).lte("shift_date",to).order("shift_date").order("start_time"),
      isAdmin?supabase.rpc("get_removed_schedule_occurrences",{p_month_start:`${month}-01`}):Promise.resolve({data:[],error:null} as any)
    ]);
    if(removedError)console.error(removedError);
    setClasses((c||[]) as ClassTemplate[]);
    setClassSlots((slots||[]) as ClassStaffingSlot[]);
    setScheduledShifts((ss||[]) as ScheduledShift[]);
    setRemovedOccurrences((removed||[]) as RemovedOccurrence[]);
  }

  function blankClassOccurrence(weekday=1):ClassOccurrenceDraft{
    return{key:crypto.randomUUID(),weekday,start_time:"16:30",finish_time:"18:00",break_minutes:0,coaches_required:1,coach_ids:[],notes:""};
  }

  function openNewClass(defaultDay=1){
    const av=adminVenues();
    const occurrence=blankClassOccurrence(defaultDay);
    setClassModal({
      venue_id:av[0]?.id||"",
      name:"",
      weekday:defaultDay,
      start_time:occurrence.start_time,
      finish_time:occurrence.finish_time,
      break_minutes:0,
      coaches_required:1,
      notes:"",
      coach_ids:[],
      occurrences:[occurrence]
    });
  }

  function openEditClass(c:ClassTemplate){
    // A "class" in the master timetable can run on several days.
    // Edit all active occurrences with the same class name + organisation together.
    const group=classes
      .filter(x=>x.active&&x.venue_id===c.venue_id&&x.name===c.name)
      .sort((a,b)=>(a.weekday-b.weekday)||a.start_time.localeCompare(b.start_time));

    const occurrences:ClassOccurrenceDraft[]=group.map(x=>{
      const slots=classSlots.filter(s=>s.class_id===x.id).sort((a,b)=>a.slot_number-b.slot_number);
      return{
        key:crypto.randomUUID(),
        id:x.id,
        weekday:x.weekday,
        start_time:x.start_time.slice(0,5),
        finish_time:x.finish_time.slice(0,5),
        break_minutes:Number(x.break_minutes||0),
        coaches_required:Number(x.coaches_required||1),
        coach_ids:slots.map(s=>s.default_profile_id||""),
        notes:x.notes||""
      };
    });

    const first=occurrences[0]||blankClassOccurrence(c.weekday);
    setClassModal({
      id:c.id,
      original_ids:group.map(x=>x.id),
      venue_id:c.venue_id,
      name:c.name,
      weekday:first.weekday,
      start_time:first.start_time,
      finish_time:first.finish_time,
      break_minutes:first.break_minutes,
      coaches_required:first.coaches_required,
      notes:first.notes,
      coach_ids:[...first.coach_ids],
      occurrences:occurrences.length?occurrences:[first]
    });
  }

  function duplicateClassGroup(c:ClassTemplate){
    const group=classes
      .filter(x=>x.active&&x.venue_id===c.venue_id&&x.name===c.name)
      .sort((a,b)=>(a.weekday-b.weekday)||a.start_time.localeCompare(b.start_time));
    const occurrences=group.map(x=>{
      const slots=classSlots.filter(s=>s.class_id===x.id).sort((a,b)=>a.slot_number-b.slot_number);
      return{
        key:crypto.randomUUID(),
        weekday:x.weekday,
        start_time:x.start_time.slice(0,5),
        finish_time:x.finish_time.slice(0,5),
        break_minutes:x.break_minutes,
        coaches_required:x.coaches_required,
        coach_ids:slots.map(s=>s.default_profile_id||""),
        notes:x.notes||""
      };
    });
    setClassModal({
      venue_id:c.venue_id,
      name:`${c.name} copy`,
      weekday:occurrences[0]?.weekday??1,
      start_time:occurrences[0]?.start_time||"16:30",
      finish_time:occurrences[0]?.finish_time||"18:00",
      break_minutes:occurrences[0]?.break_minutes||0,
      coaches_required:occurrences[0]?.coaches_required||1,
      notes:"",
      coach_ids:occurrences[0]?.coach_ids||[],
      occurrences:occurrences.length?occurrences:[{key:crypto.randomUUID(),weekday:1,start_time:"16:30",finish_time:"18:00",break_minutes:0,coaches_required:1,coach_ids:[],notes:""}]
    });
  }

  async function saveClass(){
    if(!classModal||!classModal.name.trim()||!classModal.venue_id)return;
    const occurrences=(classModal.occurrences?.length?classModal.occurrences:[{
      key:crypto.randomUUID(),
      id:classModal.id,
      weekday:classModal.weekday,
      start_time:classModal.start_time,
      finish_time:classModal.finish_time,
      break_minutes:classModal.break_minutes,
      coaches_required:classModal.coaches_required,
      coach_ids:classModal.coach_ids,
      notes:classModal.notes
    }]) as ClassOccurrenceDraft[];

    setSaving(true);
    const keptIds:string[]=[];

    for(const occurrence of occurrences){
      const payload={
        venue_id:classModal.venue_id,
        name:classModal.name.trim(),
        weekday:Number(occurrence.weekday),
        start_time:occurrence.start_time,
        finish_time:occurrence.finish_time,
        break_minutes:Number(occurrence.break_minutes||0),
        coaches_required:Math.max(1,Number(occurrence.coaches_required||1)),
        notes:occurrence.notes||null,
        active:true,
        updated_at:new Date().toISOString()
      };

      let classId=occurrence.id||"";

      if(classId){
        const{error}=await supabase.from("classes").update(payload).eq("id",classId);
        if(error){setSaving(false);flash(error.message);return}
      }else{
        const{data,error}=await supabase.from("classes").insert(payload).select("id").single();
        if(error){setSaving(false);flash(error.message);return}
        classId=data.id;
      }

      keptIds.push(classId);

      // Preserve existing staffing slot IDs. Generated schedule rows point to these IDs,
      // so changing a coach must update the slot rather than delete/recreate it.
      const{data:slotData,error:slotReadError}=await supabase
        .from("class_staffing_slots")
        .select("*")
        .eq("class_id",classId)
        .order("slot_number");
      if(slotReadError){setSaving(false);flash(slotReadError.message);return}

      const existingSlots=(slotData||[]) as ClassStaffingSlot[];
      const required=Math.max(1,Number(occurrence.coaches_required||1));

      for(let i=0;i<required;i++){
        const slotNumber=i+1;
        const default_profile_id=occurrence.coach_ids[i]||null;
        const existing=existingSlots.find(x=>x.slot_number===slotNumber);

        if(existing){
          const{error}=await supabase
            .from("class_staffing_slots")
            .update({default_profile_id})
            .eq("id",existing.id);
          if(error){setSaving(false);flash(error.message);return}
        }else{
          const{error}=await supabase.from("class_staffing_slots").insert({
            class_id:classId,
            slot_number:slotNumber,
            default_profile_id
          });
          if(error){setSaving(false);flash(error.message);return}
        }
      }

      const excess=existingSlots.filter(x=>x.slot_number>required);
      if(excess.length){
        const{error}=await supabase
          .from("class_staffing_slots")
          .delete()
          .in("id",excess.map(x=>x.id));
        if(error){setSaving(false);flash(error.message);return}
      }

      // Existing master occurrences may already have generated schedule rows.
      // New occurrences do not, so do not let schedule-sync interrupt multi-day creation.
      if(occurrence.id){
        const{error:syncError}=await supabase.rpc("sync_class_schedule",{p_class_id:classId});
        if(syncError){setSaving(false);flash(syncError.message);return}
      }
    }

    // If an existing multi-day class had an occurrence removed in the editor,
    // archive only that removed recurring occurrence.
    const removed=(classModal.original_ids||[]).filter(id=>!keptIds.includes(id));
    if(removed.length){
      const{error}=await supabase
        .from("classes")
        .update({active:false,updated_at:new Date().toISOString()})
        .in("id",removed);
      if(error){setSaving(false);flash(error.message);return}
    }

    setSaving(false);
    setClassModal(null);
    flash(classModal.id
      ?`${classModal.name} master timetable updated.`
      :`${classModal.name} added across ${occurrences.length} weekly session${occurrences.length===1?"":"s"}.`
    );
    await loadSchedule();
  }

  async function archiveClass(c:ClassTemplate){
    if(!confirm(`Archive ${c.name}? Existing generated shifts will remain.`))return;
    const{error}=await supabase.from("classes").update({active:false,updated_at:new Date().toISOString()}).eq("id",c.id);flash(error?error.message:"Class archived.");if(!error)await loadSchedule();
  }

  async function generateSchedule(){
    const{data,error}=await supabase.rpc("generate_schedule_month",{p_month_start:`${month}-01`});
    flash(error?error.message:`Schedule generated — ${data||0} new staffing shifts added.`);if(!error)await loadSchedule();
  }

  async function clonePreviousScheduleMonth(){
    const [y,m]=month.split("-").map(Number);
    const prev=monthKey(new Date(y,m-2,1));
    if(!confirm(`Copy ${monthLabel(prev)} staffing into ${monthLabel(month)}? Current master-timetable coaches/times will be used, while genuine one-off covers and cancellations from ${monthLabel(prev)} are preserved.`))return;
    const{data,error}=await supabase.rpc("clone_schedule_month",{p_source_month:`${prev}-01`,p_target_month:`${month}-01`});
    if(error){flash(error.message);return}
    const{data:filled,error:fillError}=await supabase.rpc("generate_schedule_month",{p_month_start:`${month}-01`});
    flash(fillError?fillError.message:`${data||0} copied · ${filled||0} missing shifts filled from the current master timetable.`);
    if(!fillError)await loadSchedule();
  }

  async function clearScheduleMonth(){
    const label=monthLabel(month);
    if(!confirm(`Clear the entire ${label} rota?\n\nThis removes generated schedule sessions for ${label} only. The Master Timetable is not changed, and you can generate the month again afterwards.`))return;
    const phrase=`CLEAR ${label.toUpperCase()}`;
    const typed=prompt(`For safety, type:\n\n${phrase}`);
    if(typed!==phrase){if(typed!==null)flash("Month clear cancelled — confirmation text did not match.");return}
    flash(`Clearing ${label} rota…`);
    const{data,error}=await supabase.rpc("clear_schedule_month",{p_month_start:`${month}-01`});
    if(error){flash(error.message);return}
    flash(`${label} rota cleared${typeof data==="number"?` — ${data} staffing shifts removed`:""}.`);
    await loadSchedule();
    await loadAdmin();
  }

  async function copyScheduleWeek(){
    const source=prompt("Source week start (Monday, YYYY-MM-DD)",`${month}-01`);
    if(!source)return;
    const target=prompt("Copy to week start (Monday, YYYY-MM-DD)");
    if(!target)return;
    const{data,error}=await supabase.rpc("copy_schedule_week",{p_source_monday:source,p_target_monday:target});
    flash(error?error.message:`${data||0} staffing shifts copied.`);
    if(!error)await loadSchedule();
  }

  async function swapScheduledAssignments(sourceId:string,targetId:string){
    if(sourceId===targetId)return;
    const{error}=await supabase.rpc("swap_scheduled_assignments",{p_source_id:sourceId,p_target_id:targetId});
    flash(error?error.message:"Coach assignments swapped.");
    if(!error)await loadSchedule();
  }

  async function confirmScheduled(sch:ScheduledShift){
    if(!sch.profile_id){flash("Assign a coach before confirming this shift.");return}
    flash("Confirming shift…");

    const monthStart=`${sch.shift_date.slice(0,7)}-01`;
    const{data:lockedTs,error:tsError}=await supabase
      .from("timesheets")
      .select("status")
      .eq("coach_id",sch.profile_id)
      .eq("month_start",monthStart)
      .maybeSingle();
    if(tsError){flash(tsError.message);return}
    if(lockedTs?.status==="submitted"||lockedTs?.status==="paid"){
      flash("That month is locked. Reopen it before confirming this shift.");
      return;
    }

    const shiftPayload={
      coach_id:sch.profile_id,
      shift_date:sch.shift_date,
      start_time:sch.start_time,
      finish_time:sch.finish_time,
      break_minutes:Number(sch.break_minutes||0),
      venue_id:sch.venue_id,
      session_location:sch.class_name,
      notes:sch.notes||"Scheduled class"
    };

    let actualShiftId=sch.actual_shift_id||null;
    if(actualShiftId){
      const{data,error}=await supabase.from("shifts").update(shiftPayload).eq("id",actualShiftId).select("id").single();
      if(error){flash(error.message);return}
      actualShiftId=data.id;
    }else{
      const{data,error}=await supabase.from("shifts").insert(shiftPayload).select("id").single();
      if(error){flash(error.message);return}
      actualShiftId=data.id;
    }

    const{error:updateError}=await supabase.from("scheduled_shifts").update({
      status:"confirmed",
      actual_shift_id:actualShiftId,
      updated_at:new Date().toISOString()
    }).eq("id",sch.id);
    if(updateError){
      if(!sch.actual_shift_id&&actualShiftId)await supabase.from("shifts").delete().eq("id",actualShiftId);
      flash(updateError.message);
      return;
    }

    flash("Shift confirmed into timesheet.");
    await loadSchedule();
    if(sch.profile_id===initialProfile.id||sch.profile_id===activeCoach.id)await loadCoachMonth(sch.profile_id);
    if(isAdmin)await loadAdmin();
  }

  function openAdjustment(sch:ScheduledShift){
    setAdjustShift(sch);
    setAdjustStart((sch.requested_start_time||sch.start_time).slice(0,5));
    setAdjustFinish((sch.requested_finish_time||sch.finish_time).slice(0,5));
    setAdjustBreak(Number(sch.requested_break_minutes??sch.break_minutes??0));
    setAdjustReason(sch.adjustment_reason||"");
  }

  async function submitRotaActual(){
    if(!adjustShift)return;
    const scheduled=shiftHours({coach_id:adjustShift.profile_id||"",shift_date:adjustShift.shift_date,start_time:adjustShift.start_time,finish_time:adjustShift.finish_time,break_minutes:adjustShift.break_minutes,session_location:adjustShift.class_name,notes:null});
    const actual=shiftHours({coach_id:adjustShift.profile_id||"",shift_date:adjustShift.shift_date,start_time:adjustStart,finish_time:adjustFinish,break_minutes:Number(adjustBreak||0),session_location:adjustShift.class_name,notes:null});
    const fn=isAdmin||actual<=scheduled?"confirm_scheduled_shift_adjusted":"request_scheduled_overtime";
    const args=fn==="confirm_scheduled_shift_adjusted"
      ?{p_scheduled_id:adjustShift.id,p_start_time:adjustStart,p_finish_time:adjustFinish,p_break_minutes:Number(adjustBreak||0)}
      :{p_scheduled_id:adjustShift.id,p_start_time:adjustStart,p_finish_time:adjustFinish,p_break_minutes:Number(adjustBreak||0),p_reason:adjustReason||null};
    const{error}=await supabase.rpc(fn,args as any);
    if(error){flash(error.message);return}
    flash(fn==="request_scheduled_overtime"?"Extra time sent to admin for approval.":"Worked time confirmed.");
    setAdjustShift(null);
    await loadSchedule();
    await loadCoachMonth(adjustShift.profile_id||initialProfile.id);
    if(isAdmin)await loadAdmin();
  }

  async function undoOwnRota(sch:ScheduledShift){
    const fn=sch.adjustment_status==="pending"?"cancel_scheduled_adjustment":isAdmin?"unconfirm_scheduled_shift":"undo_own_scheduled_confirmation";
    const{error}=await supabase.rpc(fn,{p_scheduled_id:sch.id});
    flash(error?error.message:(sch.adjustment_status==="pending"?"Approval request cancelled.":"Shift returned to scheduled."));
    if(!error){await loadSchedule();if(sch.profile_id)await loadCoachMonth(sch.profile_id);if(isAdmin)await loadAdmin()}
  }

  async function approveRotaAdjustment(sch:ScheduledShift){
    const{error}=await supabase.rpc("approve_scheduled_adjustment",{p_scheduled_id:sch.id});
    flash(error?error.message:"Extra time approved and added to timesheet.");
    if(!error){await loadSchedule();if(sch.profile_id)await loadCoachMonth(sch.profile_id);await loadAdmin()}
  }

  async function approveExtraShift(s:Shift){
    if(!s.id)return;
    const{error}=await supabase.rpc("approve_extra_shift",{p_shift_id:s.id});
    flash(error?error.message:"Extra shift approved.");
    if(!error){await loadCoachMonth(activeCoach.id);await loadAdmin();await loadPendingExtraShifts();await loadSchedule()}
  }

  async function rejectExtraShift(s:Shift){
    if(!s.id)return;
    const{error}=await supabase.rpc("reject_extra_shift",{p_shift_id:s.id});
    flash(error?error.message:"Extra shift rejected.");
    if(!error){setShiftModal(null);await loadCoachMonth(activeCoach.id);await loadAdmin();await loadPendingExtraShifts();await loadSchedule()}
  }

  async function reassignScheduled(sch:ScheduledShift,profileId:string){
    const{error}=await supabase.rpc("reassign_scheduled_shift",{p_scheduled_id:sch.id,p_profile_id:profileId||null});
    flash(error?error.message:"Scheduled coach changed.");if(!error)await loadSchedule();
  }

  async function unconfirmScheduled(sch:ScheduledShift){
    if(!isAdmin){flash("Admin only.");return}
    if(!confirm(`Unconfirm ${sch.class_name} on ${new Date(`${sch.shift_date}T12:00:00`).toLocaleDateString("en-GB")}? This removes the linked timesheet shift and returns the session to Scheduled.`))return;
    const{error}=await supabase.rpc("unconfirm_scheduled_shift",{p_scheduled_id:sch.id});
    if(error){flash(error.message);return}
    flash("Shift unconfirmed and returned to Scheduled.");
    await loadSchedule();
    if(sch.profile_id&&(sch.profile_id===initialProfile.id||sch.profile_id===activeCoach.id))await loadCoachMonth(sch.profile_id);
    if(isAdmin)await loadAdmin();
  }

  async function toggleScheduledCancelled(sch:ScheduledShift){
    const cancelled=sch.status!=="cancelled";
    const{error}=await supabase.rpc("set_scheduled_shift_cancelled",{p_scheduled_id:sch.id,p_cancelled:cancelled});
    flash(error?error.message:(cancelled?"Scheduled shift cancelled.":"Scheduled shift restored."));
    if(!error){
      await loadSchedule();
      setAdminScheduleShift(prev=>prev?.id===sch.id?{...prev,status:cancelled?"cancelled":"scheduled"}:prev);
    }
  }

  async function removeScheduledOccurrence(sch:ScheduledShift){
    if(!confirm(`Remove ${sch.class_name} on ${new Date(`${sch.shift_date}T12:00:00`).toLocaleDateString("en-GB")}?\n\nThis removes this class on this date only. The Master Timetable and other months are unchanged.`))return;
    const{error}=await supabase.rpc("remove_scheduled_occurrence",{p_scheduled_id:sch.id});
    if(error){flash(error.message);return}
    setAdminScheduleShift(null);
    flash("Class removed from this date only.");
    await loadSchedule();
    await loadAdmin();
  }

  async function restoreRemovedOccurrence(item:RemovedOccurrence){
    const label=`${item.class_name} on ${new Date(`${item.shift_date}T12:00:00`).toLocaleDateString("en-GB")}`;
    if(!confirm(`Restore ${label}?\n\nThis puts the class back onto this date from the Master Timetable.`))return;
    const{error}=await supabase.rpc("restore_schedule_occurrence",{p_class_id:item.class_id,p_shift_date:item.shift_date});
    if(error){flash(error.message);return}
    const{data:generated,error:generateError}=await supabase.rpc("generate_schedule_month",{p_month_start:`${month}-01`});
    if(generateError){flash(generateError.message);return}
    flash(`${item.class_name} restored${typeof generated==="number"?` · ${generated} staffing shifts regenerated`:""}.`);
    await loadSchedule();
    await loadAdmin();
  }

  function openAdminScheduleShift(s:ScheduledShift){
    setAdminScheduleShift(s);
  }

  const scheduleHours=(s:ScheduledShift)=>shiftHours({coach_id:s.profile_id||"",shift_date:s.shift_date,start_time:s.start_time,finish_time:s.finish_time,break_minutes:s.break_minutes,session_location:s.class_name,notes:s.notes});
  const profileById=(id:string|null)=>staff.find(x=>x.id===id)||(id===initialProfile.id?initialProfile:null);
  const staffOptionsForVenue=(venueId:string)=>{const list=staff.filter(p=>(staffVenueMap[p.id]||[]).includes(venueId)&&p.is_active);if((staffVenueMap[initialProfile.id]||[]).includes(venueId)&&initialProfile.is_active&&!list.some(p=>p.id===initialProfile.id))return [initialProfile,...list];return list};
  const scheduleScope=scheduledShifts.filter(s=>!scheduleFilter||s.venue_id===scheduleFilter);
  const plannedSchedule=scheduleScope.filter(s=>s.status!=="cancelled");
  const forecastCost=plannedSchedule.reduce((a,s)=>a+scheduleHours(s)*Number(profileById(s.profile_id)?.hourly_rate||0),0);
  const confirmedScheduleCost=scheduleScope.filter(s=>s.status==="confirmed").reduce((a,s)=>a+scheduleHours(s)*Number(profileById(s.profile_id)?.hourly_rate||0),0);
  const unassignedScheduleCount=plannedSchedule.filter(s=>!s.profile_id).length;
  const actualScheduleCost=adminMonthShifts.filter(s=>!scheduleFilter||s.venue_id===scheduleFilter).reduce((a,s)=>a+shiftHours(s)*Number(profileById(s.coach_id)?.hourly_rate||0),0);
  const normalCost=classes.filter(c=>!scheduleFilter||c.venue_id===scheduleFilter).reduce((total,c)=>{
    const [y,m]=month.split("-").map(Number);const last=new Date(y,m,0).getDate();let occurrences=0;
    for(let d=1;d<=last;d++)if(new Date(y,m-1,d).getDay()===c.weekday)occurrences++;
    const slots=classSlots.filter(x=>x.class_id===c.id);
    return total+slots.reduce((a,slot)=>a+occurrences*shiftHours({coach_id:slot.default_profile_id||"",shift_date:`${month}-01`,start_time:c.start_time,finish_time:c.finish_time,break_minutes:c.break_minutes,session_location:c.name,notes:null})*Number(profileById(slot.default_profile_id)?.hourly_rate||0),0);
  },0);

  const additionalWorkScope=pendingExtraShifts.filter(s=>!scheduleFilter||s.venue_id===scheduleFilter);
  const pendingAdditionalScope=additionalWorkScope.filter(s=>s.approval_status==="pending");
  const approvedAdditionalScope=additionalWorkScope.filter(s=>s.approval_status==="approved");
  const pendingAdditionalCount=pendingAdditionalScope.length;
  const submittedCount=adminRows.filter(r=>r.timesheet?.status==="submitted"||r.timesheet?.status==="paid").length;
  const unpaidTotal=allInvoices.filter((i:any)=>i.status==="awaiting_payment").reduce((a:number,i:any)=>a+Number(i.total_amount||0),0);
  const adminHours=adminRows.reduce((a,r)=>a+r.hours,0);
  const filteredStaff=staff.filter(s=>`${s.full_name} ${s.email||""}`.toLowerCase().includes(search.toLowerCase()) && (!venueFilter||(staffVenueMap[s.id]||[]).includes(venueFilter)));

  const mobilePageMeta=(()=>{
    if(!isAdmin){
      if(tab==="timesheets")return{eyebrow:"My work",title:"My Timesheet",sub:"Review confirmed coaching and submit your month when everything is correct."};
      if(tab==="invoices")return{eyebrow:"My pay",title:"My Payslips",sub:"Your payment history and completed monthly invoices."};
      if(tab==="profile")return{eyebrow:"My account",title:"My Profile",sub:"Keep your personal, payment and compliance details up to date."};
      return null;
    }
    if(tab==="dashboard")return{eyebrow:"Overview",title:"Club Operations",sub:"Today’s staffing, schedule and payroll position at a glance."};
    if(tab==="timesheets")return{eyebrow:"Payroll",title:"Timesheets",sub:"Review hours, submissions and monthly payroll status."};
    if(tab==="invoices")return{eyebrow:"Payroll",title:"Invoices",sub:"Generated invoices, payment status and history."};
    if(tab==="staff")return{eyebrow:"People",title:"Staff",sub:"Manage coaches, access, rates and compliance."};
    if(tab==="reports")return{eyebrow:"Insights",title:"Reports",sub:"Staffing cost, hours and activity across your organisations."};
    if(tab==="settings")return{eyebrow:"Settings",title:"Organisation Settings",sub:"Manage invoice and organisation configuration."};
    if(tab==="profile")return{eyebrow:"My account",title:"My Profile",sub:"Your own coaching, payment and compliance details."};
    return null;
  })();

  return <div className="portal">
    <Sidebar tab={tab} setTab={(t:any)=>{setAdminPersonalRota(false);setTab(t);if(t!=="timesheets")backToAdmin()}} name={initialProfile.full_name} role={initialProfile.role} onSignOut={signOut} mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)}/>
    <div className="mainWrap">
      <header className="topbar"><div className="row"><div className="v3HeaderLogo"><AvLogo size={31}/></div><div className="topTitle">AV Gymnastics</div></div><div className="topActions"><span className="versionBadge">v3.2.2</span><span className="muted desktopEmail" style={{fontSize:12}}>{initialProfile.email}</span></div></header>
      <main className="main">
        {tab!=="schedule"&&mobilePageMeta&&<div className="v303MobilePageHero">
          <span>{mobilePageMeta.eyebrow}</span>
          <h1>{mobilePageMeta.title}</h1>
          <p>{mobilePageMeta.sub}</p>
        </div>}
        {message&&<div className={`notice ${/(saved|sent|submitted|added|copied|reopened|created|paid)/i.test(message)?"success":""}`}>{message}</div>}
        {tab==="dashboard"&&DashboardView()}
        {tab==="schedule"&&ScheduleView()}
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
    {templateOpen&&TemplateModal()}
    {classModal&&ClassModal()}
    {adminScheduleShift&&AdminScheduleShiftModal()}
    {confirmShift&&ConfirmShiftModal()}
    {adjustShift&&AdjustmentModal()}
    <MobileNav tab={tab} setTab={(t:any)=>{setAdminPersonalRota(false);setTab(t);if(t!=="timesheets")backToAdmin()}} role={initialProfile.role} name={initialProfile.full_name} open={mobileMoreOpen} setOpen={setMobileMoreOpen} onSignOut={signOut}/>
  </div>;

  function PageHead({title,sub,children}:{title:string;sub:string;children?:React.ReactNode}){return <div className="pageHead"><div><h1>{title}</h1><p>{sub}</p></div>{children}</div>}
  function MonthSelect(){
    return <div className="monthNavigator">
      <button className="btn btnSecondary monthArrow" type="button" onClick={()=>changeMonth(-1)}>←</button>
      <button className="monthCurrent" type="button" onClick={()=>setMonth(monthKey())}>{monthLabel(month)}</button>
      <button className="btn btnSecondary monthArrow" type="button" onClick={()=>changeMonth(1)}>→</button>
    </div>
  }

  function DashboardView(){
    if(isAdmin)return <><PageHead title={`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${initialProfile.full_name.split(" ")[0]}`} sub="Your current staffing, timesheet and invoice position."><div className="row"><button className="btn btnSecondary" onClick={()=>{setAdminPersonalRota(true);setTab("schedule")}}>My Schedule</button><MonthSelect/></div></PageHead>
      <div className="grid grid4"><StatCard label="Active coaches" value={String(adminRows.length)} foot="Self-employed staff" icon={<UsersIcon/>}/><StatCard label="Hours this month" value={adminHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Submitted" value={`${submittedCount}/${adminRows.length}`} foot={`${Math.max(0,adminRows.length-submittedCount)} outstanding`} icon={<CheckIcon/>}/><StatCard label="Unpaid invoices" value={money(unpaidTotal)} foot="Awaiting payment" icon={<PoundIcon/>}/></div>
      <div className="grid grid4 section forecastCards"><StatCard label="Normal staffing cost" value={money(normalCost)} foot="Based on regular classes" icon={<CalendarIcon/>}/><StatCard label="Current forecast" value={money(forecastCost)} foot={`${unassignedScheduleCount} unassigned shifts`} icon={<PoundIcon/>}/><StatCard label="Actual cost so far" value={money(actualScheduleCost)} foot="Confirmed timesheet hours" icon={<CheckIcon/>}/><StatCard label="Forecast variance" value={money(forecastCost-normalCost)} foot={forecastCost>normalCost?"Above normal plan":"At / below normal plan"} icon={<ChartIcon/>}/></div>
      <div className="card section todayCoaching"><div className="sectionHeader"><div><h2>Today's coaching</h2><p>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</p></div><button className="btn btnSecondary" onClick={()=>setTab("schedule")}>Open schedule</button></div><div className="todayShiftGrid">{scheduledShifts.filter(s=>s.shift_date===new Date().toISOString().slice(0,10)&&s.status!=="cancelled").sort((a,b)=>a.start_time.localeCompare(b.start_time)).map(s=><div className="todayShiftCard" key={s.id}><div><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong><span>{s.class_name} · {venueName(s.venue_id)}</span></div><b>{profileById(s.profile_id)?.full_name||"Unassigned"}</b></div>)}{!scheduledShifts.some(s=>s.shift_date===new Date().toISOString().slice(0,10)&&s.status!=="cancelled")&&<div className="empty">No coaching scheduled today.</div>}</div></div>
      <div className="grid grid2 section"><div className="card"><div className="sectionHeader"><div><h2>Monthly status</h2><p>Open a coach to review or edit their shifts.</p></div><button className="btn btnSecondary" onClick={()=>setTab("timesheets")}>View all</button></div><div className="mobileDataList">{adminRows.slice(0,8).map(r=><button className="mobileDataCard" key={r.coach.id} onClick={()=>selectCoach(r.coach)}><div><strong>{r.coach.full_name}</strong><span>{r.hours.toFixed(2)} hours</span></div><StatusPill status={r.timesheet?.status}/></button>)}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th>Status</th><th></th></tr></thead><tbody>{adminRows.slice(0,8).map(r=><tr key={r.coach.id}><td><strong>{r.coach.full_name}</strong></td><td className="num">{r.hours.toFixed(2)}</td><td><StatusPill status={r.timesheet?.status}/></td><td><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open</button></td></tr>)}</tbody></table></div></div>
      <div className="card"><div className="sectionHeader"><div><h2>By organisation</h2><p>Hours and estimated staffing cost this month.</p></div></div><div className="orgSummary">{adminVenues().map(v=>{const vs=adminMonthShifts.filter(s=>s.venue_id===v.id);const h=vs.reduce((a,s)=>a+shiftHours(s),0);const cost=vs.reduce((a,s)=>a+shiftHours(s)*Number(staff.find(p=>p.id===s.coach_id)?.hourly_rate||0),0);return <div className="orgSummaryRow" key={v.id}><span><span className="venueDot" style={{background:v.brand_color||"#667085"}}/>{v.name}</span><strong>{h.toFixed(2)}h · {money(cost)}</strong></div>})}</div></div></div></>;

    return <><PageHead title={`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${ownProfile.full_name.split(" ")[0]}`} sub="Your hours and invoice for this month."><MonthSelect/></PageHead>
      {overdue&&<div className="notice danger">The normal submission deadline for {monthLabel(month)} has passed. Please submit your hours as soon as possible.</div>}
      <div className="grid grid4"><StatCard label="Hours logged" value={totalHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Hourly rate" value={money(ownProfile.hourly_rate)} foot="Set by admin" icon={<PoundIcon/>}/><StatCard label="Estimated invoice" value={money(totalValue)} foot="Based on logged hours" icon={<InvoiceIcon/>}/><StatCard label="Timesheet status" value={(timesheet?.status||"Draft").replace(/^./,x=>x.toUpperCase())} foot={`Due ${business.cutoff_day||1} ${new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toLocaleDateString("en-GB",{month:"long"})}`} icon={<CalendarIcon/>}/></div>
      <div className="section">{TimesheetCalendar({compact:true})}</div></>
  }

  function ScheduleView(){
    const dayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const rotaCoachId=initialProfile.id;
    const visibleScheduled=isAdmin&&!adminPersonalRota?scheduleScope:scheduleScope.filter(s=>s.profile_id===rotaCoachId);
    const grouped=visibleScheduled.reduce((m:Record<string,ScheduledShift[]>,s)=>{(m[s.shift_date]||=[]).push(s);return m},{});
    if(!isAdmin||adminPersonalRota){
      const allMine=scheduleScope.filter(s=>s.profile_id===initialProfile.id);
      const [ry,rm,rd]=rotaDate.split("-").map(Number);
      const selected=new Date(ry,rm-1,rd,12);
      const weekStart=new Date(selected);weekStart.setDate(selected.getDate()-((selected.getDay()+6)%7));
      const weekEnd=new Date(weekStart);weekEnd.setDate(weekStart.getDate()+6);
      const visible=allMine.filter(s=>{
        if(rotaView==="month")return true;
        const d=new Date(`${s.shift_date}T12:00:00`);
        if(rotaView==="day")return s.shift_date===rotaDate;
        return d>=weekStart&&d<=weekEnd;
      }).sort((a,b)=>`${a.shift_date}${a.start_time}`.localeCompare(`${b.shift_date}${b.start_time}`));
      const groupedMine=visible.reduce((m:Record<string,ScheduledShift[]>,s)=>{(m[s.shift_date]||=[]).push(s);return m},{});
      const moveRota=(delta:number)=>{
        const d=new Date(selected);
        d.setDate(d.getDate()+delta*(rotaView==="day"?1:rotaView==="week"?7:30));
        setRotaDate(d.toISOString().slice(0,10));
        if(rotaView==="month")setMonth(monthKey(d));
      };
      return <>{(()=>{
        const today=new Date().toISOString().slice(0,10);
        const todayItems=allMine.filter(s=>s.shift_date===today&&s.status!=="cancelled").sort((a,b)=>a.start_time.localeCompare(b.start_time));
        const future=allMine.filter(s=>s.status!=="cancelled"&&`${s.shift_date}T${s.start_time}`>=`${today}T00:00`).sort((a,b)=>`${a.shift_date}${a.start_time}`.localeCompare(`${b.shift_date}${b.start_time}`));
        const next=future[0]||null;
        const now=new Date(`${today}T12:00:00`);
        const ws=new Date(now);ws.setDate(now.getDate()-((now.getDay()+6)%7));
        const we=new Date(ws);we.setDate(ws.getDate()+6);
        const active=allMine.filter(s=>s.status!=="cancelled");
        const todayH=active.filter(s=>s.shift_date===today).reduce((a,s)=>a+scheduleHours(s),0);
        const weekH=active.filter(s=>{const d=new Date(`${s.shift_date}T12:00:00`);return d>=ws&&d<=we}).reduce((a,s)=>a+scheduleHours(s),0);
        const monthH=active.reduce((a,s)=>a+scheduleHours(s),0);
        return <>
          <div className="v3CoachWelcome"><div><span className="v3WelcomeEyebrow">My coaching</span><h1>{`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${initialProfile.full_name.split(" ")[0]}`}</h1><p>{todayItems.length?`You have ${todayItems.length} coaching ${todayItems.length===1?"session":"sessions"} today.`:"You have no coaching scheduled today."}</p></div>{isAdmin&&adminPersonalRota&&<button className="btn btnSecondary" onClick={()=>setAdminPersonalRota(false)}>← Admin Schedule</button>}</div>

          <div className="v302MobileHero">
            <span className="v302HeroEyebrow">{todayItems.length?"Today's coaching":"A quieter day"}</span>
            <h1>{`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${initialProfile.full_name.split(" ")[0]}`}</h1>
            <p>{todayItems.length?`${todayItems.length} ${todayItems.length===1?"session":"sessions"} on your rota today.`:next?`Nothing today. Your next session is ${new Date(`${next.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"})}.`:"You're all caught up — no upcoming coaching on the rota."}</p>
          </div>

          {next&&<div className={`v302NextSession v31NextSession ${venueColourClass(next.venue_id)}`}>
            <div className="v302NextTop"><span>Up next</span><small>{new Date(`${next.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</small></div>
            <div className="v302NextBody"><div className="v302NextTime">{next.start_time.slice(0,5)}</div><div><strong>{next.class_name}</strong><span>{venueName(next.venue_id)} · {next.start_time.slice(0,5)}–{next.finish_time.slice(0,5)}</span></div></div>
            {next.shift_date===today&&next.status==="scheduled"&&next.adjustment_status!=="pending"&&<button className="btn btnPrimary v31NextAction" onClick={()=>setConfirmShift(next)}>Confirm when finished</button>}
          </div>}

          <div className="rotaControls">
            <div className="rotaViewTabs"><button className={`btn ${rotaView==="day"?"btnPrimary":"btnSecondary"}`} onClick={()=>setRotaView("day")}>Day</button><button className={`btn ${rotaView==="week"?"btnPrimary":"btnSecondary"}`} onClick={()=>setRotaView("week")}>Week</button><button className={`btn ${rotaView==="month"?"btnPrimary":"btnSecondary"}`} onClick={()=>setRotaView("month")}>Month</button></div>
            <div className="v302DateNavigator">
              <button className="v302DateArrow" aria-label="Previous" onClick={()=>moveRota(-1)}>←</button>
              <label className="v302DateCentre"><span>{new Date(`${rotaDate}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short",year:"numeric"})}</span><input type="date" value={rotaDate} onChange={e=>{setRotaDate(e.target.value);if(rotaView==="month")setMonth(e.target.value.slice(0,7))}}/></label>
              <button className="v302DateArrow" aria-label="Next" onClick={()=>moveRota(1)}>→</button>
            </div>
          </div>

          <div className="v302MiniStats">
            <div><span>Today</span><strong>{todayH.toFixed(2)}h</strong></div>
            <div><span>This week</span><strong>{weekH.toFixed(2)}h</strong></div>
            <div><span>This month</span><strong>{monthH.toFixed(2)}h</strong></div>
          </div>
          <div className="grid grid3 scheduleSummary v302DesktopStats"><StatCard label="Today" value={`${todayH.toFixed(2)}h`} foot={todayH?"Scheduled coaching":"No coaching today"} icon={<ClockIcon/>}/><StatCard label="This week" value={`${weekH.toFixed(2)}h`} foot="Planned rota hours" icon={<CalendarIcon/>}/><StatCard label="This month" value={`${monthH.toFixed(2)}h`} foot={`${allMine.filter(s=>s.status==="confirmed").length} sessions confirmed`} icon={<CheckIcon/>}/></div>
        </>;
      })()}
        <div className="staffRotaList v31Timeline section">{Object.entries(groupedMine).map(([date,items])=><div className="staffRotaDay v31TimelineDay" key={date}><div className="staffRotaDate v31TimelineDate"><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</strong><span>{items.length} {items.length===1?"session":"sessions"}</span></div><div className="v31TimelineItems">{items.map((s,index)=><div className="v31TimelineItem" key={s.id}><div className="v31TimelineRail"><span className={`v31TimelineDot ${s.status} ${s.adjustment_status==="pending"?"pending":""}`}/>{index<items.length-1&&<span className="v31TimelineLine"/>}</div><div className={`staffRotaCard v31RotaCard ${s.status} ${venueColourClass(s.venue_id)}`}><div className="staffRotaMain v31RotaMain"><div className="v31RotaTime"><strong>{s.start_time.slice(0,5)}</strong><small>{s.finish_time.slice(0,5)}</small></div><div className="v31RotaDetails"><span>{s.class_name}</span><small>{venueName(s.venue_id)} · {scheduleHours(s).toFixed(2)}h</small></div><span className={`scheduleStatus ${s.adjustment_status==="pending"?"scheduled":s.status}`}>{s.adjustment_status==="pending"?"Approval pending":s.status}</span></div><div className="staffRotaActions v31RotaActions">
          {s.status==="scheduled"&&s.adjustment_status!=="pending"&&<><button className="btn btnPrimary" onClick={()=>setConfirmShift(s)}>Confirm as planned</button><button className="btn btnSecondary" onClick={()=>openAdjustment(s)}>Adjust actual time</button></>}
          {s.adjustment_status==="pending"&&<><span className="rotaPendingText">Extra time awaiting admin approval</span><button className="btn btnDanger" onClick={()=>undoOwnRota(s)}>Cancel request</button></>}
          {s.status==="confirmed"&&<><span className="rotaConfirmedText">Confirmed into timesheet</span><button className="btn btnSecondary" onClick={()=>undoOwnRota(s)}>Undo</button></>}
        </div></div></div>)}</div></div>)}{!visible.length&&<div className="card empty v302EmptyState"><div className="v302EmptyMark"><CalendarIcon/></div><strong>You're all caught up</strong><span>No coaching is planned in this view.</span></div>}</div>
        <div className="card section rotaExtraCard"><div><strong>Need to record work that wasn't on your rota?</strong><p>Use Record Additional Work for cover, camps, competitions, meetings, admin or anything else that was not on your rota. It will be sent to an admin for approval.</p></div><button className="btn btnAccent" onClick={()=>{setTab("timesheets");setShiftModal({coach_id:initialProfile.id,shift_date:rotaDate,start_time:"16:30",finish_time:"18:00",break_minutes:0,venue_id:profileVenues(initialProfile.id)[0]?.id||null,session_location:"",notes:"",source:"extra",approval_status:"pending"})}}><PlusIcon/>Record Additional Work</button></div>
      </>;
    }

    return <><PageHead title="Schedule & Staffing" sub="Build once, copy forward and only change the exceptions."><MonthSelect/></PageHead>
      <div className="v313MonthActions">
        <div className="v313MonthActionsText"><span>Month actions</span><strong>{monthLabel(month)}</strong></div>
        <div className="v313MonthActionButtons">
          <button className="btn btnPrimary" onClick={generateSchedule}>Generate missing shifts</button>
          <button className="btn btnSecondary" onClick={clonePreviousScheduleMonth}>Duplicate previous month</button>
          <div className="v313MoreWrap">
            <button className="btn btnSecondary" onClick={()=>setMonthActionsOpen(!monthActionsOpen)}>More <span className="v313Chevron">⌄</span></button>
            {monthActionsOpen&&<><button className="v313MenuScrim" aria-label="Close month actions" onClick={()=>setMonthActionsOpen(false)}/><div className="v313MoreMenu">
              <button type="button" onClick={()=>{setMonthActionsOpen(false);void copyScheduleWeek()}}>Copy a week</button>
              <div className="v313MenuDivider"/>
              <button type="button" className="danger" onClick={()=>{setMonthActionsOpen(false);void clearScheduleMonth()}}>Clear this month</button>
            </div></>}
          </div>
        </div>
      </div>
      <div className="scheduleToolbar"><select value={scheduleFilter} onChange={e=>setScheduleFilter(e.target.value)}><option value="">All organisations</option>{adminVenues().map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select><div className="row"><button className={`btn ${scheduleView==="calendar"?"btnPrimary":"btnSecondary"}`} onClick={()=>setScheduleView("calendar")}>Calendar</button><button className={`btn ${scheduleView==="agenda"?"btnPrimary":"btnSecondary"}`} onClick={()=>setScheduleView("agenda")}>Agenda</button><button className="btn btnAccent" onClick={()=>openNewClass()}><PlusIcon/>Add class</button></div></div>
      <div className="grid grid4 scheduleSummary"><StatCard label="Normal monthly cost" value={money(normalCost)} foot="Regular timetable" icon={<PoundIcon/>}/><StatCard label="Current forecast" value={money(forecastCost)} foot={`${plannedSchedule.length} scheduled staffing shifts`} icon={<CalendarIcon/>}/><StatCard label="Actual cost so far" value={money(actualScheduleCost)} foot={`${money(actualScheduleCost-forecastCost)} vs forecast`} icon={<CheckIcon/>}/><StatCard label="Unassigned shifts" value={String(unassignedScheduleCount)} foot={unassignedScheduleCount?"Needs a coach":"Fully staffed"} icon={<UsersIcon/>}/></div>
      {pendingAdditionalCount>0&&<div className="v311ApprovalBanner"><div className="v311ApprovalIcon"><ClockIcon/></div><div><strong>{pendingAdditionalCount} additional work {pendingAdditionalCount===1?"request":"requests"} awaiting approval</strong><span>These were recorded by staff outside their rota. Review them below in the schedule.</span></div><span className="v311ApprovalCount">{pendingAdditionalCount}</span></div>}
      <div className="grid scheduleAdminGrid section"><div className="card"><div className="sectionHeader"><div><h2>Weekly master timetable</h2><p>Sunday–Saturday. Add as many different classes as you need on the same day or at the same time.</p></div><button className="btn btnSecondary" onClick={()=>openNewClass()}>Add class</button></div><div className="masterTimetable">{[1,2,3,4,5,6,0].map(day=>{const dayClasses=classes.filter(c=>(!scheduleFilter||c.venue_id===scheduleFilter)&&c.weekday===day).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.name.localeCompare(b.name));return <div className="masterDay" key={day}><div className="masterDayHead"><strong>{dayNames[day]}</strong><button className="btn btnSecondary" type="button" onClick={()=>openNewClass(day)}>+ Add to {dayNames[day]}</button></div><div className="masterDayClasses">{dayClasses.map(c=>{const slots=classSlots.filter(x=>x.class_id===c.id).sort((a,b)=>a.slot_number-b.slot_number);return <div className={`masterClassRow masterClassClickable ${venueColourClass(c.venue_id)}`} key={c.id} role="button" tabIndex={0} onClick={()=>openEditClass(c)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openEditClass(c)}}}><div className="masterTime">{c.start_time.slice(0,5)}–{c.finish_time.slice(0,5)}</div><div className="masterClassInfo"><strong>{c.name}</strong><span>{venueName(c.venue_id)}</span><small>{slots.map(x=>profileById(x.default_profile_id)?.full_name||"Unassigned").join(" · ")}</small><em>Click to edit</em></div><div className="masterClassActions"><button className="btn btnPrimary" type="button" onClick={e=>{e.stopPropagation();openEditClass(c)}}>Edit</button><button className="btn btnSecondary" type="button" onClick={e=>{e.stopPropagation();duplicateClassGroup(c)}}>Duplicate</button><button className="btn btnDanger" type="button" onClick={e=>{e.stopPropagation();void archiveClass(c)}}>Archive</button></div></div>})}{!dayClasses.length&&<div className="masterEmpty">No regular classes</div>}</div></div>})}</div></div>
      <div className="card"><div className="sectionHeader"><div><h2>{monthLabel(month)} staffing</h2><p>Drag one staffing card onto another to swap coach assignments. Use Agenda for detailed editing.</p></div><div className="scheduleLegend"><span>Forecast {money(forecastCost)}</span><span>Confirmed {money(confirmedScheduleCost)}</span></div></div>
      {scheduleView==="calendar"?<div className="staffingBoard">{(()=>{
        const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate();
        return Array.from({length:last},(_,i)=>{
          const d=i+1,date=`${month}-${String(d).padStart(2,"0")}`;
          const items=visibleScheduled.filter(s=>s.shift_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.class_name.localeCompare(b.class_name));
          const extras=additionalWorkScope.filter(s=>s.shift_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time));
          const removed=removedOccurrences.filter(r=>r.shift_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time));
          const totalItems=items.length+extras.length;
          return <div className={`staffingBoardDay ${totalItems||removed.length?"hasShifts":"emptyDay"}`} key={date}>
            <div className="staffingBoardDate"><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</strong><span>{totalItems?`${totalItems} ${totalItems===1?"item":"items"}`:removed.length?`${removed.length} removed`:"No coaching"}</span></div>
            <div className="staffingBoardShifts">{items.map(s=><div className={`staffingCalendarShift ${s.status} ${venueColourClass(s.venue_id)}`} key={s.id} draggable={s.status!=="cancelled"} onClick={()=>openAdminScheduleShift(s)} onDragStart={e=>{e.stopPropagation();setDragShiftId(s.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragShiftId)void swapScheduledAssignments(dragShiftId,s.id);setDragShiftId(null)}}><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)} · {s.class_name}</strong><span>{profileById(s.profile_id)?.full_name||"Unassigned"}</span><small>{venueName(s.venue_id)} · Tap to manage</small></div>)}{extras.map(s=><div className={`staffingCalendarShift ${s.approval_status==="pending"?"v311PendingExtra":"v313ApprovedExtra"}`} key={`extra-${s.id}`} onClick={()=>setShiftModal(s)}><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)} · {s.session_location||"Additional work"}</strong><span>{profileById(s.coach_id)?.full_name||"Staff member"}</span><small>{venueName(s.venue_id)} · Additional shift · {s.approval_status==="pending"?"Approval required":"Approved"}</small></div>)}{removed.map(r=><div className="staffingCalendarShift v314RemovedOccurrence" key={`removed-${r.class_id}-${r.shift_date}`}><strong>{r.start_time.slice(0,5)}–{r.finish_time.slice(0,5)} · {r.class_name}</strong><span>{venueName(r.venue_id)} · Removed from this date</span><button className="v314RestoreButton" type="button" onClick={e=>{e.stopPropagation();void restoreRemovedOccurrence(r)}}>Restore</button></div>)}</div>
          </div>
        });
      })()}</div>:<div className="scheduleAgenda v311Agenda">{Array.from(new Set([...Object.keys(grouped),...additionalWorkScope.map(s=>s.shift_date),...removedOccurrences.map(r=>r.shift_date)])).sort().map(date=>{const items=(grouped[date]||[]) as ScheduledShift[];const extras=additionalWorkScope.filter(s=>s.shift_date===date);const removed=removedOccurrences.filter(r=>r.shift_date===date);return <div className="scheduleDay" key={date}><div className="scheduleDate"><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</strong><span>{items.length+extras.length} active{removed.length?` · ${removed.length} removed`:""}</span></div>{items.map(s=>{const allowed=staffOptionsForVenue(s.venue_id);return <div className={`scheduleShift v311ScheduleRow ${s.status} ${venueColourClass(s.venue_id)}`} key={s.id} onClick={()=>openAdminScheduleShift(s)}><div className="scheduleShiftMain"><div className="scheduleTime">{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</div><div><strong>{s.class_name}</strong><span>{venueName(s.venue_id)} · {scheduleHours(s).toFixed(2)}h</span></div></div><div className="v311RowCoach"><span>Coach</span><strong>{profileById(s.profile_id)?.full_name||"Unassigned"}</strong></div><div className="v311RowStatus"><span className={`scheduleStatus ${s.status}`}>{s.adjustment_status==="pending"?"Approval pending":s.status}</span><button className="btn btnSecondary" type="button" onClick={e=>{e.stopPropagation();openAdminScheduleShift(s)}}>Manage</button></div></div>})}{extras.map(s=><div className={`scheduleShift v311ScheduleRow v311ExtraRow ${s.approval_status==="approved"?"v313ApprovedExtraRow":""}`} key={`extra-${s.id}`} onClick={()=>setShiftModal(s)}><div className="scheduleShiftMain"><div className="scheduleTime">{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</div><div><strong>{s.session_location||"Additional work"}</strong><span>{venueName(s.venue_id)} · {shiftHours(s).toFixed(2)}h</span></div></div><div className="v311RowCoach"><span>{s.approval_status==="pending"?"Submitted by":"Coach"}</span><strong>{profileById(s.coach_id)?.full_name||"Staff member"}</strong></div><div className="v311RowStatus"><span className={`scheduleStatus ${s.approval_status==="pending"?"v311PendingBadge":"v313ApprovedBadge"}`}>{s.approval_status==="pending"?"Approval required":"Additional shift · Approved"}</span><button className={`btn ${s.approval_status==="pending"?"btnAccent":"btnSecondary"}`} type="button" onClick={e=>{e.stopPropagation();setShiftModal(s)}}>{s.approval_status==="pending"?"Review":"View"}</button></div></div>)}{removed.map(r=><div className="scheduleShift v311ScheduleRow v314RemovedAgenda" key={`removed-${r.class_id}-${r.shift_date}`}><div className="scheduleShiftMain"><div className="scheduleTime">{r.start_time.slice(0,5)}–{r.finish_time.slice(0,5)}</div><div><strong>{r.class_name}</strong><span>{venueName(r.venue_id)} · Removed from this date</span></div></div><div className="v311RowCoach"><span>Status</span><strong>Removed occurrence</strong></div><div className="v311RowStatus"><span className="scheduleStatus v314RemovedBadge">Removed</span><button className="btn btnSecondary" type="button" onClick={()=>restoreRemovedOccurrence(r)}>Restore</button></div></div>)}</div>})}{!visibleScheduled.length&&!additionalWorkScope.length&&!removedOccurrences.length&&<div className="empty">Generate {monthLabel(month)} to create the staffing rota from your regular classes.</div>}</div>}</div></div></>;
  }

  function TimesheetView(){
    if(isAdmin&&!viewingOther)return <><PageHead title="Timesheets" sub="Open a coach to review, add, edit or delete their shifts."><MonthSelect/></PageHead><div className="card"><div className="sectionHeader"><div><h2>{monthLabel(month)}</h2><p>{submittedCount} of {adminRows.length} coaches submitted.</p></div></div><div className="mobileDataList">{adminRows.map(r=><div className="mobileAdminCard" key={r.coach.id}><div className="mobileAdminHead"><div><strong>{r.coach.full_name}</strong><span>{r.coach.email}</span></div><StatusPill status={r.timesheet?.status}/></div><div className="mobileAdminStats"><span><small>Hours</small><strong>{r.hours.toFixed(2)}</strong></span><span><small>Value</small><strong>{money(r.value)}</strong></span></div><div className="mobileAdminActions"><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open / edit</button>{(!r.timesheet||r.timesheet.status==="draft")&&r.hours>0&&<button className="btn btnPrimary" onClick={()=>adminSubmitMonth(r.coach.id)}>Submit on behalf</button>}{r.timesheet?.status==="submitted"&&<><button className="btn btnSecondary" onClick={()=>reopen(r)}>Reopen</button><button className="btn btnPrimary" onClick={()=>markPaid(r)}>Mark paid</button></>}{r.timesheet?.status==="paid"&&<button className="btn btnDanger" onClick={()=>reopen(r)}>Reopen paid month</button>}</div></div>)}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th className="num">Value</th><th>Status</th><th>Actions</th></tr></thead><tbody>{adminRows.map(r=><tr key={r.coach.id}><td><strong>{r.coach.full_name}</strong><div className="muted" style={{fontSize:11}}>{r.coach.email}</div></td><td className="num">{r.hours.toFixed(2)}</td><td className="num">{money(r.value)}</td><td><StatusPill status={r.timesheet?.status}/></td><td><div className="row"><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open / edit</button>{(!r.timesheet||r.timesheet.status==="draft")&&r.hours>0&&<button className="btn btnPrimary" onClick={()=>adminSubmitMonth(r.coach.id)}>Submit on behalf</button>}{r.timesheet?.status==="submitted"&&<><button className="btn btnSecondary" onClick={()=>reopen(r)}>Reopen</button><button className="btn btnPrimary" onClick={()=>markPaid(r)}>Mark paid</button></>}{r.timesheet?.status==="paid"&&<button className="btn btnDanger" onClick={()=>reopen(r)}>Reopen paid month</button>}</div></td></tr>)}</tbody></table></div></div></>;

    return <><PageHead title={viewingOther?`${activeCoach.full_name}'s timesheet`:"My Timesheet"} sub={viewingOther?"Admin view — reopen submitted months before changing them.":"Confirmed rota work and approved additional work appear here automatically. Submit the month when everything is correct."}><div className="row">{viewingOther&&<button className="btn btnSecondary" onClick={backToAdmin}>← All coaches</button>}<MonthSelect/></div></PageHead>{TimesheetCalendar({})}</>
  }

  function TimesheetCalendar({compact=false}:{compact?:boolean}){
    const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),start=(new Date(y,m-1,1).getDay()+6)%7;
    const canEdit=isAdmin && timesheet?.status!=="submitted"&&timesheet?.status!=="paid";
    const defaultVenue=(isAdmin?adminVenues()[0]:profileVenues(activeCoach.id)[0])?.id||null;
    const newShift=(date=`${month}-${String(Math.min(new Date().getDate(),last)).padStart(2,"0")}`)=>setShiftModal({coach_id:activeCoach.id,shift_date:date,start_time:"16:30",finish_time:"20:30",break_minutes:0,venue_id:defaultVenue,session_location:"",notes:""});
    const sorted=[...shifts].sort((a,b)=>`${a.shift_date}${a.start_time}`.localeCompare(`${b.shift_date}${b.start_time}`));
    return <div className="card timesheetCard"><div className="calendarToolbar"><div><strong>{monthLabel(month)}</strong><div className="muted" style={{fontSize:11,marginTop:3}}>{viewingOther?`Viewing ${activeCoach.full_name}`:locked?"Submitted months are locked until unsubmitted.":"Scheduled classes flow in when confirmed. Use Add extra shift only for unscheduled work."}{timesheet?.submitted_by&&timesheet.submitted_by!==activeCoach.id?" · Submitted by an administrator":""}</div></div><div className="row">{canEdit&&<><button className="btn btnAccent mobilePrimaryAdd" onClick={()=>newShift()}><PlusIcon/>Add extra shift</button><button className="btn btnSecondary" onClick={()=>setTemplateOpen(true)}>Regular shifts</button>{templates.length>0&&<button className="btn btnSecondary" onClick={fillMonthFromTemplates}>Fill month</button>}<button className="btn btnSecondary" onClick={copyPrevious}>Copy previous month</button></>}</div></div>
      <div className="mobileShiftList">
        {sorted.length===0?<div className="mobileEmpty"><ClockIcon/><strong>No shifts added yet</strong><span>No unscheduled work added for {monthLabel(month)}.</span>{canEdit&&<button className="btn btnAccent" onClick={()=>newShift()}><PlusIcon/>Add extra shift</button>}</div>:sorted.map(s=><button className="mobileShiftCard" key={s.id} onClick={()=>canEdit&&setShiftModal(s)}><div className="mobileShiftDate"><strong>{new Date(`${s.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})}</strong><span>{venueName(s.venue_id)}</span></div><div className="mobileShiftMain"><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong><span>{s.session_location||"Coaching"}</span></div><div className="mobileShiftHours">{s.approval_status==="pending"?"Pending":`${shiftHours(s).toFixed(2)}h`}</div></button>)}
      </div>
      <div className="calendarScroll desktopCalendar"><div className="calendar">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div className="dow" key={d}>{d}</div>)}{Array.from({length:start},(_,i)=><div className="day dayBlank" key={`b${i}`}/>) }
        {Array.from({length:last},(_,i)=>{const d=i+1,date=`${month}-${String(d).padStart(2,"0")}`,items=shifts.filter(s=>s.shift_date===date);return <div className="day" key={date}><div className="dayNum">{d}</div>{canEdit&&<button className="dayAdd" onClick={()=>newShift(date)}>+</button>}{items.map(s=><div className="shiftChip" key={s.id} onClick={()=>canEdit&&setShiftModal(s)}><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong><br/><span className="venueDot"/>{venueName(s.venue_id)}<br/>{s.session_location||"Coaching"}<br/><span className="muted">{shiftHours(s).toFixed(2)}h</span></div>)}</div>})}</div></div>
      <div className="calendarFooter"><div><strong>{totalHours.toFixed(2)} hours</strong><div className="muted" style={{fontSize:11}}>{money(totalValue)} at {money(activeCoach.hourly_rate)}/hr</div></div><div className="row">
        {viewingOther?<>{(!timesheet||timesheet.status==="draft")&&shifts.length>0&&<button className="btn btnPrimary" onClick={()=>adminSubmitMonth(activeCoach.id)}>Submit on behalf</button>}{timesheet?.status==="submitted"&&<button className="btn btnDanger" onClick={()=>{const r=adminRows.find(x=>x.coach.id===activeCoach.id);if(r)void reopen(r)}}>Reopen to edit</button>}{timesheet?.status==="paid"&&<><span className="pill pillPaid"><span className="dot"/>Paid</span><button className="btn btnDanger" onClick={()=>{const r=adminRows.find(x=>x.coach.id===activeCoach.id);if(r)void reopen(r)}}>Reopen paid month</button></>}</>:<>
          {timesheet?.status==="submitted"&&<button className="btn btnDanger" onClick={unsubmitMonth}>Unsubmit & correct</button>}
          {timesheet?.status==="paid"?<span className="pill pillPaid"><span className="dot"/>Paid</span>:timesheet?.status!=="submitted"&&<button className="btn btnPrimary submitMonthButton" onClick={submitMonth}>Submit month & create invoice</button>}
        </>}
      </div></div>
    </div>
  }

  function InvoicesView(){
    return <><PageHead title={isAdmin?"Invoices":"My Payslips"} sub={isAdmin?"All generated coach invoices and payment history.":"Your monthly pay/invoice archive."}/>
      <div className="card"><div className="mobileDataList">{allInvoices.map((inv:any)=>{const coach=isAdmin?({...staff.find(s=>s.id===inv.coach_id),...(inv.profiles||{})} as Profile):ownProfile;return <div className="mobileAdminCard" key={inv.id}><div className="mobileAdminHead"><div><strong>{inv.invoice_number}</strong><span>{isAdmin?`${inv.profiles?.full_name||coach.full_name} · `:""}{inv.venues?.name||venueName(inv.venue_id)}</span></div><StatusPill status={inv.status==="awaiting_payment"?"submitted":inv.status}/></div><div className="mobileAdminStats"><span><small>Hours</small><strong>{Number(inv.hours).toFixed(2)}</strong></span><span><small>Amount</small><strong>{money(inv.total_amount)}</strong></span></div><div className="mobileAdminActions"><button className="btn btnSecondary" onClick={()=>downloadPDF(inv,coach)}>Download PDF</button>{isAdmin&&inv.status==="awaiting_payment"&&<button className="btn btnPrimary" onClick={()=>markInvoicePaid(inv)}>Mark paid</button>}</div></div>})}{!allInvoices.length&&<div className="empty">No invoices yet.</div>}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Invoice</th>{isAdmin&&<th>Coach</th>}<th>Organisation</th><th>Date</th><th className="num">Hours</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>{allInvoices.map((inv:any)=>{const coach=isAdmin?({...staff.find(s=>s.id===inv.coach_id),...(inv.profiles||{})} as Profile):ownProfile;return <tr key={inv.id}><td><strong>{inv.invoice_number}</strong></td>{isAdmin&&<td>{inv.profiles?.full_name||coach.full_name}</td>}<td>{inv.venues?.name||venueName(inv.venue_id)}</td><td>{dateText(inv.invoice_date)}</td><td className="num">{Number(inv.hours).toFixed(2)}</td><td className="num"><strong>{money(inv.total_amount)}</strong></td><td><StatusPill status={inv.status==="awaiting_payment"?"submitted":inv.status}/></td><td><div className="row"><button className="btn btnSecondary" onClick={()=>downloadPDF(inv,coach)}>Download PDF</button>{isAdmin&&inv.status==="awaiting_payment"&&<button className="btn btnPrimary" onClick={()=>markInvoicePaid(inv)}>Mark paid</button>}</div></td></tr>})}{!allInvoices.length&&<tr><td colSpan={isAdmin?8:7} className="empty">No invoices yet.</td></tr>}</tbody></table></div></div>
    </>
  }

  function StaffView(){
    const activeCount=filteredStaff.filter(s=>s.is_active).length;
    const portalCount=filteredStaff.filter(s=>Boolean(s.email)).length;
    const recentCount=filteredStaff.filter(s=>s.last_login_at&&Date.now()-new Date(s.last_login_at).getTime()<30*86400000).length;
    const roleLabel=(s:Profile)=>s.role==="admin"?"Super admin":s.role==="org_admin"?"Organisation admin":"Coach";
    const lastLogin=(s:Profile)=>s.last_login_at?new Date(s.last_login_at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):s.email?"Never":"No portal account";
    return <><PageHead title="People" sub="Manage staff details, organisations, account access and security."><button className="btn btnPrimary" onClick={()=>setInviteOpen(true)}><PlusIcon/>Add staff</button></PageHead>
      <div className="grid grid3 v32PeopleStats"><StatCard label="Active staff" value={String(activeCount)} foot={`${filteredStaff.length} total profiles`} icon={<UsersIcon/>}/><StatCard label="Portal access" value={String(portalCount)} foot={`${filteredStaff.length-portalCount} not invited yet`} icon={<CheckIcon/>}/><StatCard label="Recently signed in" value={String(recentCount)} foot="Within the last 30 days" icon={<ClockIcon/>}/></div>
      <div className="card section"><div className="sectionHeader"><div className="staffFilters"><div className="searchBar"><SearchIcon/><input placeholder="Search staff…" value={search} onChange={e=>setSearch(e.target.value)}/></div><select value={venueFilter} onChange={e=>setVenueFilter(e.target.value)}><option value="">All organisations</option>{adminVenues().map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div><div className="muted" style={{fontSize:12}}>{filteredStaff.length} people</div></div>
        <div className="v32PeopleGrid">{filteredStaff.map(s=><button className="v32PersonCard" key={s.id} onClick={()=>openStaffEdit(s)}>
          <div className="v32PersonTop"><div className="v32PersonAvatar">{initials(s.full_name)}</div><div className="v32PersonIdentity"><strong>{s.full_name||"Unnamed coach"}</strong><span>{s.job_title||roleLabel(s)}</span></div><span className={`v32AccountDot ${s.is_active?"active":"inactive"}`}>{s.is_active?"Active":"Inactive"}</span></div>
          <div className="venueBadges">{profileVenues(s.id).map(v=><span className="venueBadge" key={v.id}>{v.name}</span>)}{!profileVenues(s.id).length&&<span className="venueBadge mutedBadge">No organisation</span>}</div>
          <div className="v32PersonMeta"><div><span>Account</span><strong>{s.email?"Portal enabled":"Not invited"}</strong></div><div><span>Last sign in</span><strong>{lastLogin(s)}</strong></div></div>
          <div className="v32PersonFooter"><span>{s.email||"Add an email when ready"}</span><strong>Open profile →</strong></div>
        </button>)}</div>
        {!filteredStaff.length&&<div className="empty">No staff match these filters.</div>}
      </div>
    </>
  }

  function ReportsView(){
    const avg=adminRows.length?adminHours/adminRows.length:0;
    return <><PageHead title="Reports & audit" sub="Monthly staffing cost plus a trace of changes made in the portal."><MonthSelect/></PageHead>
      <div className="grid grid4"><StatCard label="Total hours" value={adminHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Estimated coach cost" value={money(adminRows.reduce((a,r)=>a+r.value,0))} foot="Hours × agreed rates" icon={<PoundIcon/>}/><StatCard label="Average hours" value={avg.toFixed(2)} foot="Per active coach" icon={<UsersIcon/>}/><StatCard label="Submission rate" value={adminRows.length?`${Math.round(submittedCount/adminRows.length*100)}%`:"0%"} foot={`${submittedCount} submitted`} icon={<CheckIcon/>}/></div>
      <div className="card section"><div className="sectionHeader"><div><h2>Hours & cost by venue</h2><p>Based on the organisation selected on each shift.</p></div></div><div className="venueSummaryGrid">{adminVenues().map(v=>{const vs=adminMonthShifts.filter(s=>s.venue_id===v.id);const hrs=vs.reduce((a,s)=>a+shiftHours(s),0);const cost=vs.reduce((a,s)=>a+shiftHours(s)*Number(staff.find(p=>p.id===s.coach_id)?.hourly_rate||0),0);const people=new Set(vs.map(s=>s.coach_id)).size;return <div className="venueSummary" key={v.id}><div className="venueSummaryName"><span className="venueSwatch" style={{background:v.brand_color||undefined}}/>{v.name}</div><strong>{hrs.toFixed(2)}h</strong><span>{money(cost)} · {people} staff</span></div>})}</div></div>
      <div className="section"><div className="card"><div className="sectionHeader"><div><h2>Cost by coach</h2><p>Current selected month.</p></div></div><div className="mobileDataList">{[...adminRows].sort((a,b)=>b.value-a.value).map(r=><div className="mobileReportRow" key={r.coach.id}><strong>{r.coach.full_name}</strong><span>{r.hours.toFixed(2)}h</span><b>{money(r.value)}</b></div>)}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th className="num">Cost</th></tr></thead><tbody>{[...adminRows].sort((a,b)=>b.value-a.value).map(r=><tr key={r.coach.id}><td>{r.coach.full_name}</td><td className="num">{r.hours.toFixed(2)}</td><td className="num">{money(r.value)}</td></tr>)}</tbody></table></div></div></div>
      {isGlobalAdmin&&<div className="section"><button className="btn btnSecondary" onClick={()=>setAuditOpen(!auditOpen)}>{auditOpen?"Hide activity history":"View activity history"}</button>{auditOpen&&<div className="card" style={{marginTop:12}}><div className="activityList">{audits.slice(0,30).map(a=><div className="activityItem" key={a.id}><div className="activityIcon"><ClockIcon/></div><div><div className="activityText"><strong>{a.action.replaceAll("_"," ")}</strong> · {a.entity_type}</div><div className="activityTime">{fmtStamp(a.created_at)}</div></div></div>)}{!audits.length&&<div className="empty">No recorded activity yet.</div>}</div></div>}</div>}
    {isGlobalAdmin&&<div className="section"><PageHead title="Launch tools" sub="Clear test data before real staff begin using the portal."/><div className="card dangerZone"><div className="formSection"><div className="formSectionTitle"><h3>System reset</h3><p>This is permanent. It keeps AV branding, Kirklees/Greenhead organisation settings and the Super Admin account you are currently using.</p></div><div className="resetSummary"><strong>Always cleared</strong><span>Scheduled sessions · classes · regular shift templates · shifts · timesheets · invoices · audit/test activity</span></div><label className="checkCard resetOption"><input type="checkbox" checked={resetRemoveStaff} onChange={e=>setResetRemoveStaff(e.target.checked)}/><span><strong>Also remove every other staff account</strong><small>Use this only when you want a completely clean launch. Your current Super Admin is protected.</small></span></label><div className="field"><label>Type RESET MY DATA to enable</label><input value={resetConfirm} onChange={e=>setResetConfirm(e.target.value)} placeholder="RESET MY DATA" autoComplete="off"/></div><button className="btn btnDanger" type="button" disabled={resetBusy||resetConfirm!=="RESET MY DATA"} onClick={runLaunchReset}>{resetBusy?"Resetting…":resetRemoveStaff?"Reset data & remove other staff":"Reset operational data"}</button></div></div></div>}
    </>
  }

  async function runLaunchReset(){
    if(!isGlobalAdmin){flash("Super Admin only.");return}
    if(resetConfirm!=="RESET MY DATA"){flash('Type "RESET MY DATA" exactly before resetting.');return}
    const warning=resetRemoveStaff
      ?"This permanently clears all operational/test data AND deletes every other user account. Your current Super Admin and organisation settings remain. Continue?"
      :"This permanently clears schedules, classes, shifts, timesheets, invoices, templates and audit/test activity. Staff accounts remain. Continue?";
    if(!confirm(warning))return;
    setResetBusy(true);
    try{
      const res=await fetch("/api/launch-reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({confirm:"RESET MY DATA",remove_staff:resetRemoveStaff})});
      const j=await res.json();
      if(!res.ok){flash(j.error||"Reset failed.");return}
      setResetConfirm("");
      flash(resetRemoveStaff?"Launch reset complete. Other staff accounts removed.":"Launch reset complete. Staff accounts kept.");
      await Promise.all([loadStaff(),loadInvoices(),loadAudits(),loadSchedule(),loadAdmin(),loadCoachMonth(initialProfile.id),loadTemplates(initialProfile.id)]);
    }catch(e:any){flash(e?.message||"Reset failed.")}finally{setResetBusy(false)}
  }

  function SettingsView(){
    const invoiceOrganisationVisible=(v:Venue)=>{
      const key=`${v.name||""} ${v.slug||""}`.toLowerCase();
      return !key.includes("other")&&!key.includes("event");
    };
    const editableOrgs=(isGlobalAdmin?venues:venues.filter(v=>managedVenueIds.includes(v.id))).filter(invoiceOrganisationVisible);
    return <>{isGlobalAdmin&&<><PageHead title="Portal settings" sub="Workspace settings for AV Gymnastics."/><div className="card" style={{maxWidth:780}}>
      <div className="formSection"><div className="formSectionTitle"><h3>Organisation</h3><p>Shown on generated invoices.</p></div><div className="field"><label>Business name</label><input value={business.business_name} onChange={e=>setBusiness({...business,business_name:e.target.value})}/></div><div className="field"><label>Business address</label><textarea value={business.business_address||""} onChange={e=>setBusiness({...business,business_address:e.target.value})}/></div></div>
      <div className="formSection"><div className="formSectionTitle"><h3>Timesheets & payment</h3><p>Submission is due on this day of the following month.</p></div><div className="grid grid2"><div className="field"><label>Cut-off day</label><select value={business.cutoff_day} onChange={e=>setBusiness({...business,cutoff_day:Number(e.target.value)})}>{Array.from({length:7},(_,i)=>i+1).map(d=><option value={d} key={d}>{d}{d===1?"st":d===2?"nd":d===3?"rd":"th"} of following month</option>)}</select></div><div className="field"><label>Payment note</label><input value={business.payment_note||""} onChange={e=>setBusiness({...business,payment_note:e.target.value})}/></div></div><button className="btn btnPrimary" onClick={saveBusiness} disabled={saving}>{saving?"Saving…":"Save settings"}</button></div>
    </div></>}<div className="section"><PageHead title="Organisation invoice settings" sub="Each organisation gets its own legal name and invoice address. A coach working at both gets separate invoices automatically."/><div className="grid grid2">{editableOrgs.map(v=>{const d=venueDrafts[v.id]||v;return <div className="card" key={v.id}><div className="formSection"><div className="formSectionTitle"><h3>{v.name}</h3><p>Used only for shifts/invoices belonging to this organisation.</p></div><div className="field"><label>Legal / invoice name</label><input value={d.legal_name||""} onChange={e=>setVenueDrafts({...venueDrafts,[v.id]:{...d,legal_name:e.target.value}})}/></div><div className="field"><label>Invoice address</label><textarea value={d.invoice_address||""} onChange={e=>setVenueDrafts({...venueDrafts,[v.id]:{...d,invoice_address:e.target.value}})}/></div><div className="grid grid2"><div className="field"><label>Invoice prefix</label><input value={d.invoice_prefix||""} onChange={e=>setVenueDrafts({...venueDrafts,[v.id]:{...d,invoice_prefix:e.target.value.toUpperCase()}})}/></div><div className="field"><label>Payment note</label><input value={d.payment_note||""} onChange={e=>setVenueDrafts({...venueDrafts,[v.id]:{...d,payment_note:e.target.value}})}/></div></div><button className="btn btnPrimary" onClick={()=>saveOrganisation(d)}>Save {v.name}</button></div></div>})}</div></div></>
  }

  function ProfileView(){
    const p=ownProfile,fields=[p.full_name,p.email,p.phone,p.address,p.account_name,p.sort_code,p.account_number,p.invoice_prefix,p.emergency_contact_name,p.emergency_contact_phone],complete=Math.round(fields.filter(Boolean).length/fields.length*100);
    return <><PageHead title="My profile" sub="Personal, payment and security information."/><div className="card profileHero"><div className="profileAvatar">{initials(p.full_name)}</div><div><div className="profileName">{p.full_name}</div><div className="profileMeta">{p.email} · {p.job_title||p.role}</div></div><div className="completion"><strong>{complete}% complete</strong><div className="progress"><span style={{width:`${complete}%`}}/></div></div></div>
      <div className="grid grid2 section">
        <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Personal details</h3></div><div className="field"><label>Name / trading name</label><input value={p.full_name} onChange={e=>setOwnProfile({...p,full_name:e.target.value})}/></div><div className="field"><label>Email</label><input value={p.email||""} disabled/></div><div className="field"><label>Mobile</label><input value={p.phone||""} onChange={e=>setOwnProfile({...p,phone:e.target.value})}/></div><div className="field"><label>Address</label><textarea value={p.address||""} onChange={e=>setOwnProfile({...p,address:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Emergency contact</label><input value={p.emergency_contact_name||""} onChange={e=>setOwnProfile({...p,emergency_contact_name:e.target.value})}/></div><div className="field"><label>Emergency phone</label><input value={p.emergency_contact_phone||""} onChange={e=>setOwnProfile({...p,emergency_contact_phone:e.target.value})}/></div></div></div></div>
        <div className="card v32SecurityCard"><div className="formSection"><div className="formSectionTitle"><h3>Security</h3><p>Change the password you use to access AV Gymnastics.</p></div>{p.force_password_reset&&<div className="notice">An administrator has requested that you change your password.</div>}<div className="field"><label>New password</label><input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Minimum 8 characters"/></div><div className="field"><label>Confirm new password</label><input type="password" autoComplete="new-password" value={confirmNewPassword} onChange={e=>setConfirmNewPassword(e.target.value)}/></div><button className="btn btnPrimary" onClick={changeOwnPassword} disabled={passwordBusy}>{passwordBusy?"Updating…":"Change password"}</button><div className="v32SecurityMeta"><span>Last sign in</span><strong>{p.last_login_at?new Date(p.last_login_at).toLocaleString("en-GB"):"Not recorded yet"}</strong></div></div></div>
        <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Payment details</h3><p>Used on self-employed invoices.</p></div><div className="field"><label>Account name</label><input value={p.account_name||""} onChange={e=>setOwnProfile({...p,account_name:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Sort code</label><input value={p.sort_code||""} onChange={e=>setOwnProfile({...p,sort_code:e.target.value})}/></div><div className="field"><label>Account number</label><input value={p.account_number||""} onChange={e=>setOwnProfile({...p,account_number:e.target.value})}/></div></div><div className="grid grid2"><div className="field"><label>UTR</label><input value={p.utr||""} onChange={e=>setOwnProfile({...p,utr:e.target.value})}/></div><div className="field"><label>Invoice prefix</label><input value={p.invoice_prefix||""} onChange={e=>setOwnProfile({...p,invoice_prefix:e.target.value.toUpperCase()})}/></div></div></div></div>
        <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Compliance</h3></div><div className="grid grid2"><div className="field"><label>DBS expiry</label><input type="date" value={p.dbs_expiry||""} onChange={e=>setOwnProfile({...p,dbs_expiry:e.target.value})}/></div><div className="field"><label>First Aid expiry</label><input type="date" value={p.first_aid_expiry||""} onChange={e=>setOwnProfile({...p,first_aid_expiry:e.target.value})}/></div></div><div className="field"><label>Safeguarding expiry</label><input type="date" value={p.safeguarding_expiry||""} onChange={e=>setOwnProfile({...p,safeguarding_expiry:e.target.value})}/></div><div className="field"><label>Qualifications</label><textarea placeholder="e.g. Level 2 Trampoline, DMT Module..." value={p.qualifications||""} onChange={e=>setOwnProfile({...p,qualifications:e.target.value})}/></div></div></div>
      </div>
      <div className="section"><button className="btn btnPrimary" onClick={saveOwnProfile} disabled={saving}>{saving?"Saving…":"Save profile"}</button></div>
    </>
  }

  function AdminScheduleShiftModal(){
    const s=adminScheduleShift!;
    const allowed=staffOptionsForVenue(s.venue_id);
    return <div className="modalBackdrop"><div className="modal v311AdminShiftModal">
      <div className={`v311AdminShiftHero ${venueColourClass(s.venue_id)}`}>
        <div><span>Schedule control</span><h2>{s.class_name}</h2><p>{new Date(`${s.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})} · {s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</p></div>
        <button className="iconButton" onClick={()=>setAdminScheduleShift(null)}>×</button>
      </div>
      <div className="modalBody">
        <div className="v311ShiftSummary"><div><span>Organisation</span><strong>{venueName(s.venue_id)}</strong></div><div><span>Planned hours</span><strong>{scheduleHours(s).toFixed(2)}h</strong></div><div><span>Status</span><strong className={`scheduleStatus ${s.status}`}>{s.adjustment_status==="pending"?"Approval pending":s.status}</strong></div></div>
        <div className="field"><label>Assigned coach</label><select value={s.profile_id||""} disabled={s.status==="cancelled"||s.status==="confirmed"} onChange={async e=>{const value=e.target.value;await reassignScheduled(s,value);setAdminScheduleShift({...s,profile_id:value||null})}}><option value="">Unassigned</option>{allowed.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
        <div className="v311AdminActions">
          {s.adjustment_status==="pending"&&<button className="btn btnAccent" onClick={async()=>{await approveRotaAdjustment(s);setAdminScheduleShift(null)}}>Approve extra time</button>}
          {s.status==="scheduled"&&s.profile_id&&<button className="btn btnPrimary" onClick={async()=>{await confirmScheduled(s);setAdminScheduleShift(null)}}>Confirm worked</button>}
          {s.status==="confirmed"&&<button className="btn btnSecondary" onClick={async()=>{await unconfirmScheduled(s);setAdminScheduleShift(null)}}>Unconfirm</button>}
          {s.status!=="confirmed"&&<button className={`btn ${s.status==="cancelled"?"btnSecondary":"btnDanger"}`} onClick={()=>toggleScheduledCancelled(s)}>{s.status==="cancelled"?"Restore session":"Cancel session"}</button>}
          {s.status!=="confirmed"&&<button className="btn btnSecondary" onClick={()=>{setAdminScheduleShift(null);openAdjustment(s)}}>Edit actual time</button>}
        </div>
        <div className="v311RemoveOccurrence">
          <strong>Remove from this date</strong>
          <p>Completely removes this class occurrence from this day only. It will not change the Master Timetable, previous months or future months.</p>
          <button className="btn btnDanger" disabled={s.status==="confirmed"} onClick={()=>removeScheduledOccurrence(s)}>Remove this occurrence</button>
          {s.status==="confirmed"&&<small>Unconfirm the shift before removing it.</small>}
        </div>
      </div>
    </div></div>
  }

  function ConfirmShiftModal(){
    const s=confirmShift!;
    return <div className="modalBackdrop"><div className="modal v31ConfirmModal">
      <div className="v31ConfirmHero"><div className="v31ConfirmIcon"><CheckIcon/></div><span>Confirm session</span><h2>{s.class_name}</h2><p>{venueName(s.venue_id)}</p></div>
      <div className="modalBody v31ConfirmBody">
        <div className="v31ConfirmFacts">
          <div><span>Planned time</span><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong></div>
          <div><span>Hours</span><strong>{scheduleHours(s).toFixed(2)}h</strong></div>
          <div><span>Date</span><strong>{new Date(`${s.shift_date}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}</strong></div>
        </div>
        <div className="v31ConfirmPrompt"><strong>Did you work this session as planned?</strong><span>If the time changed, adjust it before confirming.</span></div>
      </div>
      <div className="modalFoot v31ConfirmFoot"><button className="btn btnSecondary" onClick={()=>setConfirmShift(null)}>Not yet</button><button className="btn btnSecondary" onClick={()=>{setConfirmShift(null);openAdjustment(s)}}>Adjust time</button><button className="btn btnPrimary" onClick={async()=>{setConfirmShift(null);await confirmScheduled(s)}}>Confirm shift</button></div>
    </div></div>
  }

  function AdjustmentModal(){
    const s=adjustShift!;
    const planned=scheduleHours(s);
    const actual=shiftHours({coach_id:s.profile_id||"",shift_date:s.shift_date,start_time:adjustStart,finish_time:adjustFinish,break_minutes:adjustBreak,session_location:s.class_name,notes:null});
    const more=actual>planned+0.001;
    return <div className="modalBackdrop"><div className="modal"><div className="modalHead"><h2>Confirm actual time</h2><button className="iconButton" onClick={()=>setAdjustShift(null)}>×</button></div><div className="modalBody"><div className="notice">Scheduled: <strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong> · {planned.toFixed(2)} hours</div><div className="grid grid2"><div className="field"><label>Actual start</label><input type="time" value={adjustStart} onChange={e=>setAdjustStart(e.target.value)}/></div><div className="field"><label>Actual finish</label><input type="time" value={adjustFinish} onChange={e=>setAdjustFinish(e.target.value)}/></div></div><div className="field"><label>Break minutes</label><input type="number" min={0} value={adjustBreak} onChange={e=>setAdjustBreak(Number(e.target.value))}/></div>{more&&!isAdmin&&<><div className="notice">This is <strong>more</strong> than the scheduled time, so it will be sent to an admin for approval.</div><div className="field"><label>Reason for extra time</label><textarea value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} placeholder="e.g. class ran late, parent discussion, extra cover"/></div></>}{!more&&<div className="notice success">This is the same or less than scheduled, so you can confirm it immediately.</div>}</div><div className="modalFoot"><span/><div className="row"><button className="btn btnSecondary" onClick={()=>setAdjustShift(null)}>Cancel</button><button className="btn btnPrimary" onClick={submitRotaActual}>{more&&!isAdmin?"Send for approval":"Confirm actual time"}</button></div></div></div></div>
  }

  function ClassModal(){
    const d=classModal!;
    const dayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const eligible=staffOptionsForVenue(d.venue_id);
    const occurrences=d.occurrences?.length?d.occurrences:[blankClassOccurrence(d.weekday)];

    const updateOccurrence=(key:string,patch:Partial<ClassOccurrenceDraft>)=>{
      setClassModal({...d,occurrences:occurrences.map(o=>o.key===key?{...o,...patch}:o)});
    };
    const addOccurrence=()=>{
      const previous=occurrences[occurrences.length-1]||blankClassOccurrence();
      setClassModal({...d,occurrences:[...occurrences,{
        ...previous,
        key:crypto.randomUUID(),
        id:undefined,
        weekday:(previous.weekday+1)%7,
        coach_ids:[...previous.coach_ids]
      }]});
    };
    const duplicateOccurrence=(o:ClassOccurrenceDraft)=>{
      setClassModal({...d,occurrences:[...occurrences,{
        ...o,
        key:crypto.randomUUID(),
        id:undefined,
        coach_ids:[...o.coach_ids]
      }]});
    };
    const removeOccurrence=(key:string)=>{
      if(occurrences.length<=1){flash("A regular class needs at least one weekly session.");return}
      setClassModal({...d,occurrences:occurrences.filter(o=>o.key!==key)});
    };

    return <div className="modalBackdrop"><div className="modal modalWide">
      <div className="modalHead"><h2>{d.id?"Edit regular class":"Add regular class"}</h2><button className="iconButton" onClick={()=>setClassModal(null)}>×</button></div>
      <div className="modalBody">
        <div className="grid grid2">
          <div className="field"><label>Organisation</label><select value={d.venue_id} onChange={e=>setClassModal({...d,venue_id:e.target.value})}>{adminVenues().map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></div>
          <div className="field"><label>Class / session name</label><input value={d.name} onChange={e=>setClassModal({...d,name:e.target.value})} placeholder="e.g. Champ Tots"/></div>
        </div>

        <div className="formSectionTitle"><h3>Weekly sessions</h3><p>Add as many days as you need. Each occurrence can have a different day, time and default coaching team. Different classes can also run at exactly the same time.</p></div>

        <div className="classOccurrenceList">
          {occurrences.map((o,index)=>{
            const ids=[...o.coach_ids];while(ids.length<o.coaches_required)ids.push("");
            return <div className="classOccurrenceCard" key={o.key}>
              <div className="classOccurrenceHead"><strong>{dayNames[o.weekday]} session {index+1}</strong><div className="row"><button className="btn btnSecondary" type="button" onClick={()=>duplicateOccurrence(o)}>Duplicate session</button>{occurrences.length>1&&<button className="btn btnDanger" type="button" onClick={()=>removeOccurrence(o.key)}>Remove</button>}</div></div>
              <div className="grid grid3">
                <div className="field"><label>Day</label><select value={o.weekday} onChange={e=>updateOccurrence(o.key,{weekday:Number(e.target.value)})}>{dayNames.map((x,i)=><option value={i} key={x}>{x}</option>)}</select></div>
                <div className="field"><label>Start</label><input type="time" value={o.start_time} onChange={e=>updateOccurrence(o.key,{start_time:e.target.value})}/></div>
                <div className="field"><label>Finish</label><input type="time" value={o.finish_time} onChange={e=>updateOccurrence(o.key,{finish_time:e.target.value})}/></div>
              </div>
              <div className="grid grid2">
                <div className="field"><label>Break minutes</label><input type="number" min={0} value={o.break_minutes} onChange={e=>updateOccurrence(o.key,{break_minutes:Number(e.target.value)})}/></div>
                <div className="field"><label>Coaches required</label><input type="number" min={1} max={12} value={o.coaches_required} onChange={e=>{const n=Math.max(1,Number(e.target.value)||1);updateOccurrence(o.key,{coaches_required:n,coach_ids:ids.slice(0,n)})}}/></div>
              </div>
              <div className="grid grid2">{Array.from({length:o.coaches_required},(_,i)=><div className="field" key={i}><label>Default coach {i+1}</label><select value={ids[i]||""} onChange={e=>{const next=[...ids];next[i]=e.target.value;updateOccurrence(o.key,{coach_ids:next})}}><option value="">Unassigned</option>{eligible.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>)}</div>
              <div className="field"><label>Session notes</label><input value={o.notes} onChange={e=>updateOccurrence(o.key,{notes:e.target.value})} placeholder="Optional"/></div>
            </div>
          })}
        </div>

        <button className="btn btnSecondary" type="button" onClick={addOccurrence}><PlusIcon/>Add another day / session</button>
      </div>
      <div className="modalFoot"><span/><div className="row"><button className="btn btnSecondary" onClick={()=>setClassModal(null)}>Cancel</button><button className="btn btnPrimary" disabled={saving||!d.name.trim()||!d.venue_id||!occurrences.length} onClick={saveClass}>{saving?"Saving…":d.id?"Save master class":`Save ${occurrences.length} session${occurrences.length===1?"":"s"}`}</button></div></div>
    </div></div>;
  }

  function TemplateModal(){
    const dayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return <div className="modalBackdrop"><div className="modal"><div className="modalHead"><h2>Regular shifts</h2><button className="iconButton" onClick={()=>setTemplateOpen(false)}>×</button></div><div className="modalBody"><p className="muted">Save your normal weekly sessions once, then use <strong>Fill month</strong> to add the whole month in one tap.</p><div className="templateList">{templates.map(t=><div className="templateRow" key={t.id}><div><strong>{dayNames[t.weekday]} · {t.start_time.slice(0,5)}–{t.finish_time.slice(0,5)}</strong><span>{venueName(t.venue_id)} · {t.session_location||"Coaching"}</span></div><button className="btn btnDanger" onClick={()=>deleteTemplate(t)}>Delete</button></div>)}{!templates.length&&<div className="empty">No regular shifts saved yet.</div>}</div><button className="btn btnSecondary" onClick={addTemplate}><PlusIcon/>Add regular shift</button></div><div className="modalFoot"><span/><div className="row">{templates.length>0&&<button className="btn btnAccent" onClick={()=>{void fillMonthFromTemplates();setTemplateOpen(false)}}>Fill {monthLabel(month)}</button>}<button className="btn btnPrimary" onClick={()=>setTemplateOpen(false)}>Done</button></div></div></div></div>
  }

  function ShiftModal(){
    return <div className="modalBackdrop"><div className="modal"><div className="modalHead"><h2>{shiftModal?.id?(shiftModal.approval_status==="pending"?"Review extra shift":"Edit shift"):"Add extra shift"}</h2><button className="iconButton" onClick={()=>setShiftModal(null)}>×</button></div><div className="modalBody"><div className="field"><label>Date</label><input type="date" value={shiftModal!.shift_date} onChange={e=>setShiftModal({...shiftModal!,shift_date:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Start</label><input type="time" value={shiftModal!.start_time.slice(0,5)} onChange={e=>setShiftModal({...shiftModal!,start_time:e.target.value})}/></div><div className="field"><label>Finish</label><input type="time" value={shiftModal!.finish_time.slice(0,5)} onChange={e=>setShiftModal({...shiftModal!,finish_time:e.target.value})}/></div></div><div className="field"><label>Break (minutes)</label><input type="number" min={0} value={shiftModal!.break_minutes} onChange={e=>setShiftModal({...shiftModal!,break_minutes:Number(e.target.value)})}/></div><div className="field"><label>Venue</label><select value={shiftModal!.venue_id||""} onChange={e=>setShiftModal({...shiftModal!,venue_id:e.target.value||null})}><option value="">Select venue…</option>{(isAdmin?adminVenues():profileVenues(activeCoach.id)).map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></div><div className="field"><label>Session / group</label><input value={shiftModal!.session_location||""} onChange={e=>setShiftModal({...shiftModal!,session_location:e.target.value})} placeholder="e.g. competition, camp, meeting, cover"/></div><div className="field"><label>Notes</label><textarea value={shiftModal!.notes||""} onChange={e=>setShiftModal({...shiftModal!,notes:e.target.value})}/></div></div><div className="modalFoot"><div>{shiftModal?.id&&<button className="btn btnDanger" onClick={deleteShift}>Delete shift</button>}</div><div className="row">{isAdmin&&shiftModal?.id&&shiftModal.approval_status==="pending"&&<><button className="btn btnDanger" onClick={()=>rejectExtraShift(shiftModal)}>Reject</button><button className="btn btnAccent" onClick={()=>approveExtraShift(shiftModal)}>Approve</button></>}<button className="btn btnSecondary" onClick={()=>setShiftModal(null)}>Cancel</button>{(!isAdmin||shiftModal?.approval_status!=="pending")&&<button className="btn btnPrimary" onClick={saveShift}>{isAdmin?"Save shift":"Send for approval"}</button>}</div></div></div></div>
  }

  function InviteModal(){
    return <div className="modalBackdrop"><form className="modal" onSubmit={sendInvite}><div className="modalHead"><h2>Add staff member</h2><button type="button" className="iconButton" onClick={()=>setInviteOpen(false)}>×</button></div><div className="modalBody"><div className="field"><label>Full name</label><input value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})} required/></div><div className="field"><label>Email <span className="muted">(optional)</span></label><input type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})} placeholder="Leave blank to add them without portal access"/><div className="fieldHint">You can add their email and invite them later. They can still be scheduled and included in payroll now.</div></div><div className="field"><label>Account type</label><select value={inviteRole} onChange={e=>setInviteRole(e.target.value as any)} disabled={!isGlobalAdmin}><option value="coach">Coach</option>{isGlobalAdmin&&<option value="org_admin">Organisation admin</option>}</select></div><div className="field"><label>Hourly rate</label><input type="number" min={0} step="0.01" value={invite.rate} onChange={e=>setInvite({...invite,rate:e.target.value})} required/></div><div className="field"><label>Works at</label><div className="checkGrid">{adminVenues().map(v=><label className="checkCard" key={v.id}><input type="checkbox" checked={inviteVenueIds.includes(v.id)} onChange={e=>setInviteVenueIds(e.target.checked?[...inviteVenueIds,v.id]:inviteVenueIds.filter(x=>x!==v.id))}/><span><strong>{v.name}</strong></span></label>)}</div></div></div><div className="modalFoot"><span/><button className="btn btnPrimary" disabled={saving}>{saving?"Saving…":invite.email.trim()?"Add & send invitation":"Add staff without login"}</button></div></form></div>
  }

  function StaffModal(){
    const s=staffEdit!;
    const roleLabel=s.role==="admin"?"Super admin":s.role==="org_admin"?"Organisation admin":"Coach";
    const hasPortal=Boolean(s.email);
    return <div className="modalBackdrop"><div className="modal modalWide v32StaffModal v322StaffModalShell">
      <div className="v32StaffHero"><div className="v32StaffHeroIdentity"><div className="v32StaffHeroAvatar">{initials(s.full_name)}</div><div><span>{s.job_title||roleLabel}</span><h2>{s.full_name}</h2><p>{s.email||"No portal access yet"}</p></div></div><button className="iconButton" onClick={()=>setStaffEdit(null)}>×</button></div>
      <div className="v32ProfileTabs"><button className={staffPanel==="profile"?"active":""} onClick={()=>setStaffPanel("profile")}>Profile</button><button className={staffPanel==="employment"?"active":""} onClick={()=>setStaffPanel("employment")}>Employment</button><button className={staffPanel==="security"?"active":""} onClick={()=>setStaffPanel("security")}>Security</button><button className={staffPanel==="notes"?"active":""} onClick={()=>setStaffPanel("notes")}>Notes</button></div>
      <div className="modalBody v32StaffBody v322StaffModalBody">
        {staffPanel==="profile"&&<><div className="grid grid2"><div className="field"><label>Name</label><input value={s.full_name} onChange={e=>setStaffEdit({...s,full_name:e.target.value})}/></div><div className="field"><label>Phone</label><input value={s.phone||""} onChange={e=>setStaffEdit({...s,phone:e.target.value})}/></div></div><div className="field"><label>Address</label><textarea value={s.address||""} onChange={e=>setStaffEdit({...s,address:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Emergency contact</label><input value={s.emergency_contact_name||""} onChange={e=>setStaffEdit({...s,emergency_contact_name:e.target.value})}/></div><div className="field"><label>Emergency phone</label><input value={s.emergency_contact_phone||""} onChange={e=>setStaffEdit({...s,emergency_contact_phone:e.target.value})}/></div></div><div className="grid grid3"><div className="field"><label>DBS expiry</label><input type="date" value={s.dbs_expiry||""} onChange={e=>setStaffEdit({...s,dbs_expiry:e.target.value})}/></div><div className="field"><label>First Aid</label><input type="date" value={s.first_aid_expiry||""} onChange={e=>setStaffEdit({...s,first_aid_expiry:e.target.value})}/></div><div className="field"><label>Safeguarding</label><input type="date" value={s.safeguarding_expiry||""} onChange={e=>setStaffEdit({...s,safeguarding_expiry:e.target.value})}/></div></div></>}
        {staffPanel==="employment"&&<><div className="grid grid2"><div className="field"><label>Job title</label><input value={s.job_title||""} onChange={e=>setStaffEdit({...s,job_title:e.target.value})} placeholder="e.g. Head Coach"/></div><div className="field"><label>Employment status</label><select value={s.employment_status||"active"} onChange={e=>setStaffEdit({...s,employment_status:e.target.value})}><option value="active">Active</option><option value="casual">Casual</option><option value="contractor">Contractor</option><option value="leaver">Leaver</option></select></div></div><div className="grid grid2"><div className="field"><label>Start date</label><input type="date" value={s.start_date||""} onChange={e=>setStaffEdit({...s,start_date:e.target.value})}/></div><div className="field"><label>Payroll ID</label><input value={s.payroll_id||""} onChange={e=>setStaffEdit({...s,payroll_id:e.target.value})}/></div></div><div className="grid grid2"><div className="field"><label>Hourly rate</label><input type="number" step="0.01" value={s.hourly_rate} onChange={e=>setStaffEdit({...s,hourly_rate:Number(e.target.value)})}/></div>{isGlobalAdmin&&<div className="field"><label>Account type</label><select value={s.role} onChange={e=>setStaffEdit({...s,role:e.target.value as any})}><option value="coach">Coach</option><option value="org_admin">Organisation admin</option><option value="admin">Super admin</option></select></div>}</div><div className="field"><label>Works at</label><div className="checkGrid">{adminVenues().map(v=><label className="checkCard" key={v.id}><input type="checkbox" checked={staffEditVenueIds.includes(v.id)} onChange={e=>{const ids=e.target.checked?[...staffEditVenueIds,v.id]:staffEditVenueIds.filter(x=>x!==v.id);setStaffEditVenueIds(ids);if(!ids.includes(v.id))setStaffEditAdminVenueIds(staffEditAdminVenueIds.filter(x=>x!==v.id))}}/><span><strong>{v.name}</strong>{s.role==="org_admin"&&isGlobalAdmin&&<small><input type="checkbox" checked={staffEditAdminVenueIds.includes(v.id)} onChange={e=>setStaffEditAdminVenueIds(e.target.checked?[...new Set([...staffEditAdminVenueIds,v.id])]:staffEditAdminVenueIds.filter(x=>x!==v.id))}/> Admin for this organisation</small>}</span></label>)}</div></div><div className="grid grid2"><div className="field"><label>Account name</label><input value={s.account_name||""} onChange={e=>setStaffEdit({...s,account_name:e.target.value})}/></div><div className="field"><label>UTR</label><input value={s.utr||""} onChange={e=>setStaffEdit({...s,utr:e.target.value})}/></div></div></>}
        {staffPanel==="security"&&<><div className="v32SecurityOverview"><div><span>Portal access</span><strong>{hasPortal?"Enabled":"Not invited"}</strong></div><div><span>Account status</span><strong>{s.is_active?"Active":"Inactive"}</strong></div><div><span>Last sign in</span><strong>{s.last_login_at?new Date(s.last_login_at).toLocaleString("en-GB"):"Never"}</strong></div></div>
        {hasPortal?<><div className="v321Credentials"><div className="v321CredentialsHead"><div><span>Credentials</span><strong>Set a temporary password</strong><p>Useful when onboarding a coach in person. They can still change their password themselves at any time.</p></div><button className="btn btnSecondary" type="button" onClick={generateTemporaryPassword}>Generate</button></div><div className="grid grid2"><div className="field"><label>Temporary password</label><input type="text" autoComplete="off" value={temporaryPassword} onChange={e=>setTemporaryPassword(e.target.value)} placeholder="Minimum 8 characters"/></div><div className="field"><label>Confirm password</label><input type="text" autoComplete="off" value={temporaryPasswordConfirm} onChange={e=>setTemporaryPasswordConfirm(e.target.value)}/></div></div><label className="v321ForceCheck"><input type="checkbox" checked={forceTempPasswordChange} onChange={e=>setForceTempPasswordChange(e.target.checked)}/><span><strong>Require password change after login</strong><small>Recommended for temporary passwords.</small></span></label><div className="v321CredentialButtons"><button className="btn btnSecondary" type="button" disabled={!temporaryPassword} onClick={copyTemporaryPassword}>Copy password</button><button className="btn btnPrimary" type="button" disabled={temporaryPasswordBusy} onClick={()=>setStaffTemporaryPassword(s)}>{temporaryPasswordBusy?"Setting…":"Set password"}</button></div></div>
        <div className="v321SecurityDivider"><span>Other access options</span></div><div className="v32SecurityActions"><button className="btn btnSecondary" onClick={()=>sendPasswordResetEmail(s)}>Send password reset email</button><button className="btn btnSecondary" onClick={()=>createSetupLink(s)}>Copy secure reset link</button><button className="btn btnSecondary" onClick={()=>toggleForcePasswordReset(s)}>{s.force_password_reset?"Remove forced password change":"Require password change"}</button><button className={`btn ${s.is_active?"btnDanger":"btnAccent"}`} onClick={()=>setStaffEdit({...s,is_active:!s.is_active})}>{s.is_active?"Disable account":"Enable account"}</button></div></>:<div className="v321NoPortal"><strong>This staff member does not have portal access yet.</strong><span>Add their email and invite them when you're ready for them to log in.</span><button className="btn btnAccent" onClick={()=>inviteExistingStaff(s)}>Invite to portal</button></div>}
        <div className="v321PasswordMeta"><div><span>Password last changed</span><strong>{s.password_changed_at?new Date(s.password_changed_at).toLocaleString("en-GB"):"Not recorded"}</strong></div><div><span>Next login</span><strong>{s.force_password_reset?"Password change required":"Normal access"}</strong></div></div><div className="notice">Account status changes are applied when you press <strong>Save staff</strong>. Password and reset actions are applied immediately.</div></>}
        {staffPanel==="notes"&&<><div className="field"><label>Private admin notes</label><textarea className="v32Notes" value={s.admin_notes||""} onChange={e=>setStaffEdit({...s,admin_notes:e.target.value})} placeholder="Notes visible to administrators only."/></div><div className="notice">Documents and qualification uploads will build on this profile in v3.5.</div></>}
      </div>
      <div className="modalFoot staffModalFoot v322StaffModalFoot"><div className="row"><button className="btn btnDanger" onClick={()=>deleteStaffAccount(s)}>Delete account</button></div><div className="row"><button className="btn btnSecondary" onClick={()=>setStaffEdit(null)}>Cancel</button><button className="btn btnPrimary" onClick={saveStaff} disabled={saving}>{saving?"Saving…":"Save staff"}</button></div></div>
    </div></div>
  }
}
