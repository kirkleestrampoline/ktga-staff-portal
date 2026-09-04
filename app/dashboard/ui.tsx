"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Sidebar from "@/components/sidebar";
import MobileNav from "@/components/mobile-nav";
import StatCard from "@/components/stat-card";
import StatusPill from "@/components/status-pill";
import AvLogo from "@/components/av-logo";
import { CalendarIcon, ChartIcon, CheckIcon, ClockIcon, InvoiceIcon, MenuIcon, PlusIcon, PoundIcon, SearchIcon, UserIcon, UsersIcon } from "@/components/icons";
import { dashboardTabForRole, type DashboardTab as Tab } from "@/types/navigation";
import { qualificationSatisfies, rankCoachRecommendations, type RecommendationPriority } from "@/lib/staffing/recommendations";

type Profile={
  id:string;full_name:string;email:string|null;phone:string|null;address:string|null;role:"coach"|"org_admin"|"admin"|"club_owner";club_id?:string|null;
  hourly_rate:number;account_name:string|null;sort_code:string|null;account_number:string|null;utr:string|null;
  invoice_prefix:string|null;is_active:boolean;
  emergency_contact_name?:string|null;emergency_contact_phone?:string|null;
  dbs_expiry?:string|null;first_aid_expiry?:string|null;safeguarding_expiry?:string|null;qualifications?:string|null;
  job_title?:string|null;employment_status?:string|null;start_date?:string|null;payroll_id?:string|null;
  employment_type?:"hourly"|"salaried"|"volunteer";standard_rate?:number;enhanced_rate?:number;can_volunteer?:boolean;
  annual_salary?:number|null;contracted_weekly_hours?:number|null;working_weeks_per_year?:number|null;invoice_required?:boolean;
  last_login_at?:string|null;force_password_reset?:boolean|null;password_changed_at?:string|null;admin_notes?:string|null;username?:string|null;contact_email?:string|null;auth_email?:string|null;
  coaching_types?:string[];
};
type Venue={id:string;name:string;slug:string;active:boolean;brand_color:string|null;legal_name?:string|null;invoice_address?:string|null;invoice_prefix?:string|null;payment_note?:string|null};
type ShiftTemplate={id:string;profile_id:string;venue_id:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;session_location:string|null;notes:string|null;active:boolean};
type Shift={id?:string;coach_id:string;shift_date:string;start_time:string;finish_time:string;break_minutes:number;venue_id?:string|null;session_location:string|null;notes:string|null;source?:string|null;approval_status?:"pending"|"approved"|"rejected"|null;scheduled_shift_id?:string|null;payment_type?:"standard"|"enhanced"|"volunteer"};
type Timesheet={id:string;coach_id:string;month_start:string;status:"draft"|"submitted"|"paid";submitted_at:string|null;paid_at:string|null;submitted_by?:string|null};
type Invoice={id:string;coach_id:string;timesheet_id:string;venue_id?:string|null;invoice_number:string;invoice_date:string;hours:number;hourly_rate:number;total_amount:number;status:"awaiting_payment"|"paid"|"cancelled";created_at?:string};
type Business={id:number;business_name:string;business_address:string|null;payment_note:string|null;cutoff_day:number};
type Club={id:string;name:string;short_name:string|null;logo_url:string|null;primary_colour:string;secondary_colour:string;email:string|null;telephone:string|null;website:string|null;address:string|null;bank_details:string|null;payroll_month:number;timezone:string;currency:string;active:boolean};
type AdminRow={coach:Profile;hours:number;value:number;timesheet:Timesheet|null;invoice:Invoice|null};
type Audit={id:string;actor_id:string|null;subject_id:string|null;action:string;entity_type:string;entity_id:string|null;details:any;created_at:string};
type ClassTemplate={id:string;class_profile_id:string;venue_id:string;name:string;programme?:string|null;minimum_age?:number|null;maximum_age?:number|null;weekday:number;start_time:string;finish_time:string;break_minutes:number;coaches_required:number;active:boolean;notes:string|null;session_colour?:string;capacity?:number|null;warn_if_understaffed?:boolean;critical_if_no_lead?:boolean;allow_below_recommended_qualification?:boolean;lead_coaches_required?:number;assistant_coaches_required?:number;minimum_coaches?:number;maximum_coaches?:number;lead_recommended_qualification_id?:string|null;assistant_recommended_qualification_id?:string|null};
type ClassProfile=Omit<ClassTemplate,"id"|"class_profile_id"|"venue_id"|"weekday"|"start_time"|"finish_time"|"break_minutes"|"coaches_required"|"notes">&{id:string};
type ClassStaffingSlot={id:string;class_id:string;slot_number:number;default_profile_id:string|null};
type QualificationType={id:string;name:string;description:string|null;active:boolean;qualification_family:string|null;qualification_level:number|null};
type CoachQualification={id:string;coach_id:string;qualification_id:string;awarded_date:string|null;expiry_date:string|null;notes:string|null};
type EmploymentRecord={id:string;profile_id:string;organisation_id:string;employment_type:"hourly"|"salaried"|"volunteer";standard_rate:number;enhanced_rate:number;annual_salary:number|null;contracted_weekly_hours:number|null;working_weeks_per_year:number|null;calculated_internal_hourly_rate:number|null;can_volunteer:boolean;invoice_required:boolean;effective_from:string;effective_to:string|null;active:boolean;created_at:string;updated_at:string};
type EmploymentRecordDraft={id?:string;organisation_id:string;employment_type:EmploymentRecord["employment_type"];standard_rate:number;enhanced_rate:number;annual_salary:number|null;contracted_weekly_hours:number|null;working_weeks_per_year:number|null;can_volunteer:boolean;invoice_required:boolean;effective_from:string};
type ClassCoachingStatistic={class_id:string;coach_id:string|null;organisation_id:string;programme_key:string;class_name:string;sessions_coached:number;last_coached_date:string|null};
type StaffingRuleLevel="disabled"|"warning"|"critical";
type StaffingCriterionBehaviour="score"|"threshold"|"disabled";
type StaffingIntelligenceSettings={
  mandatory_rules:Record<string,StaffingRuleLevel>;
  criteria:Record<string,{weight:number;behaviour:StaffingCriterionBehaviour}>;
  priority_order:string[];
};
type ScheduledShift={id:string;class_id:string|null;staffing_slot_id:string|null;venue_id:string;profile_id:string|null;original_profile_id:string|null;shift_date:string;start_time:string;finish_time:string;break_minutes:number;class_name:string;status:"scheduled"|"confirmed"|"cancelled";actual_shift_id:string|null;notes:string|null;payment_type?:"standard"|"enhanced"|"volunteer";adjustment_status?:"none"|"pending"|null;requested_start_time?:string|null;requested_finish_time?:string|null;requested_break_minutes?:number|null;adjustment_reason?:string|null};
type StaffingQualificationContext={classId:string|null;staffingSlotId:string|null;role:"lead"|"assistant";recommendedQualificationId:string|null;recommendedQualification:QualificationType|null};
type RemovedOccurrence={class_id:string;shift_date:string;class_name:string;venue_id:string;start_time:string;finish_time:string;removed_slots:number};
type TimeAwayRequest={id:string;profile_id:string;request_type:"holiday"|"sickness"|"appointment"|"compassionate"|"unavailable"|"other";start_date:string;end_date:string;all_day:boolean;start_time:string|null;end_time:string|null;notes:string|null;status:"pending"|"approved"|"declined"|"cancelled";reviewed_by:string|null;reviewed_at:string|null;created_at:string};
type ClassOccurrenceDraft={key:string;id?:string;venue_id:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;coaches_required:number;coach_ids:string[];notes:string;lead_coaches_required:number;assistant_coaches_required:number;minimum_coaches:number;maximum_coaches:number;lead_recommended_qualification_id:string;assistant_recommended_qualification_id:string};
type ClassDraft={id?:string;class_profile_id?:string;original_ids?:string[];venue_id:string;name:string;programme:string;minimum_age:number|null;maximum_age:number|null;active:boolean;session_colour:string;capacity:number|null;warn_if_understaffed:boolean;critical_if_no_lead:boolean;allow_below_recommended_qualification:boolean;lead_coaches_required:number;assistant_coaches_required:number;minimum_coaches:number;maximum_coaches:number;lead_recommended_qualification_id:string;assistant_recommended_qualification_id:string;weekday:number;start_time:string;finish_time:string;break_minutes:number;coaches_required:number;notes:string;coach_ids:string[];occurrences?:ClassOccurrenceDraft[]};
type OneOffShiftDraft={id?:string;venue_id:string;shift_date:string;start_time:string;finish_time:string;class_name:string;notes:string;profile_id:string};

const STAFFING_RULES=[
  {key:"coach_available",label:"Coach available",description:"Warn when a coach is unavailable for the class period."},
  {key:"recommended_qualification",label:"Meets recommended qualification",description:"Check the class recommendation, including qualification hierarchy."},
  {key:"coaching_capability",label:"Coaching capability",description:"Compare the coach’s capability tags with the class requirements."},
  {key:"weekly_hours_limit",label:"Weekly hours limit",description:"Warn when the configured weekly workload limit is reached."}
] as const;
const STAFFING_CRITERIA=[
  {key:"availability",label:"Availability"},
  {key:"previous_coach",label:"Previous Coach For This Class"},
  {key:"lower_staffing_cost",label:"Staffing Cost"},
  {key:"recommended_qualification",label:"Qualification Recommendation"}
] as const;
const DEFAULT_STAFFING_INTELLIGENCE:StaffingIntelligenceSettings={
  mandatory_rules:{coach_available:"critical",recommended_qualification:"warning",coaching_capability:"warning",weekly_hours_limit:"warning"},
  criteria:{availability:{weight:35,behaviour:"score"},previous_coach:{weight:20,behaviour:"score"},lower_staffing_cost:{weight:10,behaviour:"score"},recommended_qualification:{weight:0,behaviour:"threshold"}},
  priority_order:STAFFING_CRITERIA.map(item=>item.key)
};

const supabase=createClient();
const money=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(n||0));
const monthKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const localDateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const monthLabel=(k:string)=>new Date(`${k}-01T12:00:00`).toLocaleDateString("en-GB",{month:"long",year:"numeric"});
const initials=(n:string)=>n.split(" ").filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"AV";
const monthRange=(month:string)=>{const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate();return{from:`${month}-01`,to:`${month}-${String(last).padStart(2,"0")}`}};
const shiftHours=(s:Shift)=>{const[sh,sm]=s.start_time.slice(0,5).split(":").map(Number),[fh,fm]=s.finish_time.slice(0,5).split(":").map(Number);let mins=(fh*60+fm)-(sh*60+sm)-Number(s.break_minutes||0);if(mins<0)mins+=1440;return Math.max(0,mins/60)};
const dateText=(s:string|null|undefined)=>s?new Date(`${s.slice(0,10)}T12:00:00`).toLocaleDateString("en-GB"):"—";
const cutoffDate=(month:string,day=1)=>{const[y,m]=month.split("-").map(Number);return new Date(y,m,day,23,59,59)};
const fmtStamp=(s:string)=>new Date(s).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"});

export default function Dashboard({initialProfile,initialTab,initialMonth}:{initialProfile:Profile;initialTab:Tab;initialMonth:string}){
  const isGlobalAdmin=initialProfile.role==="admin"||initialProfile.role==="club_owner";
  const isAdmin=isGlobalAdmin||initialProfile.role==="org_admin";
  const [tab,setTabState]=useState<Tab>(initialTab);
  const [month,setMonthState]=useState(initialMonth);
  const [ownProfile,setOwnProfile]=useState<Profile>(initialProfile);
  const [activeCoach,setActiveCoach]=useState<Profile>(initialProfile);
  const [shifts,setShifts]=useState<Shift[]>([]);
  const [timesheet,setTimesheet]=useState<Timesheet|null>(null);
  const [invoice,setInvoice]=useState<Invoice|null>(null);
  const [allInvoices,setAllInvoices]=useState<any[]>([]);
  const [unpaidInvoiceTotal,setUnpaidInvoiceTotal]=useState(0);
  const [staff,setStaff]=useState<Profile[]>([]);
  const [adminRows,setAdminRows]=useState<AdminRow[]>([]);
  const [business,setBusiness]=useState<Business>({id:1,business_name:"Kirklees Trampoline Gymnastics Academy Ltd",business_address:"",payment_note:"Payment by bank transfer",cutoff_day:1});
  const [currentClub,setCurrentClub]=useState<Club|null>(null);
  const [clubArchitectureAvailable,setClubArchitectureAvailable]=useState(false);
  const [audits,setAudits]=useState<Audit[]>([]);
  const [search,setSearch]=useState("");
  const [venueFilter,setVenueFilter]=useState("");
  const [workforceVenue,setWorkforceVenue]=useState("");
  const [workforceSearch,setWorkforceSearch]=useState("");
  const [message,setMessage]=useState("");
  const [shiftModal,setShiftModal]=useState<Shift|null>(null);
  const [inviteOpen,setInviteOpen]=useState(false);
  const [staffEdit,setStaffEdit]=useState<Profile|null>(null);
  const [invite,setInvite]=useState({name:"",username:"",password:"",email:"",rate:"",portalAccess:true});
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
  const [archivedClasses,setArchivedClasses]=useState<ClassTemplate[]>([]);
  const [showArchivedClasses,setShowArchivedClasses]=useState(false);
  const [includeArchivedClassCopies,setIncludeArchivedClassCopies]=useState(false);
  const [classActionsOpen,setClassActionsOpen]=useState<string|null>(null);
  const [classSlots,setClassSlots]=useState<ClassStaffingSlot[]>([]);
  const [qualificationTypes,setQualificationTypes]=useState<QualificationType[]>([]);
  const [coachQualifications,setCoachQualifications]=useState<CoachQualification[]>([]);
  const [classCoachingStatistics,setClassCoachingStatistics]=useState<ClassCoachingStatistic[]>([]);
  const [staffEditQualificationIds,setStaffEditQualificationIds]=useState<string[]>([]);
  const [staffEditQualificationDetails,setStaffEditQualificationDetails]=useState<Record<string,{awarded_date:string;expiry_date:string;notes:string}>>({});
  const [qualificationDraft,setQualificationDraft]=useState<{id?:string;name:string;description:string;qualification_family:string;qualification_level:string}>({name:"",description:"",qualification_family:"",qualification_level:""});
  const [staffingIntelligence,setStaffingIntelligence]=useState<StaffingIntelligenceSettings>(DEFAULT_STAFFING_INTELLIGENCE);
  const [staffingIntelligenceAvailable,setStaffingIntelligenceAvailable]=useState(true);
  const [staffProfileFoundationAvailable,setStaffProfileFoundationAvailable]=useState(false);
  const [employmentFoundationAvailable,setEmploymentFoundationAvailable]=useState(false);
  const [employmentRecordsAvailable,setEmploymentRecordsAvailable]=useState(false);
  const [employmentRecords,setEmploymentRecords]=useState<EmploymentRecord[]>([]);
  const [allEmploymentRecords,setAllEmploymentRecords]=useState<EmploymentRecord[]>([]);
  const [employmentRecordDraft,setEmploymentRecordDraft]=useState<EmploymentRecordDraft|null>(null);
  const [classStaffingFoundationAvailable,setClassStaffingFoundationAvailable]=useState(false);
  const [scheduledShifts,setScheduledShifts]=useState<ScheduledShift[]>([]);
  const [futureScheduledShifts,setFutureScheduledShifts]=useState<ScheduledShift[]>([]);
  const [classModal,setClassModal]=useState<ClassDraft|null>(null);
  const [classWizardStep,setClassWizardStep]=useState(0);
  const [classCopySearch,setClassCopySearch]=useState("");
  const [oneOffShiftModal,setOneOffShiftModal]=useState<OneOffShiftDraft|null>(null);
  const [scheduleFilter,setScheduleFilter]=useState("");
  const [resetConfirm,setResetConfirm]=useState("");
  const [resetRemoveStaff,setResetRemoveStaff]=useState(false);
  const [resetBusy,setResetBusy]=useState(false);
  const [scheduleView,setScheduleView]=useState<"calendar"|"agenda">("calendar");
  const [adminScheduleRange,setAdminScheduleRange]=useState<"day"|"week"|"month">("day");
  const [adminScheduleDate,setAdminScheduleDate]=useState(localDateKey());
  const [dragShiftId,setDragShiftId]=useState<string|null>(null);
  const [rotaView,setRotaView]=useState<"month"|"week"|"day">("day");
  const [rotaDate,setRotaDate]=useState(new Date().toISOString().slice(0,10));
  const [adjustShift,setAdjustShift]=useState<ScheduledShift|null>(null);
  const [confirmShift,setConfirmShift]=useState<ScheduledShift|null>(null);
  const [dailyConfirmation,setDailyConfirmation]=useState<{profileId:string|null;date:string;selectedIds:string[]}|null>(null);
  const [adjustStart,setAdjustStart]=useState("");
  const [adjustFinish,setAdjustFinish]=useState("");
  const [adjustBreak,setAdjustBreak]=useState(0);
  const [adjustReason,setAdjustReason]=useState("");
  const [adminPersonalRota,setAdminPersonalRota]=useState(false);
  const [adminScheduleShift,setAdminScheduleShift]=useState<ScheduledShift|null>(null);
  const [staffingRecommendationShift,setStaffingRecommendationShift]=useState<ScheduledShift|null>(null);
  const [staffingQualificationContext,setStaffingQualificationContext]=useState<StaffingQualificationContext|null>(null);
  const [highlightedScheduleShiftId,setHighlightedScheduleShiftId]=useState<string|null>(null);
  const [expandedSchedulingSections,setExpandedSchedulingSections]=useState<Record<"critical"|"warning"|"reminder",boolean>>({critical:false,warning:false,reminder:false});
  const [pendingExtraShifts,setPendingExtraShifts]=useState<Shift[]>([]);
  const [monthActionsOpen,setMonthActionsOpen]=useState(false);
  const [removedOccurrences,setRemovedOccurrences]=useState<RemovedOccurrence[]>([]);
  const [staffPanel,setStaffPanel]=useState<"profile"|"coaching"|"employment"|"availability"|"payroll"|"security"|"notes">("profile");
  const [newPassword,setNewPassword]=useState("");
  const [confirmNewPassword,setConfirmNewPassword]=useState("");
  const [passwordBusy,setPasswordBusy]=useState(false);
  const [temporaryPassword,setTemporaryPassword]=useState("");
  const [temporaryPasswordConfirm,setTemporaryPasswordConfirm]=useState("");
  const [forceTempPasswordChange,setForceTempPasswordChange]=useState(true);
  const [temporaryPasswordBusy,setTemporaryPasswordBusy]=useState(false);
  const [timeAwayRequests,setTimeAwayRequests]=useState<TimeAwayRequest[]>([]);
  const [timeAwayModal,setTimeAwayModal]=useState<TimeAwayRequest|null|undefined>(undefined);
  const [timeAwayDraft,setTimeAwayDraft]=useState({request_type:"holiday" as TimeAwayRequest["request_type"],start_date:"",end_date:"",all_day:true,start_time:"",end_time:"",notes:""});
  const [leaveSaving,setLeaveSaving]=useState(false);
  const [adminTimeAwayProfileId,setAdminTimeAwayProfileId]=useState("");
  const [adminTimeAwayStatus,setAdminTimeAwayStatus]=useState<"pending"|"approved">("approved");
  const [coachAssignmentSearch,setCoachAssignmentSearch]=useState("");
  const [availabilityPeriod,setAvailabilityPeriod]=useState<"today"|"tomorrow"|"week">("today");
  const [availabilitySearch,setAvailabilitySearch]=useState("");
  const [availabilityVenue,setAvailabilityVenue]=useState("");
  const [availabilityExpanded,setAvailabilityExpanded]=useState<Record<"available"|"coaching"|"pending"|"unavailable",boolean>>({available:false,coaching:false,pending:false,unavailable:false});
  const [masterTimetableOpen,setMasterTimetableOpen]=useState(false);
  const [masterDaysExpanded,setMasterDaysExpanded]=useState<Record<number,boolean>>({});
  const [masterTimetableDay,setMasterTimetableDay]=useState<number|null>(null);
  const masterTimetableTouchY=useRef<number|null>(null);
  const [loadingTab,setLoadingTab]=useState<Tab|null>(null);
  const [tabLoadError,setTabLoadError]=useState<{tab:Tab;message:string}|null>(null);
  const initialLoadedTabs=useRef<Set<Tab>>(new Set(isAdmin?["dashboard"]:[]));
  const [loadedTabs,setLoadedTabs]=useState<Set<Tab>>(()=>new Set(initialLoadedTabs.current));
  const loadedTabsRef=useRef<Set<Tab>>(initialLoadedTabs.current);
  const tabLoadsInFlight=useRef<Set<Tab>>(new Set());
  const sharedDataLoads=useRef<Record<string,Promise<void>>>({});
  const scheduleRequestSequence=useRef(0);
  const latestScheduleRequest=useRef(0);
  const currentMonthRef=useRef(initialMonth);
  const deletedShiftIds=useRef<Set<string>>(new Set());
  const rotaDatePickerRef=useRef<HTMLInputElement|null>(null);

  const totalHours=useMemo(()=>shifts.filter(s=>!s.approval_status||s.approval_status==="approved").reduce((a,s)=>a+shiftHours(s),0),[shifts]);
  const totalValue=totalHours*Number(activeCoach.hourly_rate||0);
  function setMonth(next:string){
    if(next===currentMonthRef.current)return;
    currentMonthRef.current=next;
    const url=new URL(window.location.href);
    url.searchParams.set("month",next);
    window.history.pushState({},"",`${url.pathname}${url.search}${url.hash}`);
    setMonthState(next);
  }
  const changeMonth=(delta:number)=>{
    const [y,m]=month.split("-").map(Number);
    const d=new Date(y,m-1+delta,1);
    setMonth(monthKey(d));
    if(tab==="schedule"&&isAdmin&&!adminPersonalRota)setAdminScheduleDate(localDateKey(d));
  };
  const locked=timesheet?.status==="submitted"||timesheet?.status==="paid";
  const overdue=new Date()>cutoffDate(month,business.cutoff_day||1)&&!timesheet?.submitted_at;
  const viewingOther=isAdmin&&activeCoach.id!==initialProfile.id;

  function setTab(next:Tab){
    const allowed=dashboardTabForRole(next,initialProfile.role);
    const url=new URL(window.location.href);
    if(url.searchParams.get("tab")!==allowed){
      url.searchParams.set("tab",allowed);
      window.history.pushState({},"",`${url.pathname}${url.search}${url.hash}`);
    }
    setTabState(allowed);
  }

  useEffect(()=>{
    void runSharedDataLoad("venues",loadVenues).catch(reportStartupLoadFailure);
    void runSharedDataLoad("staff",loadStaff).catch(reportStartupLoadFailure);
    void loadCurrentClub();
    if(isAdmin){
      void runSharedDataLoad("leave",loadLeaveData).then(()=>markTabLoaded("leave")).catch(reportStartupLoadFailure);
      void runSharedDataLoad("future-schedule",loadFutureUnstaffedShifts).catch(reportStartupLoadFailure);
      void loadInvoiceSummary();
    }
  },[]);
  useEffect(()=>{
    const canonical=dashboardTabForRole(new URL(window.location.href).searchParams.get("tab"),initialProfile.role);
    const initialUrl=new URL(window.location.href);
    if(initialUrl.searchParams.get("tab")!==canonical){
      initialUrl.searchParams.set("tab",canonical);
      window.history.replaceState({},"",`${initialUrl.pathname}${initialUrl.search}${initialUrl.hash}`);
    }
    const urlMonth=initialUrl.searchParams.get("month");
    if(urlMonth&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(urlMonth)){
      initialUrl.searchParams.set("month",initialMonth);
      window.history.replaceState({},"",`${initialUrl.pathname}${initialUrl.search}${initialUrl.hash}`);
    }
    if(tab!==canonical)setTabState(canonical);
    const handleHistoryNavigation=()=>{
      const next=dashboardTabForRole(new URL(window.location.href).searchParams.get("tab"),initialProfile.role);
      const currentUrl=new URL(window.location.href);
      const historyMonth=currentUrl.searchParams.get("month");
      const nextMonth=historyMonth&&/^\d{4}-(0[1-9]|1[0-2])$/.test(historyMonth)?historyMonth:initialMonth;
      if(currentUrl.searchParams.get("tab")!==next){
        currentUrl.searchParams.set("tab",next);
        window.history.replaceState({},"",`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
      }
      setAdminPersonalRota(false);
      setMobileOpen(false);
      setMobileMoreOpen(false);
      if(next!=="timesheets")setActiveCoach(initialProfile);
      currentMonthRef.current=nextMonth;
      setMonthState(nextMonth);
      setTabState(next);
    };
    window.addEventListener("popstate",handleHistoryNavigation);
    return()=>window.removeEventListener("popstate",handleHistoryNavigation);
  },[initialProfile,initialMonth,tab]);
  useEffect(()=>{if(isAdmin&&tab==="dashboard"){void runSharedDataLoad(`overview-schedule:${month}`,loadOverviewSchedule).catch(reportStartupLoadFailure);void runSharedDataLoad(`extra-shifts:${month}`,loadPendingExtraShifts).catch(reportStartupLoadFailure);void loadAdmin(false)}else if(loadedTabsRef.current.has(tab))void reloadLoadedTab(tab)},[month,activeCoach.id]);
  useEffect(()=>{void loadTabOnce(tab)},[tab]);
  useEffect(()=>{
    if(!masterTimetableOpen)return;
    const bodyOverflow=document.body.style.overflow;
    const rootOverflow=document.documentElement.style.overflow;
    document.body.style.overflow="hidden";
    document.documentElement.style.overflow="hidden";
    return()=>{
      document.body.style.overflow=bodyOverflow;
      document.documentElement.style.overflow=rootOverflow;
    };
  },[masterTimetableOpen]);
  useEffect(()=>{
    if(!adminScheduleShift&&!staffingRecommendationShift)return;
    const bodyOverflow=document.body.style.overflow;
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape"){setAdminScheduleShift(null);setStaffingRecommendationShift(null);setStaffingQualificationContext(null)}};
    document.body.style.overflow="hidden";
    window.addEventListener("keydown",close);
    return()=>{document.body.style.overflow=bodyOverflow;window.removeEventListener("keydown",close)};
  },[adminScheduleShift,staffingRecommendationShift]);

  function reportStartupLoadFailure(error:unknown){if(process.env.NODE_ENV!=="production")console.error("[startup-data] load failed",error)}
  function runSharedDataLoad(key:string,loader:()=>Promise<void>){
    const existing=sharedDataLoads.current[key];
    if(existing)return existing;
    const request=loader().catch(error=>{delete sharedDataLoads.current[key];throw error});
    sharedDataLoads.current[key]=request;
    return request;
  }
  function markTabLoaded(next:Tab){
    loadedTabsRef.current.add(next);
    setLoadedTabs(current=>current.has(next)?current:new Set([...current,next]));
  }
  function clearTabLoaded(next:Tab){
    loadedTabsRef.current.delete(next);
    setLoadedTabs(current=>{if(!current.has(next))return current;const updated=new Set(current);updated.delete(next);return updated});
  }
  function logTabLoad(next:Tab,event:"load started"|"load completed"|"load failed"|"cache hit",error?:unknown){
    if(process.env.NODE_ENV!=="production"&&(next==="availability"||next==="staff"||next==="profile"||next==="schedule"))console.debug(`[tab-load:${next}] ${event}`,next==="schedule"?{month,...(error?{error}:{} )}:error||"");
  }

  async function loadTabOnce(next:Tab){
    if(next==="dashboard")return;
    if(loadedTabsRef.current.has(next)){logTabLoad(next,"cache hit");return}
    if(tabLoadsInFlight.current.has(next))return;
    tabLoadsInFlight.current.add(next);
    logTabLoad(next,"load started");
    setLoadingTab(next);
    setTabLoadError(current=>current?.tab===next?null:current);
    try{
      let lastError:unknown=null;
      for(let attempt=0;attempt<2;attempt++){
        try{
          await Promise.race([loadTabData(next),new Promise((_,reject)=>window.setTimeout(()=>reject(new Error("This page took too long to load.")),15000))]);
          markTabLoaded(next);logTabLoad(next,"load completed");lastError=null;break;
        }catch(error){lastError=error;if(attempt===0)await new Promise(resolve=>window.setTimeout(resolve,500))}
      }
      if(lastError)throw lastError;
    }catch(error:any){logTabLoad(next,"load failed",error);setTabLoadError({tab:next,message:error?.message||"Page data could not be loaded."})}
    finally{tabLoadsInFlight.current.delete(next);setLoadingTab(current=>current===next?null:current)}
  }

  async function loadTabData(next:Tab){
    if(next==="availability"&&isAdmin)await Promise.all([runSharedDataLoad("venues",loadVenues),runSharedDataLoad("staff",loadStaff),runSharedDataLoad("leave",loadLeaveData),runSharedDataLoad("future-schedule",loadFutureUnstaffedShifts),runSharedDataLoad(`overview-schedule:${month}`,loadOverviewSchedule)]);
    else if(next==="staff"&&isAdmin)await Promise.all([runSharedDataLoad("venues",loadVenues),runSharedDataLoad("staff",loadStaff)]);
    else if(next==="schedule"){
      if(isAdmin)await Promise.all([loadSchedule(),runSharedDataLoad(`extra-shifts:${month}`,loadPendingExtraShifts)]);
      else await Promise.all([loadSchedule(),loadLeaveData()]);
    }else if(next==="leave")await loadLeaveData();
    else if(next==="timesheets")await Promise.all([loadBusiness(),loadCoachMonth(activeCoach.id),loadTemplates(activeCoach.id),isAdmin?loadAdmin(true):Promise.resolve()]);
    else if(next==="invoices")await Promise.all([loadBusiness(),loadInvoices()]);
    else if(next==="workforce"&&isAdmin)await Promise.all([runSharedDataLoad("venues",loadVenues),runSharedDataLoad("staff",loadStaff),loadAdmin(false)]);
    else if(next==="reports"&&isAdmin)await loadAudits();
    else if(next==="settings"&&isAdmin)await Promise.all([loadBusiness(),loadCurrentClub(),loadQualificationLibrary(),loadStaffingIntelligenceSettings()]);
  }

  async function reloadLoadedTab(current:Tab){
    if(current==="schedule")await Promise.all([loadSchedule(),isAdmin?loadPendingExtraShifts():Promise.resolve()]);
    else if(current==="timesheets")await Promise.all([loadCoachMonth(activeCoach.id),loadTemplates(activeCoach.id),isAdmin?loadAdmin(true):Promise.resolve()]);
    else if((current==="reports"||current==="workforce")&&isAdmin)await loadAdmin(false);
  }

  async function loadLeaveData(){
    const q=supabase.from("time_away_requests").select("*").order("start_date",{ascending:true}).order("created_at",{ascending:false});
    const{data,error}=isAdmin?await q:await q.eq("profile_id",initialProfile.id);
    if(error)throw error;
    setTimeAwayRequests((data||[]) as TimeAwayRequest[]);
  }

  function openNewTimeAway(type:TimeAwayRequest["request_type"]="holiday",profileId?:string){
    setTimeAwayDraft({request_type:type,start_date:"",end_date:"",all_day:true,start_time:"",end_time:"",notes:""});
    setAdminTimeAwayProfileId(profileId||"");
    setAdminTimeAwayStatus("approved");
    setTimeAwayModal(null);
  }

  function openEditTimeAway(r:TimeAwayRequest){
    setTimeAwayDraft({
      request_type:r.request_type,
      start_date:r.start_date,
      end_date:r.end_date,
      all_day:r.all_day,
      start_time:r.start_time?.slice(0,5)||"",
      end_time:r.end_time?.slice(0,5)||"",
      notes:r.notes||""
    });
    setAdminTimeAwayProfileId(r.profile_id);
    setAdminTimeAwayStatus(r.status==="approved"?"approved":"pending");
    setTimeAwayModal(r);
  }

  async function saveTimeAway(){
    if(!timeAwayDraft.start_date){flash("Choose a date.");return}
    const end=timeAwayDraft.all_day?(timeAwayDraft.end_date||timeAwayDraft.start_date):timeAwayDraft.start_date;
    if(end<timeAwayDraft.start_date){flash("End date cannot be before the start date.");return}
    if(!timeAwayDraft.all_day&&(!timeAwayDraft.start_time||!timeAwayDraft.end_time)){flash("Choose the start and finish time.");return}
    if(!timeAwayDraft.all_day&&timeAwayDraft.end_time<=timeAwayDraft.start_time){flash("Finish time must be after start time.");return}

    setLeaveSaving(true);
    const targetProfileId=isAdmin?(adminTimeAwayProfileId||timeAwayModal?.profile_id||""):initialProfile.id;
    if(isAdmin&&!targetProfileId){flash("Choose a staff member.");setLeaveSaving(false);return}
    const payload={
      profile_id:targetProfileId,
      request_type:timeAwayDraft.request_type,
      start_date:timeAwayDraft.start_date,
      end_date:end,
      all_day:timeAwayDraft.all_day,
      start_time:timeAwayDraft.all_day?null:timeAwayDraft.start_time,
      end_time:timeAwayDraft.all_day?null:timeAwayDraft.end_time,
      notes:timeAwayDraft.notes.trim()||null
    };

    let error:any=null;
    if(timeAwayModal?.id){
      ({error}=await supabase.from("time_away_requests").update({...payload,...(isAdmin?{status:adminTimeAwayStatus,reviewed_by:adminTimeAwayStatus==="approved"?initialProfile.id:null,reviewed_at:adminTimeAwayStatus==="approved"?new Date().toISOString():null}:{})}).eq("id",timeAwayModal.id));
    }else{
      const status=isAdmin?adminTimeAwayStatus:"pending";
      ({error}=await supabase.from("time_away_requests").insert({...payload,status,reviewed_by:isAdmin&&status==="approved"?initialProfile.id:null,reviewed_at:isAdmin&&status==="approved"?new Date().toISOString():null}));
    }
    setLeaveSaving(false);
    if(error){flash(error.message);return}

    setTimeAwayModal(undefined);
    setTimeAwayDraft({request_type:"holiday",start_date:"",end_date:"",all_day:true,start_time:"",end_time:"",notes:""});
    flash(timeAwayModal?.id?"Time-away request updated.":"Request sent for approval.");
    await loadLeaveData();
  }

  async function reviewLeave(id:string,status:"approved"|"declined"){
    const{error}=await supabase.from("time_away_requests").update({status,reviewed_by:initialProfile.id,reviewed_at:new Date().toISOString()}).eq("id",id);
    if(error){flash(error.message);return}
    flash(status==="approved"?"Request approved.":"Request declined.");
    await loadLeaveData();
  }

  async function cancelOwnLeave(id:string){
    const{error}=await supabase.from("time_away_requests").update({status:"cancelled"}).eq("id",id).eq("profile_id",initialProfile.id).eq("status","pending");
    if(error){flash(error.message);return}
    flash("Request cancelled.");
    await loadLeaveData();
  }

  async function deleteTimeAway(r:TimeAwayRequest){
    if(!confirm(`Delete ${r.request_type==="unavailable"?"this unavailable period":"this leave request"}?\n\nThis removes it completely.`))return;
    const{error}=await supabase.from("time_away_requests").delete().eq("id",r.id);
    if(error){flash(error.message);return}
    flash("Request deleted.");
    await loadLeaveData();
  }


  function approvedConflictsForCoach(profileId:string,date:string,start:string,finish:string){
    return timeAwayRequests.filter(r=>{
      if(r.profile_id!==profileId||r.status!=="approved")return false;
      if(date<r.start_date||date>r.end_date)return false;
      if(r.all_day)return true;
      const s=start.slice(0,5),f=finish.slice(0,5);
      const rs=(r.start_time||"00:00").slice(0,5),rf=(r.end_time||"23:59").slice(0,5);
      return s<rf&&f>rs;
    });
  }

  function coachAvailabilityLabel(profileId:string,date:string,start:string,finish:string){
    const conflicts=approvedConflictsForCoach(profileId,date,start,finish);
    if(!conflicts.length)return null;
    const r=conflicts[0];
    const label=r.request_type==="unavailable"?"Unavailable":"Leave";
    return r.all_day?`${label} · full day`:`${label} · ${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)}`;
  }

  function pendingConflictsForCoach(profileId:string,date:string,start:string,finish:string){
    return timeAwayRequests.filter(r=>{
      if(r.profile_id!==profileId||r.status!=="pending")return false;
      if(date<r.start_date||date>r.end_date)return false;
      if(r.all_day)return true;
      const s=start.slice(0,5),f=finish.slice(0,5);
      const rs=(r.start_time||"00:00").slice(0,5),rf=(r.end_time||"23:59").slice(0,5);
      return s<rf&&f>rs;
    });
  }

  function coachAvailabilityState(profileId:string,date:string,start:string,finish:string){
    const approved=approvedConflictsForCoach(profileId,date,start,finish);
    if(approved.length){
      const r=approved[0];
      const label=r.request_type==="unavailable"?"Unavailable":"Leave";
      return {state:"away" as const,label:r.all_day?`${label} · full day`:`${label} · ${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)}`};
    }
    const pending=pendingConflictsForCoach(profileId,date,start,finish);
    if(pending.length){
      const r=pending[0];
      const label=r.request_type==="unavailable"?"Unavailable request":"Leave request";
      return {state:"pending" as const,label:r.all_day?`${label} · pending`:`${label} · ${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)} · pending`};
    }
    return {state:"available" as const,label:"Available"};
  }

  function scheduledOverlapsForCoach(profileId:string,shift:ScheduledShift){
    const start=shift.start_time.slice(0,5),finish=shift.finish_time.slice(0,5);
    return scheduledShifts.filter(x=>x.id!==shift.id&&x.profile_id===profileId&&x.shift_date===shift.shift_date&&x.status!=="cancelled"&&start<x.finish_time.slice(0,5)&&finish>x.start_time.slice(0,5));
  }

  function coachAssignmentState(profileId:string,shift:ScheduledShift){
    const away=approvedConflictsForCoach(profileId,shift.shift_date,shift.start_time,shift.finish_time);
    if(away.length){const r=away[0];return{state:"away" as const,label:r.all_day?(r.request_type==="unavailable"?"Unavailable · full day":"Leave · full day"):`${r.request_type==="unavailable"?"Unavailable":"Leave"} · ${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)}`}}
    const working=scheduledOverlapsForCoach(profileId,shift);
    if(working.length)return{state:"working" as const,label:`Already coaching · ${working[0].start_time.slice(0,5)}–${working[0].finish_time.slice(0,5)} ${working[0].class_name}`};
    const pending=pendingConflictsForCoach(profileId,shift.shift_date,shift.start_time,shift.finish_time);
    if(pending.length){const r=pending[0];return{state:"pending" as const,label:r.all_day?"Pending time-away request":`Pending request · ${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)}`}}
    return{state:"available" as const,label:"Available"};
  }

  async function reassignScheduledWithAvailability(s:ScheduledShift,profileId:string){
    if(!profileId){await reassignScheduled(s,profileId);return true}
    const state=coachAssignmentState(profileId,s);
    if(state.state!=="available"){
      const name=profileById(profileId)?.full_name||"This coach";
      const title=state.state==="away"?"has approved time away":state.state==="working"?"is already coaching another overlapping session":"has a pending time-away request";
      const ok=confirm(`${name} ${title}.\n\n${state.label}\n\nAssign anyway?`);
      if(!ok)return false;
    }
    await reassignScheduled(s,profileId);return true;
  }


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
    const{data,error}=await supabase.from("venues").select("*").eq("active",true).order("name");
    if(error)throw error;
    setVenues((data||[]) as Venue[]);
    setVenueDrafts(Object.fromEntries(((data||[]) as Venue[]).map(v=>[v.id,{...v}])));
    const{data:links,error:linksError}=await supabase.from("staff_venues").select("profile_id,venue_id,is_admin");
    if(linksError)throw linksError;
    const map:Record<string,string[]>={};
    for(const l of links||[]){if(!map[l.profile_id])map[l.profile_id]=[];map[l.profile_id].push(l.venue_id)}
    setStaffVenueMap(map);
    setOwnVenueIds(map[initialProfile.id]||[]);
    setManagedVenueIds(isGlobalAdmin?((data||[]) as Venue[]).map(v=>v.id):(links||[]).filter((x:any)=>x.profile_id===initialProfile.id&&x.is_admin).map((x:any)=>x.venue_id));
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
    return "orgKirklees";
  }
  function profileVenues(id:string){return (staffVenueMap[id]||[]).map(v=>venues.find(x=>x.id===v)).filter(Boolean) as Venue[]}
  function clubVenue(){return venues.find(v=>v.id===initialProfile.club_id)||venues.find(v=>v.slug.toLowerCase()==="kirklees")||venues[0]}
  function adminVenues(){const club=clubVenue();return club?[club]:[]}
  function sortedQualifications(items:QualificationType[]){
    return [...items].sort((a,b)=>Number(b.active)-Number(a.active)||(a.qualification_family||"Other").localeCompare(b.qualification_family||"Other")||(b.qualification_level??-1)-(a.qualification_level??-1)||a.name.localeCompare(b.name));
  }
  function hydrateClassSessions(rows:any[],profiles:ClassProfile[]):ClassTemplate[]{
    return rows.map(row=>{
      const profile=profiles.find(item=>item.id===row.class_profile_id);
      if(!profile)return row as ClassTemplate;
      return{...row,...profile,id:row.id,class_profile_id:row.class_profile_id,venue_id:row.venue_id,weekday:row.weekday,start_time:row.start_time,finish_time:row.finish_time,break_minutes:row.break_minutes,notes:row.notes,active:Boolean(row.active&&profile.active)} as ClassTemplate;
    });
  }
  function selectableQualifications(selectedId?:string){return sortedQualifications(qualificationTypes.filter(q=>q.active||q.id===selectedId))}

  async function loadTemplates(profileId:string){
    const{data}=await supabase.from("shift_templates").select("*").eq("profile_id",profileId).eq("active",true).order("weekday").order("start_time");
    setTemplates((data||[]) as ShiftTemplate[]);
  }

  async function loadStaff(){
    const[{data,error},{data:qualificationData,error:qualificationError},{data:heldData,error:heldError},{data:employmentData,error:employmentError}]=await Promise.all([
      supabase.from("profiles").select("*").neq("role","admin").order("full_name"),
      supabase.from("qualification_types").select("*").order("active",{ascending:false}).order("qualification_family").order("qualification_level",{ascending:false,nullsFirst:false}).order("name"),
      supabase.from("coach_qualifications").select("*"),
      supabase.from("employment_records").select("*")
    ]);
    if(error)throw error;
    setStaff((data||[]) as Profile[]);
    const profileColumnsReady=!(data||[]).length||Object.prototype.hasOwnProperty.call((data||[])[0],"coaching_types");
    setEmploymentFoundationAvailable(!(data||[]).length||Object.prototype.hasOwnProperty.call((data||[])[0],"employment_type"));
    setEmploymentRecordsAvailable(!employmentError);
    if(!employmentError)setAllEmploymentRecords((employmentData||[]) as EmploymentRecord[]);
    const foundationReady=!qualificationError&&!heldError&&profileColumnsReady;
    setStaffProfileFoundationAvailable(foundationReady);
    if(foundationReady){
      setQualificationTypes(sortedQualifications((qualificationData||[]) as QualificationType[]));
      setCoachQualifications((heldData||[]) as CoachQualification[]);
    }else if(process.env.NODE_ENV!=="production")console.info("[staffing-foundation] optional schema unavailable; legacy staff loading retained");
  }

  async function loadQualificationLibrary(){
    const[{data,error},{error:profileCapabilityError}]=await Promise.all([
      supabase.from("qualification_types").select("*").order("active",{ascending:false}).order("qualification_family").order("qualification_level",{ascending:false,nullsFirst:false}).order("name"),
      supabase.from("profiles").select("coaching_types").limit(1)
    ]);
    if(error||profileCapabilityError){
      setStaffProfileFoundationAvailable(false);
      if(process.env.NODE_ENV!=="production")console.info("[staffing-foundation] qualification library unavailable",error?.message||profileCapabilityError?.message);
      return;
    }
    setQualificationTypes(sortedQualifications((data||[]) as QualificationType[]));
    setStaffProfileFoundationAvailable(true);
  }

  async function saveQualificationType(){
    const name=qualificationDraft.name.trim(),description=qualificationDraft.description.trim()||null;
    const qualification_family=qualificationDraft.qualification_family.trim()||null;
    const qualification_level=qualificationDraft.qualification_level===""?null:Number(qualificationDraft.qualification_level);
    if(!name){flash("Enter a qualification name.");return}
    if(qualification_level!=null&&(!Number.isInteger(qualification_level)||qualification_level<=0)){flash("Qualification level must be a positive whole number.");return}
    if(qualification_level!=null&&!qualification_family){flash("Enter a qualification family when supplying a level.");return}
    setSaving(true);
    const request=qualificationDraft.id
      ?supabase.from("qualification_types").update({name,description,qualification_family,qualification_level,updated_at:new Date().toISOString()}).eq("id",qualificationDraft.id)
      :supabase.from("qualification_types").insert({name,description,qualification_family,qualification_level});
    const{error}=await request;
    setSaving(false);
    if(error){flash(error.code==="23505"?"That qualification name or family level already exists.":error.message);return}
    setQualificationDraft({name:"",description:"",qualification_family:"",qualification_level:""});
    await loadQualificationLibrary();
    flash(qualificationDraft.id?"Qualification updated.":"Qualification created.");
  }

  async function setQualificationActive(qualification:QualificationType,active:boolean){
    const{error}=await supabase.from("qualification_types").update({active,updated_at:new Date().toISOString()}).eq("id",qualification.id);
    if(error){flash(error.message);return}
    if(qualificationDraft.id===qualification.id)setQualificationDraft({name:"",description:"",qualification_family:"",qualification_level:""});
    await loadQualificationLibrary();
    flash(active?"Qualification restored.":"Qualification archived.");
  }

  async function loadBusiness(){
    const{data}=await supabase.from("business_settings").select("*").eq("id",1).maybeSingle();
    if(data)setBusiness(data as Business);
  }

  async function loadCurrentClub(){
    const{data,error}=await supabase.from("clubs").select("*").eq("id",initialProfile.club_id||"").maybeSingle();
    if(error){setClubArchitectureAvailable(false);return}
    setClubArchitectureAvailable(true);setCurrentClub((data||null) as Club|null);
  }

  async function saveClub(){
    if(!currentClub)return;
    setSaving(true);
    const payload={name:currentClub.name.trim(),short_name:currentClub.short_name?.trim()||null,logo_url:currentClub.logo_url?.trim()||null,primary_colour:currentClub.primary_colour,secondary_colour:currentClub.secondary_colour,email:currentClub.email?.trim()||null,telephone:currentClub.telephone?.trim()||null,website:currentClub.website?.trim()||null,address:currentClub.address?.trim()||null,bank_details:currentClub.bank_details?.trim()||null,payroll_month:currentClub.payroll_month,timezone:currentClub.timezone.trim(),currency:currentClub.currency.trim().toUpperCase(),updated_at:new Date().toISOString()};
    const{error}=await supabase.from("clubs").update(payload).eq("id",currentClub.id);
    if(!error){
      await Promise.all([
        supabase.from("business_settings").update({business_name:payload.name,business_address:payload.address,payment_note:business.payment_note,cutoff_day:business.cutoff_day}).eq("id",1),
        supabase.from("venues").update({name:payload.short_name||payload.name,legal_name:payload.name,invoice_address:payload.address,brand_color:payload.primary_colour,payment_note:payload.bank_details||business.payment_note}).eq("club_id",currentClub.id)
      ]);
      setBusiness({...business,business_name:payload.name,business_address:payload.address});
      await Promise.all([loadCurrentClub(),loadVenues()]);
    }
    setSaving(false);flash(error?error.message:"Club settings saved.");
  }

  async function loadStaffingIntelligenceSettings(){
    const{data,error}=await supabase.from("staffing_recommendation_settings").select("mandatory_rules,criteria,priority_order").eq("id",1).maybeSingle();
    if(error){
      setStaffingIntelligenceAvailable(false);
      if(process.env.NODE_ENV!=="production")console.error("[staffing-intelligence] settings load failed",error);
      return;
    }
    setStaffingIntelligenceAvailable(true);
    if(!data)return;
    const mandatoryRules={...DEFAULT_STAFFING_INTELLIGENCE.mandatory_rules,...((data.mandatory_rules||{}) as Record<string,StaffingRuleLevel>)};
    const activeKeys=STAFFING_CRITERIA.map(item=>item.key as string);
    const storedCriteria=(data.criteria||{}) as StaffingIntelligenceSettings["criteria"];
    const criteria=Object.fromEntries(activeKeys.map(key=>[key,storedCriteria[key]||DEFAULT_STAFFING_INTELLIGENCE.criteria[key]]));
    const storedOrder=Array.isArray(data.priority_order)?data.priority_order.filter((key):key is string=>typeof key==="string"&&activeKeys.includes(key)):[];
    const priorityOrder=[...storedOrder,...activeKeys.filter(key=>!storedOrder.includes(key))];
    setStaffingIntelligence({mandatory_rules:mandatoryRules,criteria,priority_order:priorityOrder});
  }

  async function saveStaffingIntelligenceSettings(){
    setSaving(true);
    const priorities=Object.fromEntries(Object.entries(staffingIntelligence.criteria).map(([key,value])=>[key,value.behaviour==="disabled"?0:value.weight]));
    const{error}=await supabase.from("staffing_recommendation_settings").update({mandatory_rules:staffingIntelligence.mandatory_rules,criteria:staffingIntelligence.criteria,priority_order:staffingIntelligence.priority_order,priorities,updated_at:new Date().toISOString(),updated_by:initialProfile.id}).eq("id",1);
    setSaving(false);
    if(error){if(process.env.NODE_ENV!=="production")console.error("[staffing-intelligence] settings save failed",error);flash(error.message);return}
    flash("Staffing Intelligence settings saved.");
  }

  function moveStaffingPriority(key:string,direction:-1|1){
    const order=[...staffingIntelligence.priority_order],index=order.indexOf(key),next=index+direction;
    if(index<0||next<0||next>=order.length)return;
    [order[index],order[next]]=[order[next],order[index]];
    setStaffingIntelligence({...staffingIntelligence,priority_order:order});
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
    if(isAdmin)void loadInvoiceSummary();
  }

  async function loadInvoiceSummary(){
    const{data}=await supabase.from("invoices").select("total_amount").eq("status","awaiting_payment");
    setUnpaidInvoiceTotal((data||[]).reduce((total,row:any)=>total+Number(row.total_amount||0),0));
  }

  async function loadAdmin(includeInvoices=true){
    if(!isAdmin)return;
    const{from,to}=monthRange(month);
    const [{data:coaches},{data:ss},{data:ts}]=await Promise.all([
      supabase.from("profiles").select("*").eq("role","coach").eq("is_active",true).order("full_name"),
      supabase.from("shifts").select("*").gte("shift_date",from).lte("shift_date",to),
      supabase.from("timesheets").select("*").eq("month_start",from)
    ]);
    const tids=((ts||[]) as Timesheet[]).map(t=>t.id);
    let inv:Invoice[]=[];
    if(includeInvoices&&tids.length){
      const{data}=await supabase.from("invoices").select("*").in("timesheet_id",tids);
      inv=(data||[]) as Invoice[];
    }
    setAdminMonthShifts((ss||[]) as Shift[]);
    const rows=((coaches||[]) as Profile[]).map(c=>{
      const csh=((ss||[]) as Shift[]).filter(s=>s.coach_id===c.id&&(!s.approval_status||s.approval_status==="approved"));
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
    setPendingExtraShifts(((data||[]) as Shift[]).filter(s=>!s.id||!deletedShiftIds.current.has(s.id)));
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
    const held=coachQualifications.filter(x=>x.coach_id===s.id);
    setStaffEditQualificationIds(held.map(x=>x.qualification_id));
    setStaffEditQualificationDetails(Object.fromEntries(held.map(x=>[x.qualification_id,{awarded_date:x.awarded_date||"",expiry_date:x.expiry_date||"",notes:x.notes||""}])));
    const{data}=await supabase.from("staff_venues").select("venue_id,is_admin").eq("profile_id",s.id);
    setStaffEditAdminVenueIds((data||[]).filter((x:any)=>x.is_admin).map((x:any)=>x.venue_id));
    void loadEmploymentRecords(s.id);
  }

  async function loadEmploymentRecords(profileId:string){
    const{data,error}=await supabase.from("employment_records").select("*").eq("profile_id",profileId).order("effective_from",{ascending:false});
    if(error){setEmploymentRecordsAvailable(false);setEmploymentRecords([]);if(process.env.NODE_ENV!=="production")console.info("[employment-records] unavailable",error.message);return}
    setEmploymentRecordsAvailable(true);setEmploymentRecords((data||[]) as EmploymentRecord[]);
  }

  function newEmploymentDraft(record?:EmploymentRecord):EmploymentRecordDraft{
    return{id:record?.id,organisation_id:record?.organisation_id||clubVenue()?.id||"",employment_type:record?.employment_type||"hourly",standard_rate:Number(record?.standard_rate??staffEdit?.standard_rate??staffEdit?.hourly_rate??0),enhanced_rate:Number(record?.enhanced_rate??staffEdit?.enhanced_rate??staffEdit?.hourly_rate??0),annual_salary:record?.annual_salary??null,contracted_weekly_hours:record?.contracted_weekly_hours??null,working_weeks_per_year:record?.working_weeks_per_year??null,can_volunteer:Boolean(record?.can_volunteer),invoice_required:Boolean(record?.invoice_required),effective_from:localDateKey()};
  }

  async function saveEmploymentRecord(){
    if(!staffEdit||!employmentRecordDraft||!employmentRecordDraft.organisation_id)return;
    const d=employmentRecordDraft;
    if(d.employment_type==="salaried"&&(!Number(d.annual_salary)||!Number(d.contracted_weekly_hours)||!Number(d.working_weeks_per_year))){flash("Salaried records require salary, contracted hours and working weeks.");return}
    if(d.id&&!confirm("This creates a new employment record from today's date so historical payroll and staffing reports remain accurate."))return;
    setSaving(true);
    const{error}=await supabase.rpc("create_employment_record_version",{p_existing_id:d.id||null,p_record:{...d,id:undefined,profile_id:staffEdit.id}});
    setSaving(false);
    if(error){flash(error.message);return}
    setEmploymentRecordDraft(null);flash(d.id?"New employment version created.":"Employment record added.");await Promise.all([loadEmploymentRecords(staffEdit.id),loadStaff()]);
  }
  function backToAdmin(){setActiveCoach(initialProfile)}

  function logCoachQualificationError(operation:"insert"|"update"|"delete",error:unknown,context:Record<string,unknown>){
    if(process.env.NODE_ENV!=="production")console.error("[coach-qualifications] save failed",{table:"coach_qualifications",operation,context,error});
  }

  async function saveCoachQualifications(coachId:string){
    const existing=coachQualifications.filter(x=>x.coach_id===coachId);
    const removed=existing.filter(x=>!staffEditQualificationIds.includes(x.qualification_id)).map(x=>x.qualification_id);
    const added=staffEditQualificationIds.filter(id=>!existing.some(x=>x.qualification_id===id));
    const retained=staffEditQualificationIds.filter(id=>existing.some(x=>x.qualification_id===id));

    if(removed.length){
      const{error}=await supabase.from("coach_qualifications").delete().eq("coach_id",coachId).in("qualification_id",removed);
      if(error){logCoachQualificationError("delete",error,{coachId,qualificationIds:removed});throw error}
    }
    if(added.length){
      const rows=added.map(qualification_id=>{
        const details=staffEditQualificationDetails[qualification_id];
        return{coach_id:coachId,qualification_id,awarded_date:details?.awarded_date||null,expiry_date:details?.expiry_date||null,notes:details?.notes?.trim()||null};
      });
      const{error}=await supabase.from("coach_qualifications").insert(rows);
      if(error){logCoachQualificationError("insert",error,{coachId,rows});throw error}
    }
    for(const qualification_id of retained){
      const details=staffEditQualificationDetails[qualification_id]||{awarded_date:"",expiry_date:"",notes:""};
      const values={awarded_date:details.awarded_date||null,expiry_date:details.expiry_date||null,notes:details.notes.trim()||null,updated_at:new Date().toISOString()};
      const{error}=await supabase.from("coach_qualifications").update(values).eq("coach_id",coachId).eq("qualification_id",qualification_id);
      if(error){logCoachQualificationError("update",error,{coachId,qualificationId:qualification_id,values});throw error}
    }
  }

  async function saveOwnProfile(){
    setSaving(true);
    const p=ownProfile;
    const originalEmail=(initialProfile.email||initialProfile.contact_email||"").trim().toLowerCase();
    const nextEmail=(p.email||p.contact_email||"").trim().toLowerCase();
    if(nextEmail!==originalEmail){
      const res=await fetch("/api/account-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:nextEmail})});
      const j=await res.json();
      if(!res.ok){setSaving(false);flash(j.error||"Could not update recovery email.");return}
    }
    const editable={
      full_name:p.full_name,phone:p.phone,address:p.address,account_name:p.account_name,sort_code:p.sort_code,account_number:p.account_number,utr:p.utr,invoice_prefix:p.invoice_prefix,
      email:nextEmail||null,contact_email:nextEmail||null,
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
    const original=staff.find(x=>x.id===staffEdit.id);
    const nextUsername=(staffEdit.username||"").trim().toLowerCase();
    const nextEmail=(staffEdit.email||staffEdit.contact_email||"").trim().toLowerCase();
    if(nextUsername&&!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(nextUsername)){setSaving(false);flash("Username must be 3–32 characters using letters, numbers, dots, dashes or underscores.");return}
    if(!original||nextUsername!==(original.username||"").toLowerCase()||nextEmail!==(original.email||original.contact_email||"").toLowerCase()){
      const res=await fetch("/api/staff-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"update_identity",profile_id:staffEdit.id,username:nextUsername,email:nextEmail})});
      const j=await res.json();
      if(!res.ok){setSaving(false);flash(j.error||"Could not update username/email.");return}
    }
    if(employmentFoundationAvailable&&(staffEdit.employment_type||"hourly")==="salaried"&&(!Number(staffEdit.annual_salary)||!Number(staffEdit.contracted_weekly_hours)||!Number(staffEdit.working_weeks_per_year))){setSaving(false);flash("Salaried staff require annual salary, contracted weekly hours and working weeks per year.");return}
    const payload={
      full_name:staffEdit.full_name,phone:staffEdit.phone,address:staffEdit.address,hourly_rate:Number(staffEdit.hourly_rate||0),is_active:staffEdit.is_active,
      ...(isGlobalAdmin?{role:staffEdit.role}:{}),
      username:nextUsername||null,email:nextEmail||null,contact_email:nextEmail||null,
      account_name:staffEdit.account_name,sort_code:staffEdit.sort_code,account_number:staffEdit.account_number,utr:staffEdit.utr,invoice_prefix:staffEdit.invoice_prefix,
      emergency_contact_name:staffEdit.emergency_contact_name||null,emergency_contact_phone:staffEdit.emergency_contact_phone||null,
      dbs_expiry:staffEdit.dbs_expiry||null,first_aid_expiry:staffEdit.first_aid_expiry||null,safeguarding_expiry:staffEdit.safeguarding_expiry||null,qualifications:staffEdit.qualifications||null,
      ...(staffProfileFoundationAvailable?{coaching_types:staffEdit.coaching_types||[]}:{}),
      ...(employmentFoundationAvailable?{
        employment_type:staffEdit.employment_type||"hourly",standard_rate:Number(staffEdit.standard_rate??staffEdit.hourly_rate??0),enhanced_rate:Number(staffEdit.enhanced_rate??staffEdit.hourly_rate??0),can_volunteer:Boolean(staffEdit.can_volunteer),
        annual_salary:staffEdit.annual_salary==null?null:Number(staffEdit.annual_salary),contracted_weekly_hours:staffEdit.contracted_weekly_hours==null?null:Number(staffEdit.contracted_weekly_hours),working_weeks_per_year:staffEdit.working_weeks_per_year==null?null:Number(staffEdit.working_weeks_per_year),invoice_required:Boolean(staffEdit.invoice_required)
      }:{}),
      job_title:staffEdit.job_title||null,employment_status:staffEdit.employment_status||"active",start_date:staffEdit.start_date||null,payroll_id:staffEdit.payroll_id||null,
      force_password_reset:Boolean(staffEdit.force_password_reset),admin_notes:staffEdit.admin_notes||null
    };
    const{error}=await supabase.from("profiles").update(payload).eq("id",staffEdit.id);
    if(!error&&staffProfileFoundationAvailable){try{await saveCoachQualifications(staffEdit.id)}catch(qualificationError:any){setSaving(false);flash(qualificationError?.message||"Could not save coach qualifications.");return}}
    setSaving(false);
    flash(error?error.message:"Staff profile saved.");
    if(!error){const ve=await saveVenueMemberships(staffEdit.id,staffEditVenueIds,staffEdit.role==="org_admin"?staffEditAdminVenueIds:[]);if(ve){flash(ve.message);return}setStaffEdit(null);void loadStaff();void loadAdmin();void loadAudits()}
  }

  async function saveBusiness(){
    setSaving(true);
    const{error}=await supabase.from("business_settings").update({
      business_name:currentClub?.name||business.business_name,business_address:currentClub?.address||business.business_address,payment_note:business.payment_note,cutoff_day:business.cutoff_day
    }).eq("id",1);
    setSaving(false);
    flash(error?error.message:"Business settings saved.");
  }

  function generateInvitePassword(){
    const upper="ABCDEFGHJKLMNPQRSTUVWXYZ",lower="abcdefghijkmnopqrstuvwxyz",nums="23456789",symbols="!@#$%*?";
    const all=upper+lower+nums+symbols;
    const pick=(chars:string)=>chars[Math.floor(Math.random()*chars.length)];
    let value=pick(upper)+pick(lower)+pick(nums)+pick(symbols);
    for(let i=0;i<8;i++)value+=pick(all);
    value=value.split("").sort(()=>Math.random()-.5).join("");
    setInvite({...invite,password:value});
  }

  async function sendInvite(e:FormEvent){
    e.preventDefault();
    const username=invite.username.trim().toLowerCase();
    if(invite.portalAccess&&!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)){flash("Username must be 3–32 characters using letters, numbers, dots, dashes or underscores.");return}
    if(invite.portalAccess&&invite.password.length<8){flash("Set a password of at least 8 characters.");return}
    setSaving(true);
    const res=await fetch("/api/staff-access",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"create_account",
        full_name:invite.name,
        username,
        password:invite.password,
        email:invite.email.trim(),
        hourly_rate:Number(invite.rate),
        employment_foundation_available:employmentFoundationAvailable,
        venue_ids:clubVenue()?.id?[clubVenue()!.id]:[],
        role:inviteRole,
        admin_venue_ids:inviteRole==="org_admin"&&clubVenue()?.id?[clubVenue()!.id]:[],
        portal_access:invite.portalAccess,
        force_password_reset:true
      })
    });
    const j=await res.json();setSaving(false);
    if(!res.ok){flash(j.error||"Could not create staff account.");return}
    setStaffVenueMap(current=>({...current,[j.id]:Array.isArray(j.venue_ids)?j.venue_ids:[]}));
    await refreshVenueMemberships();
    flash(invite.portalAccess?`Staff member created · username ${username}`:"Staff member created without portal access.");
    setInviteOpen(false);
    setInvite({name:"",username:"",password:"",email:"",rate:"",portalAccess:true});
    setInviteVenueIds([]);setInviteRole("coach");
    void loadStaff();void loadAdmin();
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
    const deleted={...shiftModal};
    const{error}=await supabase.from("shifts").delete().eq("id",deleted.id);
    if(error){flash(error.message);return}
    deletedShiftIds.current.add(deleted.id!);
    delete sharedDataLoads.current[`extra-shifts:${deleted.shift_date.slice(0,7)}`];
    setPendingExtraShifts(current=>current.filter(s=>s.id!==deleted.id));
    setShifts(current=>current.filter(s=>s.id!==deleted.id));
    setShiftModal(null);
    flash("Additional shift deleted.");
    if(activeCoach.id===deleted.coach_id)await loadCoachMonth(deleted.coach_id);
    if(isAdmin)await Promise.all([loadAdmin(),loadAudits(),loadPendingExtraShifts()]);
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
    const venue=clubVenue();
    if(!venue){flash("The active Club is unavailable.");return}
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
    flash(error?error.message:"Submitted on behalf of coach. Invoice created.");
    if(!error){await loadCoachMonth(coachId);void loadAdmin();void loadInvoices();void loadAudits()}
  }

  async function addTemplate(){
    const available=adminVenues();if(!available.length){flash("The active Club is unavailable.");return}
    const day=Number(prompt("Regular day: 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday, 0 Sunday","1"));
    if(Number.isNaN(day)||day<0||day>6)return;
    const venue=clubVenue()||available[0];
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

  async function loadFutureUnstaffedShifts(){
    const{data,error}=await supabase.from("scheduled_shifts").select("*").neq("status","cancelled").gte("shift_date",localDateKey()).order("shift_date").order("start_time");
    if(error)throw error;
    setFutureScheduledShifts((data||[]) as ScheduledShift[]);
  }

  function beginScheduleRequest(requestedMonth:string,source:"overview"|"schedule"){
    const requestId=++scheduleRequestSequence.current;
    latestScheduleRequest.current=requestId;
    if(process.env.NODE_ENV!=="production")console.debug("[schedule-load] request started",{requestId,requestedMonth,source});
    return requestId;
  }

  function scheduleRequestIsCurrent(requestId:number,requestedMonth:string,source:"overview"|"schedule",shiftCount:number){
    if(requestId!==latestScheduleRequest.current||requestedMonth!==currentMonthRef.current){
      if(process.env.NODE_ENV!=="production")console.debug("[schedule-load] stale request ignored",{requestId,requestedMonth,currentMonth:currentMonthRef.current,source,shiftCount});
      return false;
    }
    if(process.env.NODE_ENV!=="production")console.debug("[schedule-load] request completed",{requestId,requestedMonth,source,shiftCount});
    return true;
  }

  async function loadOverviewSchedule(){
    const requestedMonth=month;
    const requestId=beginScheduleRequest(requestedMonth,"overview");
    const{from,to}=monthRange(requestedMonth);
    const[{data:c,error:classesError},{data:profiles,error:profilesError},{data:slots,error:slotsError},{data:ss,error:scheduleError}]=await Promise.all([
      supabase.from("classes").select("*").eq("active",true).order("weekday").order("start_time"),
      supabase.from("class_profiles").select("*").eq("active",true),
      supabase.from("class_staffing_slots").select("*").order("slot_number"),
      supabase.from("scheduled_shifts").select("*").gte("shift_date",from).lte("shift_date",to).order("shift_date").order("start_time")
    ]);
    if(classesError)throw classesError;
    if(profilesError)throw profilesError;
    if(slotsError)throw slotsError;
    if(scheduleError)throw scheduleError;
    if(!scheduleRequestIsCurrent(requestId,requestedMonth,"overview",ss?.length||0))return;
    setClasses(hydrateClassSessions(c||[],(profiles||[]) as ClassProfile[]));
    setClassSlots((slots||[]) as ClassStaffingSlot[]);
    setScheduledShifts((ss||[]) as ScheduledShift[]);
  }

  async function loadRemovedOccurrences(){
    if(!isAdmin)return;
    const{data,error}=await supabase.rpc("get_removed_schedule_occurrences",{p_month_start:`${month}-01`});
    if(error){console.error(error);return}
    setRemovedOccurrences((data||[]) as RemovedOccurrence[]);
  }

  async function loadSchedule(){
    const requestedMonth=month;
    const requestId=beginScheduleRequest(requestedMonth,"schedule");
    const {from,to}=monthRange(requestedMonth);
    const [{data:c,error:classesError},{data:profiles,error:profilesError},{data:slots,error:slotsError},{data:ss,error:scheduleError},{data:removed,error:removedError},{data:qualificationData,error:qualificationError},{data:historyData,error:historyError}]=await Promise.all([
      supabase.from("classes").select("*").order("weekday").order("start_time"),
      supabase.from("class_profiles").select("*"),
      supabase.from("class_staffing_slots").select("*").order("slot_number"),
      supabase.from("scheduled_shifts").select("*").gte("shift_date",from).lte("shift_date",to).order("shift_date").order("start_time"),
      isAdmin?supabase.rpc("get_removed_schedule_occurrences",{p_month_start:`${requestedMonth}-01`}):Promise.resolve({data:[],error:null} as any),
      supabase.from("qualification_types").select("*").order("active",{ascending:false}).order("qualification_family").order("qualification_level",{ascending:false,nullsFirst:false}).order("name"),
      supabase.from("completed_class_coaching_statistics").select("class_id,coach_id,organisation_id,programme_key,class_name,sessions_coached,last_coached_date"),
      loadStaffingIntelligenceSettings()
    ]);
    if(classesError)throw classesError;
    if(profilesError)throw profilesError;
    if(slotsError)throw slotsError;
    if(scheduleError)throw scheduleError;
    if(removedError)throw removedError;
    if(!scheduleRequestIsCurrent(requestId,requestedMonth,"schedule",ss?.length||0))return;
    const hydratedClasses=hydrateClassSessions(c||[],(profiles||[]) as ClassProfile[]);
    setClasses(hydratedClasses.filter(item=>item.active));
    setArchivedClasses(hydratedClasses.filter(item=>!item.active&&(profiles||[]).some(profile=>profile.id===item.class_profile_id&&profile.active===false)));
    setClassSlots((slots||[]) as ClassStaffingSlot[]);
    setScheduledShifts((ss||[]) as ScheduledShift[]);
    setRemovedOccurrences((removed||[]) as RemovedOccurrence[]);
    const classColumnsReady=!(c||[]).length||Object.prototype.hasOwnProperty.call((c||[])[0],"lead_coaches_required");
    const foundationReady=!qualificationError&&classColumnsReady;
    setClassStaffingFoundationAvailable(foundationReady);
    if(foundationReady)setQualificationTypes(sortedQualifications((qualificationData||[]) as QualificationType[]));
    else if(process.env.NODE_ENV!=="production")console.info("[staffing-foundation] optional schema unavailable; legacy schedule loading retained");
    if(!historyError)setClassCoachingStatistics((historyData||[]) as ClassCoachingStatistic[]);
    else if(process.env.NODE_ENV!=="production")console.error("[staffing-intelligence] coaching history load failed",historyError);
  }

  function blankClassOccurrence(weekday=1,venueId=adminVenues()[0]?.id||""):ClassOccurrenceDraft{
    return{key:crypto.randomUUID(),venue_id:venueId,weekday,start_time:"16:30",finish_time:"18:00",break_minutes:0,coaches_required:1,coach_ids:[],notes:"",lead_coaches_required:1,assistant_coaches_required:0,minimum_coaches:1,maximum_coaches:1,lead_recommended_qualification_id:"",assistant_recommended_qualification_id:""};
  }

  function openNewClass(defaultDay=1){
    const av=adminVenues();
    const occurrence=blankClassOccurrence(defaultDay,av[0]?.id||"");
    setClassModal({
      venue_id:av[0]?.id||"",
      name:"",
      programme:"",minimum_age:null,maximum_age:null,active:true,
      session_colour:"#6D3A91",capacity:null,warn_if_understaffed:true,critical_if_no_lead:true,allow_below_recommended_qualification:true,
      lead_coaches_required:1,assistant_coaches_required:0,minimum_coaches:1,maximum_coaches:1,lead_recommended_qualification_id:"",assistant_recommended_qualification_id:"",
      weekday:defaultDay,
      start_time:occurrence.start_time,
      finish_time:occurrence.finish_time,
      break_minutes:0,
      coaches_required:1,
      notes:"",
      coach_ids:[],
      occurrences:[occurrence]
    });
    setClassCopySearch("");setIncludeArchivedClassCopies(false);setClassWizardStep(0);
  }

  function openOneOffShift(){
    const venueId=scheduleFilter||adminVenues()[0]?.id||"";
    const selectedDate=adminScheduleDate.startsWith(month)?adminScheduleDate:`${month}-01`;
    setOneOffShiftModal({venue_id:venueId,shift_date:selectedDate,start_time:"16:30",finish_time:"18:00",class_name:"",notes:"",profile_id:""});
  }

  async function saveOneOffShift(){
    const draft=oneOffShiftModal;
    if(!draft||!draft.venue_id||!draft.shift_date||!draft.class_name.trim())return;
    setSaving(true);
    const details={venue_id:draft.venue_id,shift_date:draft.shift_date,start_time:draft.start_time,finish_time:draft.finish_time,break_minutes:0,class_name:draft.class_name.trim(),notes:draft.notes.trim()||null};
    const request=draft.id?supabase.from("scheduled_shifts").update(details).eq("id",draft.id):supabase.from("scheduled_shifts").insert({...details,class_id:null,staffing_slot_id:null,profile_id:null,original_profile_id:null,status:"scheduled",actual_shift_id:null});
    const{data,error}=await request.select("*").single();
    setSaving(false);
    if(error){flash(error.message);return}
    setOneOffShiftModal(null);
    if(data&&(data as ScheduledShift).profile_id!==(draft.profile_id||null))await reassignScheduledWithAvailability(data as ScheduledShift,draft.profile_id);
    setAdminScheduleDate(draft.shift_date);
    const targetMonth=draft.shift_date.slice(0,7);
    if(targetMonth!==month)setMonth(targetMonth);else await loadSchedule();
    flash(`${draft.class_name.trim()} ${draft.id?"updated":"added as a one-off shift"}.`);
    if(data)setAdminScheduleShift(data as ScheduledShift);
  }

  async function deleteOneOffShift(shift:ScheduledShift){
    if(shift.class_id||!confirm(`Delete ${shift.class_name} on ${new Date(`${shift.shift_date}T12:00:00`).toLocaleDateString("en-GB")}?`))return;
    if(shift.status==="confirmed"){
      const{error:unconfirmError}=await supabase.rpc("unconfirm_scheduled_shift",{p_scheduled_id:shift.id});
      if(unconfirmError){flash(unconfirmError.message);return}
    }
    const{error}=await supabase.from("scheduled_shifts").delete().eq("id",shift.id).is("class_id",null);
    if(error){flash(error.message);return}
    setAdminScheduleShift(null);
    flash("One-off shift deleted.");
    await Promise.all([loadSchedule(),loadAdmin(false)]);
  }

  function openEditClass(c:ClassTemplate){
    // A Class Profile owns every linked recurring session.
    const group=[...classes,...archivedClasses]
      .filter(x=>c.class_profile_id?x.class_profile_id===c.class_profile_id:x.venue_id===c.venue_id&&x.name===c.name)
      .sort((a,b)=>(a.weekday-b.weekday)||a.start_time.localeCompare(b.start_time));

    const occurrences:ClassOccurrenceDraft[]=group.map(x=>{
      const slots=classSlots.filter(s=>s.class_id===x.id).sort((a,b)=>a.slot_number-b.slot_number);
      return{
        key:crypto.randomUUID(),
        id:x.id,
        venue_id:x.venue_id,
        weekday:x.weekday,
        start_time:x.start_time.slice(0,5),
        finish_time:x.finish_time.slice(0,5),
        break_minutes:Number(x.break_minutes||0),
        coaches_required:Number(x.coaches_required||1),
        coach_ids:slots.map(s=>s.default_profile_id||""),
        notes:x.notes||"",
        lead_coaches_required:Number(x.lead_coaches_required??x.coaches_required??1),
        assistant_coaches_required:Number(x.assistant_coaches_required||0),
        minimum_coaches:Number(x.minimum_coaches??x.coaches_required??1),
        maximum_coaches:Number(x.maximum_coaches??x.coaches_required??1),
        lead_recommended_qualification_id:x.lead_recommended_qualification_id||"",
        assistant_recommended_qualification_id:x.assistant_recommended_qualification_id||""
      };
    });

    const first=occurrences[0]||blankClassOccurrence(c.weekday,c.venue_id);
    const sharedCoachCount=Math.max(1,first.lead_coaches_required+first.assistant_coaches_required);
    setClassModal({
      id:c.id,
      class_profile_id:c.class_profile_id,
      original_ids:group.map(x=>x.id),
      venue_id:c.venue_id,
      name:c.name,
      programme:c.programme||"",minimum_age:c.minimum_age??null,maximum_age:c.maximum_age??null,active:c.active,
      session_colour:c.session_colour||"#6D3A91",capacity:c.capacity??null,warn_if_understaffed:c.warn_if_understaffed!==false,critical_if_no_lead:c.critical_if_no_lead!==false,allow_below_recommended_qualification:c.allow_below_recommended_qualification!==false,
      lead_coaches_required:Number(c.lead_coaches_required??c.coaches_required??1),assistant_coaches_required:Number(c.assistant_coaches_required||0),minimum_coaches:Number(c.minimum_coaches??c.coaches_required??1),maximum_coaches:Number(c.maximum_coaches??c.coaches_required??1),lead_recommended_qualification_id:c.lead_recommended_qualification_id||"",assistant_recommended_qualification_id:c.assistant_recommended_qualification_id||"",
      weekday:first.weekday,
      start_time:first.start_time,
      finish_time:first.finish_time,
      break_minutes:first.break_minutes,
      coaches_required:first.coaches_required,
      notes:first.notes,
      coach_ids:[...first.coach_ids],
      occurrences:(occurrences.length?occurrences:[first]).map(occurrence=>({...occurrence,coaches_required:sharedCoachCount,coach_ids:occurrence.coach_ids.slice(0,sharedCoachCount)}))
    });
    setClassWizardStep(1);
  }

  function duplicateClassGroup(c:ClassTemplate){
    const group=[...classes,...archivedClasses]
      .filter(x=>c.class_profile_id?x.class_profile_id===c.class_profile_id:x.venue_id===c.venue_id&&x.name===c.name)
      .sort((a,b)=>(a.weekday-b.weekday)||a.start_time.localeCompare(b.start_time));
    const occurrences=group.map(x=>{
      const slots=classSlots.filter(s=>s.class_id===x.id).sort((a,b)=>a.slot_number-b.slot_number);
      return{
        key:crypto.randomUUID(),
        venue_id:x.venue_id,
        weekday:x.weekday,
        start_time:x.start_time.slice(0,5),
        finish_time:x.finish_time.slice(0,5),
        break_minutes:x.break_minutes,
        coaches_required:x.coaches_required,
        coach_ids:slots.map(s=>s.default_profile_id||""),
        notes:x.notes||"",
        lead_coaches_required:Number(x.lead_coaches_required??x.coaches_required??1),
        assistant_coaches_required:Number(x.assistant_coaches_required||0),
        minimum_coaches:Number(x.minimum_coaches??x.coaches_required??1),
        maximum_coaches:Number(x.maximum_coaches??x.coaches_required??1),
        lead_recommended_qualification_id:x.lead_recommended_qualification_id||"",
        assistant_recommended_qualification_id:x.assistant_recommended_qualification_id||""
      };
    });
    setClassModal({
      venue_id:c.venue_id,
      name:`${c.name} copy`,
      programme:c.programme||"",minimum_age:c.minimum_age??null,maximum_age:c.maximum_age??null,active:true,
      session_colour:c.session_colour||"#6D3A91",capacity:c.capacity??null,warn_if_understaffed:c.warn_if_understaffed!==false,critical_if_no_lead:c.critical_if_no_lead!==false,allow_below_recommended_qualification:c.allow_below_recommended_qualification!==false,
      lead_coaches_required:Number(c.lead_coaches_required??c.coaches_required??1),assistant_coaches_required:Number(c.assistant_coaches_required||0),minimum_coaches:Number(c.minimum_coaches??c.coaches_required??1),maximum_coaches:Number(c.maximum_coaches??c.coaches_required??1),lead_recommended_qualification_id:c.lead_recommended_qualification_id||"",assistant_recommended_qualification_id:c.assistant_recommended_qualification_id||"",
      weekday:occurrences[0]?.weekday??1,
      start_time:occurrences[0]?.start_time||"16:30",
      finish_time:occurrences[0]?.finish_time||"18:00",
      break_minutes:occurrences[0]?.break_minutes||0,
      coaches_required:occurrences[0]?.coaches_required||1,
      notes:"",
      coach_ids:occurrences[0]?.coach_ids||[],
      occurrences:occurrences.length?occurrences:[blankClassOccurrence(1,c.venue_id)]
    });
    setClassWizardStep(1);
  }

  async function saveClass(){
    if(!classModal||!classModal.name.trim()||!classModal.venue_id)return;
    const occurrences=(classModal.occurrences?.length?classModal.occurrences:[{
      ...blankClassOccurrence(classModal.weekday,classModal.venue_id),
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
    if(!classModal.capacity||classModal.capacity<1){flash("Capacity is required.");return}
    if(occurrences.some(item=>!item.venue_id||!item.start_time||!item.finish_time)){flash("Every recurring session needs a venue, start time and finish time.");return}
    const recurrenceKeys=occurrences.map(item=>`${item.weekday}:${item.start_time}`);
    if(new Set(recurrenceKeys).size!==recurrenceKeys.length){flash("Each recurring day and time must be unique.");return}
    if(classModal.minimum_age!=null&&classModal.maximum_age!=null&&classModal.maximum_age<classModal.minimum_age){flash("Maximum age must be greater than or equal to minimum age.");return}

    const firstOccurrence=occurrences[0];
    const[startHour,startMinute]=firstOccurrence.start_time.split(":").map(Number);
    const[finishHour,finishMinute]=firstOccurrence.finish_time.split(":").map(Number);
    let sessionLengthMinutes=finishHour*60+finishMinute-startHour*60-startMinute;
    if(sessionLengthMinutes<=0)sessionLengthMinutes+=1440;
    if(sessionLengthMinutes<1){flash("Session Length is required.");return}

    setSaving(true);
    const keptIds:string[]=[];
    const profilePayload={
      name:classModal.name.trim(),
      programme:classModal.programme.trim()||null,
      session_colour:classModal.session_colour,
      capacity:classModal.capacity,
      session_length_minutes:sessionLengthMinutes,
      minimum_age:classModal.minimum_age,
      maximum_age:classModal.maximum_age,
      active:classModal.active,
      lead_coaches_required:Math.max(0,Number(classModal.lead_coaches_required||0)),
      assistant_coaches_required:Math.max(0,Number(classModal.assistant_coaches_required||0)),
      minimum_coaches:Math.max(0,Number(classModal.minimum_coaches||0)),
      maximum_coaches:Math.max(Number(classModal.minimum_coaches||0),Number(classModal.maximum_coaches||0)),
      lead_recommended_qualification_id:classModal.lead_recommended_qualification_id||null,
      assistant_recommended_qualification_id:classModal.assistant_recommended_qualification_id||null,
      warn_if_understaffed:classModal.warn_if_understaffed,
      critical_if_no_lead:classModal.critical_if_no_lead,
      allow_below_recommended_qualification:classModal.allow_below_recommended_qualification,
      updated_at:new Date().toISOString()
    };
    let classProfileId=classModal.class_profile_id||"";
    if(classProfileId){
      const{error}=await supabase.from("class_profiles").update(profilePayload).eq("id",classProfileId);
      if(error){setSaving(false);flash(error.message);return}
    }else{
      const{data,error}=await supabase.from("class_profiles").insert(profilePayload).select("id").single();
      if(error){setSaving(false);flash(error.message);return}
      classProfileId=data.id;
    }

    for(const occurrence of occurrences){
      const payload={
        class_profile_id:classProfileId,
        venue_id:occurrence.venue_id,
        weekday:Number(occurrence.weekday),
        start_time:occurrence.start_time,
        break_minutes:Number(occurrence.break_minutes||0),
        notes:occurrence.notes||null,
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
      const required=Math.max(1,profilePayload.lead_coaches_required+profilePayload.assistant_coaches_required);

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
    const request=c.class_profile_id
      ?supabase.rpc("set_class_profile_active",{p_profile_id:c.class_profile_id,p_active:false})
      :supabase.from("classes").update({active:false,updated_at:new Date().toISOString()}).eq("id",c.id);
    const{error}=await request;flash(error?error.message:"Class archived.");if(!error)await loadSchedule();
  }

  async function restoreClass(c:ClassTemplate){
    if(!c.class_profile_id)return;
    const{error}=await supabase.rpc("set_class_profile_active",{p_profile_id:c.class_profile_id,p_active:true});
    flash(error?error.message:"Class restored.");if(!error)await loadSchedule();
  }

  async function permanentlyDeleteClass(c:ClassTemplate){
    if(!c.class_profile_id)return;
    const confirmation=prompt(`Delete Class\n\nYou are about to permanently delete:\n\n${c.name}\n\nThis action cannot be undone.\n\nType DELETE to continue.`);
    if(confirmation!=="DELETE"){if(confirmation!==null)flash("Deletion cancelled. Type DELETE exactly to continue.");return}
    const{error}=await supabase.rpc("delete_class_profile_if_unused",{p_profile_id:c.class_profile_id});
    flash(error?(error.message.includes("historical records")?"This class contains historical records and cannot be deleted. Archive it instead.":error.message):"Class permanently deleted.");
    if(!error){setClassActionsOpen(null);setClassModal(null);await loadSchedule()}
  }

  function ClassMoreActions({classItem}:{classItem:ClassTemplate}){
    const actionKey=classItem.class_profile_id||classItem.id;
    const isOpen=classActionsOpen===actionKey;
    return <div className="v313MoreWrap" onClick={event=>event.stopPropagation()}>
      <button className="btn btnSecondary" type="button" aria-haspopup="menu" aria-expanded={isOpen} onClick={()=>setClassActionsOpen(isOpen?null:actionKey)}>More Actions <span className="v313Chevron">⌄</span></button>
      {isOpen&&<><button className="v313MenuScrim" type="button" aria-label="Close class actions" onClick={()=>setClassActionsOpen(null)}/><div className="v313MoreMenu" role="menu"><button type="button" onClick={()=>{setClassActionsOpen(null);duplicateClassGroup(classItem)}}>Duplicate Class</button>{classItem.active?<button type="button" onClick={()=>{setClassActionsOpen(null);void archiveClass(classItem)}}>Archive Class</button>:<button type="button" onClick={()=>{setClassActionsOpen(null);void restoreClass(classItem)}}>Restore Class</button>}<div className="v313MenuDivider"/><button className="danger" type="button" onClick={()=>void permanentlyDeleteClass(classItem)}>Delete Class</button></div></>}
    </div>;
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

  async function confirmScheduled(sch:ScheduledShift,options:{refresh?:boolean;announce?:boolean}={}):Promise<boolean>{
    const refresh=options.refresh!==false,announce=options.announce!==false;
    if(!sch.profile_id?.trim()){flash("Assign a coach before confirming this shift.");return false}
    if(!isEligibleForShiftConfirmation(sch)){flash("This shift is not eligible for confirmation.");return false}
    if(announce)flash("Confirming shift…");

    const monthStart=`${sch.shift_date.slice(0,7)}-01`;
    const{data:lockedTs,error:tsError}=await supabase
      .from("timesheets")
      .select("status")
      .eq("coach_id",sch.profile_id)
      .eq("month_start",monthStart)
      .maybeSingle();
    if(tsError){flash(tsError.message);return false}
    if(lockedTs?.status==="submitted"||lockedTs?.status==="paid"){
      flash("That month is locked. Reopen it before confirming this shift.");
      return false;
    }

    const shiftPayload={
      coach_id:sch.profile_id,
      shift_date:sch.shift_date,
      start_time:sch.start_time,
      finish_time:sch.finish_time,
      break_minutes:Number(sch.break_minutes||0),
      venue_id:sch.venue_id,
      session_location:sch.class_name,
      notes:sch.notes||"Scheduled class",
      source:"schedule",
      scheduled_shift_id:sch.id,
      approval_status:"approved",
      payment_type:sch.payment_type||"standard"
    };

    let actualShiftId=sch.actual_shift_id||null;
    if(actualShiftId){
      const{data,error}=await supabase.from("shifts").update(shiftPayload).eq("id",actualShiftId).select("id").single();
      if(error){flash(error.message);return false}
      actualShiftId=data.id;
    }else{
      const{data,error}=await supabase.from("shifts").insert(shiftPayload).select("id").single();
      if(error){flash(error.message);return false}
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
      return false;
    }

    if(announce)flash("Shift confirmed into timesheet.");
    if(refresh){
      await loadSchedule();
      if(sch.profile_id===initialProfile.id||sch.profile_id===activeCoach.id)await loadCoachMonth(sch.profile_id);
      if(isAdmin)await loadAdmin();
    }
    return true;
  }

  function eligibleDailyConfirmations(date:string,profileId:string|null=null){
    return scheduleScope.filter(shift=>shift.shift_date===date&&(!profileId||shift.profile_id===profileId)&&isEligibleForShiftConfirmation(shift));
  }

  function openDailyConfirmation(date:string,profileId:string|null=null){
    const eligible=eligibleDailyConfirmations(date,profileId);
    setDailyConfirmation({profileId,date,selectedIds:eligible.map(shift=>shift.id)});
  }

  async function confirmDailySelection(){
    if(!dailyConfirmation)return;
    const eligible=eligibleDailyConfirmations(dailyConfirmation.date,dailyConfirmation.profileId);
    const selected=eligible.filter(shift=>dailyConfirmation.selectedIds.includes(shift.id));
    if(!selected.length)return;
    setSaving(true);flash(`Confirming ${selected.length} shift${selected.length===1?"":"s"}…`);
    let confirmed=0;
    for(const shift of selected)if(await confirmScheduled(shift,{refresh:false,announce:false}))confirmed++;
    setSaving(false);setDailyConfirmation(null);
    await Promise.all([loadSchedule(),dailyConfirmation.profileId?loadCoachMonth(dailyConfirmation.profileId):Promise.resolve(),isAdmin?loadAdmin():Promise.resolve(),isAdmin?loadOverviewSchedule():Promise.resolve()]);
    if(confirmed===selected.length)flash(`${confirmed} shift${confirmed===1?"":"s"} confirmed into payroll.`);
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
    if(!error){setShiftModal(null);if(activeCoach.id===s.coach_id)await loadCoachMonth(s.coach_id);await loadAdmin();await loadPendingExtraShifts();await loadSchedule()}
  }

  async function rejectExtraShift(s:Shift){
    if(!s.id)return;
    const{error}=await supabase.rpc("reject_extra_shift",{p_shift_id:s.id});
    flash(error?error.message:"Extra shift rejected.");
    if(!error){setShiftModal(null);if(activeCoach.id===s.coach_id)await loadCoachMonth(s.coach_id);await loadAdmin();await loadPendingExtraShifts();await loadSchedule()}
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
    setCoachAssignmentSearch("");
    if(isAssignedShift(s))setAdminScheduleShift(s);
    else openStaffingRecommendations(s);
  }

  function openStaffingRecommendations(s:ScheduledShift){
    const classTemplate=classes.find(item=>item.id===s.class_id)||null;
    const staffingSlot=classSlots.find(item=>item.id===s.staffing_slot_id)||null;
    const role:"lead"|"assistant"=(staffingSlot?.slot_number||1)<=Number(classTemplate?.lead_coaches_required||1)?"lead":"assistant";
    const recommendedQualificationId=(role==="lead"?classTemplate?.lead_recommended_qualification_id:classTemplate?.assistant_recommended_qualification_id)||null;
    const context={classId:s.class_id,staffingSlotId:s.staffing_slot_id,role,recommendedQualificationId,recommendedQualification:qualificationTypes.find(item=>item.id===recommendedQualificationId)||null};
    if(process.env.NODE_ENV!=="production")console.debug("[staffing-intelligence] INITIAL qualification status",context);
    setStaffingQualificationContext(context);
    setStaffingRecommendationShift(s);
  }

  const scheduleHours=(s:ScheduledShift)=>shiftHours({coach_id:s.profile_id||"",shift_date:s.shift_date,start_time:s.start_time,finish_time:s.finish_time,break_minutes:s.break_minutes,session_location:s.class_name,notes:s.notes});
  const classTemplateHours=(c:ClassTemplate)=>shiftHours({coach_id:"",shift_date:"",start_time:c.start_time,finish_time:c.finish_time,break_minutes:c.break_minutes,session_location:c.name,notes:c.notes});
  const profileById=(id:string|null)=>staff.find(x=>x.id===id)||(id===initialProfile.id?initialProfile:null);
  const validAssignedProfile=(profileId:string|null|undefined)=>{const id=profileId?.trim();if(!id)return null;return profileById(id)};
  const isEligibleForShiftConfirmation=(shift:ScheduledShift)=>Boolean(shift.profile_id?.trim())&&shift.status==="scheduled"&&shift.adjustment_status!=="pending";
  const isAssignedShift=(shift:ScheduledShift)=>Boolean(validAssignedProfile(shift.profile_id));
  const isRecommendationCandidate=(profile:Profile)=>profile.is_active&&!new Set(["unassigned","unfilled","vacant"]).has(profile.full_name.trim().toLocaleLowerCase());
  const staffOptionsForVenue=(venueId:string)=>{const list=staff.filter(p=>(staffVenueMap[p.id]||[]).includes(venueId)&&isRecommendationCandidate(p));if((staffVenueMap[initialProfile.id]||[]).includes(venueId)&&isRecommendationCandidate(initialProfile)&&!list.some(p=>p.id===initialProfile.id))return [initialProfile,...list];return list};
  const scheduleScope=scheduledShifts.filter(s=>!scheduleFilter||s.venue_id===scheduleFilter);
  const plannedSchedule=scheduleScope.filter(s=>s.status!=="cancelled");
  const forecastCost=plannedSchedule.reduce((a,s)=>a+scheduleHours(s)*Number(profileById(s.profile_id)?.hourly_rate||0),0);
  const confirmedScheduleCost=scheduleScope.filter(s=>s.status==="confirmed").reduce((a,s)=>a+scheduleHours(s)*Number(profileById(s.profile_id)?.hourly_rate||0),0);
  const unassignedScheduleCount=plannedSchedule.filter(s=>!isAssignedShift(s)).length;
  const actualScheduleCost=adminMonthShifts.filter(s=>!scheduleFilter||s.venue_id===scheduleFilter).reduce((a,s)=>a+shiftHours(s)*Number(profileById(s.coach_id)?.hourly_rate||0),0);
  const normalCost=classes.filter(c=>!scheduleFilter||c.venue_id===scheduleFilter).reduce((total,c)=>{
    const [y,m]=month.split("-").map(Number);const last=new Date(y,m,0).getDate();let occurrences=0;
    for(let d=1;d<=last;d++)if(new Date(y,m-1,d).getDay()===c.weekday)occurrences++;
    const slots=classSlots.filter(x=>x.class_id===c.id);
    return total+slots.reduce((a,slot)=>a+occurrences*shiftHours({coach_id:slot.default_profile_id||"",shift_date:`${month}-01`,start_time:c.start_time,finish_time:c.finish_time,break_minutes:c.break_minutes,session_location:c.name,notes:null})*Number(profileById(slot.default_profile_id)?.hourly_rate||0),0);
  },0);

  const scheduledActualShiftIds=new Set(scheduledShifts.map(s=>s.actual_shift_id).filter(Boolean));
  const additionalWorkScope=pendingExtraShifts.filter(s=>!s.scheduled_shift_id&&!scheduledActualShiftIds.has(s.id||"")&&(!scheduleFilter||s.venue_id===scheduleFilter));
  const pendingAdditionalScope=additionalWorkScope.filter(s=>s.approval_status==="pending");
  const approvedAdditionalScope=additionalWorkScope.filter(s=>s.approval_status==="approved");
  const pendingAdditionalCount=pendingAdditionalScope.length;
  const today=localDateKey();
  const scheduleDateAfter=(date:string,days:number)=>{const[y,m,d]=date.split("-").map(Number);const next=new Date(y,m-1,d,12);next.setDate(next.getDate()+days);return localDateKey(next)};
  const tomorrow=scheduleDateAfter(today,1);
  const staffingWindowEnd=scheduleDateAfter(today,7);
  const pendingLeaveCount=timeAwayRequests.filter(r=>r.status==="pending").length;
  type SchedulingIssue={id:string;severity:"critical"|"warning"|"reminder";coach:string;description:string;date:string;startTime:string;finishTime:string;venueId:string|null;className:string;shift:ScheduledShift|null;extraShift?:Shift};
  const schedulingIssues:SchedulingIssue[]=plannedSchedule.flatMap<SchedulingIssue>(s=>{
    const assignedProfile=validAssignedProfile(s.profile_id);
    const classProfile=classes.find(item=>item.id===s.class_id);
    const staffingSlot=classSlots.find(item=>item.id===s.staffing_slot_id);
    const missingLead=(staffingSlot?.slot_number||1)<=Number(classProfile?.lead_coaches_required||1);
    const coach=assignedProfile?.full_name||"Unassigned";
    const base={date:s.shift_date,startTime:s.start_time,finishTime:s.finish_time,venueId:s.venue_id,className:s.class_name,shift:s};
    const issues:SchedulingIssue[]=[];
    if(s.shift_date>staffingWindowEnd&&!isAssignedShift(s)&&classProfile?.warn_if_understaffed!==false){
      issues.push({...base,id:`${s.id}-future-staffing`,severity:"reminder",coach,description:"Staffing still required"});
      return issues;
    }
    if(!isAssignedShift(s)){
      if(classProfile?.warn_if_understaffed!==false&&s.shift_date>=today&&s.shift_date<=staffingWindowEnd)issues.push({...base,id:`${s.id}-unassigned`,severity:missingLead&&classProfile?.critical_if_no_lead!==false?"critical":"warning",coach,description:missingLead?"No Lead Coach assigned":s.shift_date===today?"Today's shift is understaffed":s.shift_date===tomorrow?"Tomorrow's shift is understaffed":"Shift within 7 days is understaffed"});
      return issues;
    }
    if(approvedConflictsForCoach(assignedProfile!.id,s.shift_date,s.start_time,s.finish_time).length)issues.push({...base,id:`${s.id}-away`,severity:"critical",coach,description:"Coach assigned whilst on approved Leave"});
    if(scheduledOverlapsForCoach(assignedProfile!.id,s).length)issues.push({...base,id:`${s.id}-double`,severity:"critical",coach,description:"Coach double booked"});
    if(pendingConflictsForCoach(assignedProfile!.id,s.shift_date,s.start_time,s.finish_time).length)issues.push({...base,id:`${s.id}-pending-leave`,severity:"warning",coach,description:"Coach has a Pending Leave / Unavailable request"});
    if(s.adjustment_status==="pending")issues.push({...base,id:`${s.id}-adjustment`,severity:"warning",coach,description:"Actual hours adjustment awaiting approval"});
    return issues;
  });
  const representedUnstaffedIds=new Set(schedulingIssues.filter(issue=>issue.id.endsWith("-future-staffing")||issue.id.endsWith("-unassigned")).map(issue=>issue.shift?.id).filter(Boolean));
  futureScheduledShifts.forEach(s=>{
    if(!s.id||representedUnstaffedIds.has(s.id)||s.shift_date<=staffingWindowEnd||s.status==="cancelled"||isAssignedShift(s))return;
    schedulingIssues.push({id:`${s.id}-future-staffing`,severity:"reminder",coach:"Unassigned",description:"Staffing still required",date:s.shift_date,startTime:s.start_time,finishTime:s.finish_time,venueId:s.venue_id,className:s.class_name,shift:s});
    representedUnstaffedIds.add(s.id);
  });
  pendingAdditionalScope.forEach(s=>{const hours=shiftHours(s),value=hours*Number(profileById(s.coach_id)?.hourly_rate||0);schedulingIssues.push({id:`extra-${s.id}`,severity:"warning",coach:profileById(s.coach_id)?.full_name||"Staff member",description:`Additional shift awaiting approval · ${hours.toFixed(2)}h · ${money(value)}`,date:s.shift_date,startTime:s.start_time,finishTime:s.finish_time,venueId:s.venue_id||null,className:s.session_location||"Additional work",shift:null,extraShift:s})});
  if(classes.length>0&&plannedSchedule.length===0)schedulingIssues.push({id:`${month}-not-generated`,severity:"reminder",coach:"—",description:"Schedule generation reminder",date:`${month}-01`,startTime:"",finishTime:"",venueId:null,className:"Monthly schedule",shift:null});
  const severityOrder={critical:0,warning:1,reminder:2};
  schedulingIssues.sort((a,b)=>severityOrder[a.severity]-severityOrder[b.severity]||`${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
  const criticalSchedulingCount=schedulingIssues.filter(issue=>issue.severity==="critical").length;
  const warningSchedulingCount=schedulingIssues.filter(issue=>issue.severity==="warning").length;
  const reminderSchedulingCount=schedulingIssues.filter(issue=>issue.severity==="reminder").length;
  const approvedLeaveCount=timeAwayRequests.filter(r=>r.status==="approved").length;
  const submittedCount=adminRows.filter(r=>r.timesheet?.status==="submitted"||r.timesheet?.status==="paid").length;
  const unpaidTotal=unpaidInvoiceTotal;
  const adminHours=adminRows.reduce((a,r)=>a+r.hours,0);
  const filteredStaff=staff.filter(s=>`${s.full_name} ${s.email||""}`.toLowerCase().includes(search.toLowerCase()));

  const mobilePageMeta=(()=>{
    if(!isAdmin){
      if(tab==="schedule")return null;
      if(tab==="leave")return{eyebrow:"My availability",title:"Leave & Availability",sub:"Request leave and tell us when you cannot coach."};
      if(tab==="timesheets")return{eyebrow:"My work",title:"My Timesheet",sub:"Review confirmed coaching and submit your month when everything is correct."};
      if(tab==="invoices")return{eyebrow:"My pay",title:"My Payslips",sub:"Your payment history and completed monthly invoices."};
      if(tab==="profile")return{eyebrow:"My account",title:"My Profile",sub:"Keep your personal, payment and compliance details up to date."};
      return null;
    }
    if(tab==="dashboard")return{eyebrow:"Overview",title:"Club Operations",sub:"Today’s staffing, schedule and payroll position at a glance."};
    if(tab==="schedule"&&!adminPersonalRota)return{eyebrow:"Planning",title:"Schedule & Staffing",sub:"Build once, copy forward and only change the exceptions."};
    if(tab==="availability")return{eyebrow:"People",title:"Staff Availability",sub:"A live operational view of who is available to coach."};
    if(tab==="leave")return{eyebrow:"People",title:"Leave Management",sub:"Review staff leave and availability requests."};
    if(tab==="timesheets")return{eyebrow:"Payroll",title:"Timesheets",sub:"Review hours, submissions and monthly payroll status."};
    if(tab==="invoices")return{eyebrow:"Payroll",title:"Invoices",sub:"Generated invoices, payment status and history."};
    if(tab==="staff")return{eyebrow:"People",title:"Staff",sub:"Manage coaches, access, rates and compliance."};
    if(tab==="workforce")return{eyebrow:"Management",title:"Workforce",sub:"Employment, worked hours and workforce cost."};
    if(tab==="reports")return{eyebrow:"Insights",title:"Reports",sub:"Staffing cost, hours and activity for the club."};
    if(tab==="settings")return{eyebrow:"Settings",title:"Club Settings",sub:"Manage club identity, branding and payroll configuration."};
    if(tab==="profile")return{eyebrow:"My account",title:"My Profile",sub:"Your own coaching, payment and compliance details."};
    return null;
  })();

  return <div className="portal">
    <Sidebar tab={tab} setTab={(t:Tab)=>{setAdminPersonalRota(false);setTab(t);if(t!=="timesheets")backToAdmin()}} name={initialProfile.full_name} role={initialProfile.role} onSignOut={signOut} mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)}/>
    <div className="mainWrap">
      <header className="topbar"><div className="row"><div className="v3HeaderLogo"><AvLogo size={31}/></div><div className="topTitle">AV Gymnastics</div></div><div className="topActions"><span className="versionBadge">v5.1</span><span className="muted desktopEmail" style={{fontSize:12}}>{initialProfile.email}</span></div></header>
      <main className="main">
        {mobilePageMeta&&<div className="v303MobilePageHero">
          <span>{mobilePageMeta.eyebrow}</span>
          <h1>{mobilePageMeta.title}</h1>
          <p>{mobilePageMeta.sub}</p>
        </div>}
        {message&&<div className={`notice ${/(saved|sent|submitted|added|copied|reopened|created|paid)/i.test(message)?"success":""}`}>{message}</div>}
        {tab!=="dashboard"&&tabLoadError?.tab===tab?TabLoadFailure():tab!=="dashboard"&&(loadingTab===tab||!loadedTabs.has(tab))?TabLoadingSkeleton():<>
          {tab==="dashboard"&&DashboardView()}
          {tab==="availability"&&isAdmin&&StaffAvailabilityView()}
          {tab==="schedule"&&ScheduleView()}
          {tab==="leave"&&LeaveView()}
          {tab==="timesheets"&&TimesheetView()}
          {tab==="invoices"&&InvoicesView()}
          {tab==="staff"&&isAdmin&&StaffView()}
          {tab==="workforce"&&isAdmin&&WorkforceView()}
          {tab==="reports"&&isAdmin&&ReportsView()}
          {tab==="settings"&&isAdmin&&SettingsView()}
          {tab==="profile"&&ProfileView()}
        </>}
      </main>
    </div>
    {timeAwayModal!==undefined&&TimeAwayModal()}
    {shiftModal&&ShiftModal()}
    {inviteOpen&&InviteModal()}
    {staffEdit&&StaffModal()}
    {templateOpen&&TemplateModal()}
    {masterTimetableOpen&&MasterTimetablePanel()}
    {classModal&&ClassModal()}
    {oneOffShiftModal&&OneOffShiftModal()}
    {adminScheduleShift&&AdminScheduleShiftModal()}
    {staffingRecommendationShift&&IntelligentStaffingDrawer()}
    {confirmShift&&ConfirmShiftModal()}
    {dailyConfirmation&&DailyConfirmationModal()}
    {adjustShift&&AdjustmentModal()}
    <MobileNav tab={tab} setTab={(t:Tab)=>{setAdminPersonalRota(false);setTab(t);if(t!=="timesheets")backToAdmin()}} role={initialProfile.role} name={initialProfile.full_name} open={mobileMoreOpen} setOpen={setMobileMoreOpen} onSignOut={signOut}/>
  </div>;

  function PageHead({title,sub,children,centered=false,dashboard=false}:{title:string;sub:string;children?:React.ReactNode;centered?:boolean;dashboard?:boolean}){return <div className={`pageHead ${centered?"v434CenteredPageHead":""} ${dashboard?"v435DashboardHead":""}`}><div><h1>{title}</h1><p>{sub}</p></div>{children}</div>}
  function TabLoadingSkeleton(){
    return <div className={`v412Loading v432Skeleton-${tab}`} role="status" aria-live="polite" aria-label="Loading page data">
      <span className="srOnly">Loading page data</span>
      <div className="v412SkeletonHead"><i/><i/></div>
      <div className="v412SkeletonCards"><i/><i/><i/></div>
      <div className="v412SkeletonPanel"><i/><i/><i/><i/></div>
    </div>;
  }
  function TabLoadFailure(){
    return <div className="card v432LoadFailure" role="alert"><div><strong>We couldn’t load this page</strong><span>{tabLoadError?.message||"Please try again."}</span></div><button className="btn btnPrimary" onClick={()=>{clearTabLoaded(tab);setTabLoadError(null);void loadTabOnce(tab)}}>Retry</button></div>;
  }
  function MonthNavigation(){
    return <div className="monthNavigator v500MonthNavigation" aria-label="Month navigation">
      <button className="btn btnSecondary monthArrow" type="button" onClick={()=>changeMonth(-1)}>←</button>
      <button className="monthCurrent" type="button" onClick={()=>setMonth(monthKey())}>{monthLabel(month)}</button>
      <button className="btn btnSecondary monthArrow" type="button" onClick={()=>changeMonth(1)}>→</button>
    </div>
  }
  function PageActionBar({children,className=""}:{children:React.ReactNode;className?:string}){return <div className={`v500ActionBar ${className}`}>{children}</div>}
  function FilterBar({children,className=""}:{children:React.ReactNode;className?:string}){return <div className={`v500FilterBar ${className}`}>{children}</div>}

  function DashboardView(){
    const activeWorkforce=staff.filter(person=>person.is_active);
    const employmentTypeFor=(person:Profile)=>person.employment_type==="salaried"||person.employment_type==="volunteer"?person.employment_type:"hourly";
    const hourlyWorkforce=activeWorkforce.filter(person=>employmentTypeFor(person)==="hourly").length;
    const salariedWorkforce=activeWorkforce.filter(person=>employmentTypeFor(person)==="salaried").length;
    const volunteerWorkforce=activeWorkforce.filter(person=>employmentTypeFor(person)==="volunteer").length;
    const openSchedulingIssue=(issue:SchedulingIssue)=>{
      if(issue.extraShift){setShiftModal(issue.extraShift);return}
      setHighlightedScheduleShiftId(issue.shift?.id||null);
      if(issue.shift)openAdminScheduleShift(issue.shift);
    };
    if(isAdmin)return <><PageHead centered dashboard title={`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${initialProfile.full_name.split(" ")[0]}`} sub="Your current staffing, timesheet and invoice position."><div className="v434OverviewHeadControls"><MonthNavigation/><button className="btn btnSecondary" onClick={()=>{setAdminPersonalRota(true);setTab("schedule")}}>My Schedule</button></div></PageHead>
      <div className="grid grid4"><div className="card v12ActiveWorkforce"><div><UsersIcon/><span>Active Workforce</span></div><strong>{activeWorkforce.length}<small>Total Staff</small></strong><dl><div><dt>Hourly</dt><dd>{hourlyWorkforce}</dd></div><div><dt>Salaried</dt><dd>{salariedWorkforce}</dd></div><div><dt>Volunteer</dt><dd>{volunteerWorkforce}</dd></div></dl></div><StatCard label="Hours this month" value={adminHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Submitted" value={`${submittedCount}/${adminRows.length}`} foot={`${Math.max(0,adminRows.length-submittedCount)} outstanding`} icon={<CheckIcon/>}/><StatCard label="Unpaid invoices" value={money(unpaidTotal)} foot="Awaiting payment" icon={<PoundIcon/>}/></div>{pendingLeaveCount>0&&<button className="v33DashboardAlert" onClick={()=>setTab("leave")}><div className="v33AlertIcon"><CalendarIcon/></div><div><strong>{pendingLeaveCount} leave / availability {pendingLeaveCount===1?"request":"requests"} awaiting review</strong><span>Open Leave Management to approve or decline.</span></div><span className="v33AlertCount">{pendingLeaveCount}</span></button>}{timeAwayRequests.filter(r=>r.status==="approved"&&r.start_date<=today&&r.end_date>=today).length>0&&<button className="v340AwayToday" onClick={()=>setTab("leave")}><div><span>Away today</span><strong>{timeAwayRequests.filter(r=>r.status==="approved"&&r.start_date<=today&&r.end_date>=today).length} staff unavailable</strong></div><div className="v340AwayNames">{timeAwayRequests.filter(r=>r.status==="approved"&&r.start_date<=today&&r.end_date>=today).slice(0,3).map(r=><span key={r.id}>{profileById(r.profile_id)?.full_name||"Staff"}</span>)}</div></button>}
      <section className={`card v402ActionCentre ${criticalSchedulingCount||warningSchedulingCount?"hasIssues":"allClear"}`}>
        <div className="v402ActionHead">
          <div><span>Scheduling checks</span><h2>Scheduling Health</h2><p>{criticalSchedulingCount||warningSchedulingCount?"Review the priority items below.":"No action required."}</p></div>
          <div className="v404HealthSummary" aria-label="Scheduling health summary"><span className="critical">Immediate <b>{criticalSchedulingCount}</b></span><span className="warning">Actions <b>{warningSchedulingCount}</b></span><span className="reminder">Planning <b>{reminderSchedulingCount}</b></span></div>
        </div>
        {criticalSchedulingCount===0&&warningSchedulingCount===0&&<div className="v402AllClear"><span aria-hidden="true">✓</span><div><strong>Schedule Healthy</strong><small>No immediate action is required.</small></div></div>}
        {schedulingIssues.length>0&&<div className="v402IssueGroups">{(["critical","warning","reminder"] as const).map(severity=>{const allIssues=schedulingIssues.filter(issue=>issue.severity===severity);if(!allIssues.length)return null;const expanded=expandedSchedulingSections[severity];const issues=expanded?allIssues:[];const heading=severity==="critical"?"Needs Immediate Attention":severity==="warning"?"Actions":"Planning";return <div className={`v402IssueGroup v406IssueSection ${severity} ${expanded?"expanded":"collapsed"}`} key={severity}><button className="v402SeverityHead v406SectionToggle" type="button" aria-expanded={expanded} onClick={()=>setExpandedSchedulingSections({...expandedSchedulingSections,[severity]:!expanded})}><span aria-hidden="true">{severity==="critical"?"●":severity==="warning"?"▲":"●"}</span><strong>{heading}</strong><small>{allIssues.length}</small><b aria-hidden="true">⌄</b></button>{issues.length>0&&<div className="v402IssueList">{issues.map(issue=><article className="v402Issue" key={issue.id}><span className="v402SeverityIcon" aria-label={`${heading} issue`}>{severity==="critical"?"!":severity==="warning"?"!":"i"}</span><div className="v402IssueMain"><strong>{issue.coach}</strong><span>{issue.description}</span><small>{new Date(`${issue.date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}{issue.startTime?` · ${issue.startTime.slice(0,5)}–${issue.finishTime.slice(0,5)}`:" · Not scheduled"}</small></div><div className="v402IssueContext"><strong>{issue.className}</strong></div>{issue.extraShift?<div className="v503ApprovalActions"><button className="btn btnSuccess" type="button" onClick={()=>void approveExtraShift(issue.extraShift!)}>Approve</button><button className="btn btnDanger" type="button" onClick={()=>void rejectExtraShift(issue.extraShift!)}>Decline</button><button className="btn btnSecondary" type="button" onClick={()=>openSchedulingIssue(issue)}>Open</button></div>:<button className="btn btnSecondary" type="button" onClick={()=>openSchedulingIssue(issue)}>Fix Now</button>}</article>)}</div>}</div>})}{(!expandedSchedulingSections.critical||!expandedSchedulingSections.warning||!expandedSchedulingSections.reminder)&&<button className="v402ViewAll" type="button" onClick={()=>setExpandedSchedulingSections({critical:true,warning:true,reminder:true})}>View all scheduling issues</button>}</div>}
      </section>
      <div className="grid grid4 section forecastCards"><StatCard label="Normal staffing cost" value={money(normalCost)} foot="Based on regular classes" icon={<CalendarIcon/>}/><StatCard label="Current forecast" value={money(forecastCost)} foot={`${unassignedScheduleCount} unassigned shifts`} icon={<PoundIcon/>}/><StatCard label="Actual cost so far" value={money(actualScheduleCost)} foot="Confirmed timesheet hours" icon={<CheckIcon/>}/><StatCard label="Forecast variance" value={money(forecastCost-normalCost)} foot={forecastCost>normalCost?"Above normal plan":"At / below normal plan"} icon={<ChartIcon/>}/></div>
      <div className="card section todayCoaching v432TodayCoaching"><div className="sectionHeader"><div><h2>Today&apos;s coaching</h2><p>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</p></div><button className="btn btnSecondary" onClick={()=>setTab("schedule")}>Open Schedule</button></div><div className="v432SessionGrid">{scheduledShifts.filter(s=>s.shift_date===localDateKey()&&s.status!=="cancelled").sort((a,b)=>a.start_time.localeCompare(b.start_time)).map(s=><article className={`v432SessionCard ${s.profile_id?"assigned":"unassigned"}`} key={s.id}><time>{s.start_time.slice(0,5)}<small>{s.finish_time.slice(0,5)}</small></time><div><strong>{s.class_name}</strong><span>{venueName(s.venue_id)}</span></div><b>{profileById(s.profile_id)?.full_name||"Unassigned"}</b></article>)}{!scheduledShifts.some(s=>s.shift_date===localDateKey()&&s.status!=="cancelled")&&<div className="v432OverviewEmpty"><CalendarIcon/><div><strong>No coaching scheduled today</strong><span>Today&apos;s generated sessions will appear here.</span></div></div>}</div></div>
      <div className="grid grid2 section"><div className="card"><div className="sectionHeader"><div><h2>Monthly status</h2><p>Open a coach to review or edit their shifts.</p></div><button className="btn btnSecondary" onClick={()=>setTab("timesheets")}>View all</button></div><div className="mobileDataList">{adminRows.slice(0,8).map(r=><button className="mobileDataCard" key={r.coach.id} onClick={()=>selectCoach(r.coach)}><div><strong>{r.coach.full_name}</strong><span>{r.hours.toFixed(2)} hours</span></div><StatusPill status={r.timesheet?.status}/></button>)}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th>Status</th><th></th></tr></thead><tbody>{adminRows.slice(0,8).map(r=><tr key={r.coach.id}><td><strong>{r.coach.full_name}</strong></td><td className="num">{r.hours.toFixed(2)}</td><td><StatusPill status={r.timesheet?.status}/></td><td><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open</button></td></tr>)}</tbody></table></div></div>
      </div></>;

    return <><PageHead centered title={`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${ownProfile.full_name.split(" ")[0]}`} sub="Your hours and invoice for this month."><MonthNavigation/></PageHead>
      {overdue&&<div className="notice danger">The normal submission deadline for {monthLabel(month)} has passed. Please submit your hours as soon as possible.</div>}
      <div className="grid grid4"><StatCard label="Hours logged" value={totalHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Hourly rate" value={money(ownProfile.hourly_rate)} foot="Set by admin" icon={<PoundIcon/>}/><StatCard label="Estimated invoice" value={money(totalValue)} foot="Based on logged hours" icon={<InvoiceIcon/>}/><StatCard label="Timesheet status" value={(timesheet?.status||"Draft").replace(/^./,x=>x.toUpperCase())} foot={`Due ${business.cutoff_day||1} ${new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1).toLocaleDateString("en-GB",{month:"long"})}`} icon={<CalendarIcon/>}/></div>
      <div className="section">{TimesheetCalendar({compact:true})}</div></>
  }

  function ScheduleView(){
    const dayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const masterTimetableClasses=showArchivedClasses?[...classes,...archivedClasses]:classes;
    const rotaCoachId=initialProfile.id;
    const adminSelected=new Date(`${adminScheduleDate}T12:00:00`);
    const adminWeekStart=new Date(adminSelected);adminWeekStart.setDate(adminSelected.getDate()-((adminSelected.getDay()+6)%7));
    const adminWeekEnd=new Date(adminWeekStart);adminWeekEnd.setDate(adminWeekStart.getDate()+6);
    const adminBounds=adminScheduleRange==="month"?monthRange(month):adminScheduleRange==="week"?{from:localDateKey(adminWeekStart),to:localDateKey(adminWeekEnd)}:{from:adminScheduleDate,to:adminScheduleDate};
    const visibleScheduled=isAdmin&&!adminPersonalRota?scheduleScope.filter(s=>s.shift_date>=adminBounds.from&&s.shift_date<=adminBounds.to):scheduleScope.filter(s=>s.profile_id===rotaCoachId);
    const visibleAdditionalWork=additionalWorkScope.filter(s=>s.shift_date>=adminBounds.from&&s.shift_date<=adminBounds.to);
    const visibleRemovedOccurrences=removedOccurrences.filter(s=>s.shift_date>=adminBounds.from&&s.shift_date<=adminBounds.to);
    const adminRangeDates=(()=>{const dates:string[]=[],cursor=new Date(`${adminBounds.from}T12:00:00`),end=new Date(`${adminBounds.to}T12:00:00`);while(cursor<=end){dates.push(localDateKey(cursor));cursor.setDate(cursor.getDate()+1)}return dates})();
    const moveAdminRange=(delta:number)=>{const next=new Date(adminSelected);if(adminScheduleRange==="month")next.setMonth(next.getMonth()+delta,1);else next.setDate(next.getDate()+delta*(adminScheduleRange==="week"?7:1));setAdminScheduleDate(localDateKey(next));setMonth(monthKey(next))};
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
        if(rotaView==="month")d.setMonth(d.getMonth()+delta,1);
        else d.setDate(d.getDate()+delta*(rotaView==="day"?1:7));
        setRotaDate(localDateKey(d));
        const targetMonth=monthKey(d);if(targetMonth!==month)setMonth(targetMonth);
      };
      return <>{(()=>{
        const today=localDateKey();
        const todayItems=allMine.filter(s=>s.shift_date===today&&s.status!=="cancelled").sort((a,b)=>a.start_time.localeCompare(b.start_time));
        const todayConfirmable=eligibleDailyConfirmations(today,initialProfile.id);
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

          {todayConfirmable.length>0&&<div className="v13DailyConfirmAction"><button className="btn btnPrimary" type="button" onClick={()=>openDailyConfirmation(today,initialProfile.id)}>✓ Confirm Today&apos;s Work</button><span>{todayConfirmable.length} shift{todayConfirmable.length===1?"":"s"} ready for review</span></div>}

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
              <button type="button" className="v302DateArrow" aria-label={rotaView==="day"?"Previous day":rotaView==="week"?"Previous week":"Previous month"} onClick={()=>moveRota(-1)}>←</button>
              <div className="v302DateCentre"><button type="button" onClick={()=>{const picker=rotaDatePickerRef.current as (HTMLInputElement&{showPicker?:()=>void})|null;if(!picker)return;if(picker.showPicker)picker.showPicker();else picker.click()}}><span>{new Date(`${rotaDate}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short",year:"numeric"})}</span></button><input ref={rotaDatePickerRef} aria-label="Choose schedule date" type="date" value={rotaDate} onChange={e=>{setRotaDate(e.target.value);if(rotaView==="month")setMonth(e.target.value.slice(0,7))}}/></div>
              <button type="button" className="v302DateArrow" aria-label={rotaView==="day"?"Next day":rotaView==="week"?"Next week":"Next month"} onClick={()=>moveRota(1)}>→</button>
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

    return <div className="v513ScheduleWorkspace"><PageHead centered title="Schedule & Staffing" sub="Build once, copy forward and only change the exceptions."><MonthNavigation/></PageHead>
      <PageActionBar className="v313MonthActions">
        <div className="v313MonthActionsText"><span>Month actions</span><strong>{monthLabel(month)}</strong></div>
        <div className="v313MonthActionButtons">
          <button className="btn btnPrimary" onClick={generateSchedule}>Load shifts</button>
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
      </PageActionBar>
      <FilterBar className="scheduleToolbar"><div className="row"><button className={`btn ${scheduleView==="calendar"?"btnPrimary":"btnSecondary"}`} onClick={()=>setScheduleView("calendar")}>Calendar</button><button className={`btn ${scheduleView==="agenda"?"btnPrimary":"btnSecondary"}`} onClick={()=>setScheduleView("agenda")}>Agenda</button></div></FilterBar>
      <div className="v503ScheduleRange"><div className="v503RangeTabs">{(["day","week","month"] as const).map(view=><button type="button" className={adminScheduleRange===view?"active":""} key={view} onClick={()=>setAdminScheduleRange(view)}>{view[0].toUpperCase()+view.slice(1)}</button>)}</div><div className="v503RangeNav"><button type="button" aria-label={`Previous ${adminScheduleRange}`} onClick={()=>moveAdminRange(-1)}>←</button><strong>{adminScheduleRange==="month"?monthLabel(month):adminScheduleRange==="day"?new Date(`${adminBounds.from}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):`${new Date(`${adminBounds.from}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – ${new Date(`${adminBounds.to}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`}</strong><button type="button" aria-label={`Next ${adminScheduleRange}`} onClick={()=>moveAdminRange(1)}>→</button></div></div>
      <section className="card v515Configuration"><div><span>Configuration</span><p>One-off shifts, recurring classes and monthly setup.</p></div><div className="v515ConfigurationActions"><button className="btn btnAccent" type="button" onClick={openOneOffShift}><PlusIcon/>Add Shift</button><button className="btn btnSecondary" type="button" onClick={()=>{setMasterTimetableDay(null);setMasterTimetableOpen(true)}}>Master TT</button><div className="v313MoreWrap"><button className="btn btnSecondary" type="button" onClick={()=>setMonthActionsOpen(!monthActionsOpen)}>More <span className="v313Chevron">⌄</span></button>{monthActionsOpen&&<><button className="v313MenuScrim" aria-label="Close month actions" onClick={()=>setMonthActionsOpen(false)}/><div className="v313MoreMenu"><button type="button" onClick={()=>{setMonthActionsOpen(false);void generateSchedule()}}>Load shifts</button><button type="button" onClick={()=>{setMonthActionsOpen(false);void clonePreviousScheduleMonth()}}>Duplicate previous month</button><button type="button" onClick={()=>{setMonthActionsOpen(false);void copyScheduleWeek()}}>Copy a week</button><div className="v313MenuDivider"/><button type="button" className="danger" onClick={()=>{setMonthActionsOpen(false);void clearScheduleMonth()}}>Clear this month</button></div></>}</div></div></section>
      <div className="grid grid4 scheduleSummary"><StatCard label="Normal monthly cost" value={money(normalCost)} foot="Regular timetable" icon={<PoundIcon/>}/><StatCard label="Current forecast" value={money(forecastCost)} foot={`${plannedSchedule.length} scheduled staffing shifts`} icon={<CalendarIcon/>}/><StatCard label="Actual cost so far" value={money(actualScheduleCost)} foot={`${money(actualScheduleCost-forecastCost)} vs forecast`} icon={<CheckIcon/>}/><StatCard label="Unassigned shifts" value={String(unassignedScheduleCount)} foot={unassignedScheduleCount?"Needs a coach":"Fully staffed"} icon={<UsersIcon/>}/></div>
      {pendingAdditionalCount>0&&<div className="v311ApprovalBanner"><div className="v311ApprovalIcon"><ClockIcon/></div><div><strong>{pendingAdditionalCount} additional work {pendingAdditionalCount===1?"request":"requests"} awaiting approval</strong><span>These were recorded by staff outside their rota. Review them below in the schedule.</span></div><span className="v311ApprovalCount">{pendingAdditionalCount}</span></div>}
      <div className="card v510MasterLauncher section"><div className="v510MasterLauncherIcon"><CalendarIcon/></div><div><h2>Weekly Master Timetable</h2><p>Configure recurring weekly classes.</p></div><button className="btn btnSecondary" type="button" onClick={()=>{setMasterTimetableDay(null);setMasterTimetableOpen(true)}}>Master TT</button></div>
      <div className="grid scheduleAdminGrid section"><div className="card v436MasterTimetableCard"><div className="sectionHeader"><div><h2>Weekly master timetable</h2><p>Sunday–Saturday. Add as many different classes as you need on the same day or at the same time.</p></div><div className="row"><label className="v12ArchiveToggle"><input type="checkbox" checked={showArchivedClasses} onChange={event=>setShowArchivedClasses(event.target.checked)}/> Show Archived Classes</label><button className="btn btnSecondary" onClick={()=>openNewClass()}><PlusIcon/>Create Class</button></div></div><div className="masterTimetable">{[1,2,3,4,5,6,0].map(day=>{const dayClasses=masterTimetableClasses.filter(c=>(!scheduleFilter||c.venue_id===scheduleFilter)&&c.weekday===day).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.name.localeCompare(b.name)),expanded=!!masterDaysExpanded[day],dayHours=dayClasses.reduce((total,c)=>total+classTemplateHours(c),0);return <div className={`masterDay ${expanded?"expanded":"collapsed"}`} key={day}><div className="masterDayHead"><button className="v436MasterDayToggle" type="button" aria-expanded={expanded} onClick={()=>setMasterDaysExpanded(current=>({...current,[day]:!current[day]}))}><strong>{dayNames[day]}</strong><span>{dayClasses.length} {dayClasses.length===1?"class":"classes"} · {dayHours.toFixed(2)}h</span><b aria-hidden="true">⌄</b></button><button className="btn btnSecondary v501DesktopDayAdd" type="button" onClick={()=>openNewClass(day)}><PlusIcon/>Create Class</button></div><div className="masterDayClasses"><button className="btn btnPrimary v501MobileDayAdd" type="button" onClick={()=>openNewClass(day)}><PlusIcon/>Create Class</button>{dayClasses.map(c=>{const slots=classSlots.filter(x=>x.class_id===c.id).sort((a,b)=>a.slot_number-b.slot_number),fullyAssigned=slots.length>0&&slots.every(x=>Boolean(x.default_profile_id));return <div style={{"--org-colour":c.session_colour||"#6D3A91"} as React.CSSProperties} className={`masterClassRow masterClassClickable ${venueColourClass(c.venue_id)} ${fullyAssigned?"assigned":"unassigned"} ${c.active?"":"v12ArchivedClass"}`} key={c.id} role="button" tabIndex={0} onClick={()=>openEditClass(c)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openEditClass(c)}}}><div className="masterTime">{c.start_time.slice(0,5)}–{c.finish_time.slice(0,5)}</div><div className="masterClassInfo"><strong>{c.name}{!c.active&&<span className="v12ArchivedBadge">Archived</span>}</strong><span className="v504DesktopClassContext">{c.start_time.slice(0,5)}–{c.finish_time.slice(0,5)}</span><small>{slots.map(x=>profileById(x.default_profile_id)?.full_name||"Unassigned").join(" · ")}</small><em>Click to edit</em></div><div className="masterClassActions"><button className="btn btnPrimary" type="button" onClick={e=>{e.stopPropagation();openEditClass(c)}}>Edit</button><ClassMoreActions classItem={c}/></div></div>})}{!dayClasses.length&&<div className="masterEmpty">No regular classes</div>}</div></div>})}</div></div>
      <div className="card v436StaffingCard"><div className="sectionHeader"><div><h2>{monthLabel(month)} staffing</h2><p>Drag one staffing card onto another to swap coach assignments. Use Agenda for detailed editing.</p></div><div className="scheduleLegend"><span>Forecast {money(forecastCost)}</span><span>Confirmed {money(confirmedScheduleCost)}</span></div></div>
      <div className="v514MobileStaffingControls"><div className="v514StickyControls"><div className="v503RangeTabs">{(["day","week","month"] as const).map(view=><button type="button" className={adminScheduleRange===view?"active":""} key={view} onClick={()=>setAdminScheduleRange(view)}>{view[0].toUpperCase()+view.slice(1)}</button>)}</div><div className="v503RangeNav"><button type="button" aria-label={`Previous ${adminScheduleRange}`} onClick={()=>moveAdminRange(-1)}>←</button><strong>{adminScheduleRange==="month"?monthLabel(month):adminScheduleRange==="day"?new Date(`${adminBounds.from}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):`${new Date(`${adminBounds.from}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short"})} – ${new Date(`${adminBounds.to}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`}</strong><button type="button" aria-label={`Next ${adminScheduleRange}`} onClick={()=>moveAdminRange(1)}>→</button></div></div><div className="v515FilterRow"><div className="v514ViewToggle"><button className={`btn ${scheduleView==="calendar"?"btnPrimary":"btnSecondary"}`} onClick={()=>setScheduleView("calendar")}>Calendar</button><button className={`btn ${scheduleView==="agenda"?"btnPrimary":"btnSecondary"}`} onClick={()=>setScheduleView("agenda")}>Agenda</button></div></div><div className="v514StaffingActions"><button className="btn btnAccent" type="button" onClick={openOneOffShift}><PlusIcon/>Shift</button><button className="btn btnSecondary" type="button" onClick={()=>{setMasterTimetableDay(null);setMasterTimetableOpen(true)}}>Master TT</button><div className="v313MoreWrap"><button className="btn btnSecondary" type="button" onClick={()=>setMonthActionsOpen(!monthActionsOpen)}>More <span className="v313Chevron">⌄</span></button>{monthActionsOpen&&<><button className="v313MenuScrim" aria-label="Close month actions" onClick={()=>setMonthActionsOpen(false)}/><div className="v313MoreMenu"><button type="button" onClick={()=>{setMonthActionsOpen(false);void generateSchedule()}}>Load shifts</button><button type="button" onClick={()=>{setMonthActionsOpen(false);void clonePreviousScheduleMonth()}}>Duplicate previous month</button><button type="button" onClick={()=>{setMonthActionsOpen(false);void copyScheduleWeek()}}>Copy a week</button><div className="v313MenuDivider"/><button type="button" className="danger" onClick={()=>{setMonthActionsOpen(false);void clearScheduleMonth()}}>Clear this month</button></div></>}</div></div></div>
      {scheduleView==="calendar"?<div className={`staffingBoard v503Range-${adminScheduleRange}`}>{(()=>{
        return adminRangeDates.map(date=>{
          const items=visibleScheduled.filter(s=>s.shift_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.class_name.localeCompare(b.class_name));
          const extras=visibleAdditionalWork.filter(s=>s.shift_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time));
          const removed=visibleRemovedOccurrences.filter(r=>r.shift_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time));
          const totalItems=items.length+extras.length;
          return <div className={`staffingBoardDay ${totalItems||removed.length?"hasShifts":"emptyDay"}`} key={date}>
            <div className="staffingBoardDate"><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</strong><span>{totalItems?`${totalItems} ${totalItems===1?"item":"items"}`:removed.length?`${removed.length} removed`:"No coaching"}</span></div>
            <div className="staffingBoardShifts">{items.map(s=><div className={`staffingCalendarShift ${s.status} ${venueColourClass(s.venue_id)} ${highlightedScheduleShiftId===s.id?"v402HighlightedShift":""}`} key={s.id} draggable={s.status!=="cancelled"} onClick={()=>openAdminScheduleShift(s)} onDragStart={e=>{e.stopPropagation();setDragShiftId(s.id)}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragShiftId)void swapScheduledAssignments(dragShiftId,s.id);setDragShiftId(null)}}><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)} · {s.class_name}</strong><span>{profileById(s.profile_id)?.full_name||"Unassigned"}</span><small>{venueName(s.venue_id)} · Tap to manage</small>{s.profile_id&&coachAvailabilityState(s.profile_id,s.shift_date,s.start_time,s.finish_time).state!=="available"&&<span className={`v340ConflictBadge ${coachAvailabilityState(s.profile_id,s.shift_date,s.start_time,s.finish_time).state}`}>{coachAvailabilityState(s.profile_id,s.shift_date,s.start_time,s.finish_time).label}</span>}</div>)}{extras.map(s=><div className={`staffingCalendarShift ${s.approval_status==="pending"?"v311PendingExtra":"v313ApprovedExtra"}`} key={`extra-${s.id}`} onClick={()=>setShiftModal(s)}><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)} · {s.session_location||"Additional work"}</strong><span>{profileById(s.coach_id)?.full_name||"Staff member"}</span><small>{venueName(s.venue_id)} · Additional shift · {s.approval_status==="pending"?"Approval required":"Approved"}</small></div>)}{removed.map(r=><div className="staffingCalendarShift v314RemovedOccurrence" key={`removed-${r.class_id}-${r.shift_date}`}><strong>{r.start_time.slice(0,5)}–{r.finish_time.slice(0,5)} · {r.class_name}</strong><span>{venueName(r.venue_id)} · Removed from this date</span><button className="v314RestoreButton" type="button" onClick={e=>{e.stopPropagation();void restoreRemovedOccurrence(r)}}>Restore</button></div>)}</div>
          </div>
        });
      })()}</div>:<div className="scheduleAgenda v311Agenda">{Array.from(new Set([...Object.keys(grouped),...visibleAdditionalWork.map(s=>s.shift_date),...visibleRemovedOccurrences.map(r=>r.shift_date)])).sort().map(date=>{const items=(grouped[date]||[]) as ScheduledShift[];const extras=visibleAdditionalWork.filter(s=>s.shift_date===date);const removed=visibleRemovedOccurrences.filter(r=>r.shift_date===date);return <div className="scheduleDay" key={date}><div className="scheduleDate"><strong>{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}</strong><span>{items.length+extras.length} active{removed.length?` · ${removed.length} removed`:""}</span></div>{items.map(s=>{const allowed=staffOptionsForVenue(s.venue_id);return <div className={`scheduleShift v311ScheduleRow ${s.status} ${venueColourClass(s.venue_id)} ${highlightedScheduleShiftId===s.id?"v402HighlightedShift":""}`} key={s.id} onClick={()=>openAdminScheduleShift(s)}><div className="scheduleShiftMain"><div className="scheduleTime">{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</div><div><strong>{s.class_name}</strong><span>{venueName(s.venue_id)} · {scheduleHours(s).toFixed(2)}h</span></div></div><div className="v311RowCoach"><span>Coach</span><strong>{profileById(s.profile_id)?.full_name||"Unassigned"}</strong>{s.profile_id&&<small className={`v341CoachState ${coachAvailabilityState(s.profile_id,s.shift_date,s.start_time,s.finish_time).state}`}>{coachAvailabilityState(s.profile_id,s.shift_date,s.start_time,s.finish_time).label}</small>}</div><div className="v311RowStatus"><span className={`scheduleStatus ${s.status}`}>{s.adjustment_status==="pending"?"Approval pending":s.status}</span><button className="btn btnSecondary" type="button" onClick={e=>{e.stopPropagation();openAdminScheduleShift(s)}}>Manage</button></div></div>})}{extras.map(s=><div className={`scheduleShift v311ScheduleRow v311ExtraRow ${s.approval_status==="approved"?"v313ApprovedExtraRow":""}`} key={`extra-${s.id}`} onClick={()=>setShiftModal(s)}><div className="scheduleShiftMain"><div className="scheduleTime">{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</div><div><strong>{s.session_location||"Additional work"}</strong><span>{venueName(s.venue_id)} · {shiftHours(s).toFixed(2)}h</span></div></div><div className="v311RowCoach"><span>{s.approval_status==="pending"?"Submitted by":"Coach"}</span><strong>{profileById(s.coach_id)?.full_name||"Staff member"}</strong></div><div className="v311RowStatus"><span className={`scheduleStatus ${s.approval_status==="pending"?"v311PendingBadge":"v313ApprovedBadge"}`}>{s.approval_status==="pending"?"Approval required":"Additional shift · Approved"}</span><button className={`btn ${s.approval_status==="pending"?"btnAccent":"btnSecondary"}`} type="button" onClick={e=>{e.stopPropagation();setShiftModal(s)}}>{s.approval_status==="pending"?"Review":"View"}</button></div></div>)}{removed.map(r=><div className="scheduleShift v311ScheduleRow v314RemovedAgenda" key={`removed-${r.class_id}-${r.shift_date}`}><div className="scheduleShiftMain"><div className="scheduleTime">{r.start_time.slice(0,5)}–{r.finish_time.slice(0,5)}</div><div><strong>{r.class_name}</strong><span>{venueName(r.venue_id)} · Removed from this date</span></div></div><div className="v311RowCoach"><span>Status</span><strong>Removed occurrence</strong></div><div className="v311RowStatus"><span className="scheduleStatus v314RemovedBadge">Removed</span><button className="btn btnSecondary" type="button" onClick={()=>restoreRemovedOccurrence(r)}>Restore</button></div></div>)}</div>})}{!visibleScheduled.length&&!visibleAdditionalWork.length&&!visibleRemovedOccurrences.length&&<div className="empty">Generate {monthLabel(month)} to create the staffing rota from your regular classes.</div>}</div>}</div></div></div>;
  }

  function TimesheetView(){
    if(isAdmin&&!viewingOther)return <><PageHead centered title="Timesheets" sub="Open a coach to review, add, edit or delete their shifts."><MonthNavigation/></PageHead><div className="card"><div className="sectionHeader"><div><h2>{monthLabel(month)}</h2><p>{submittedCount} of {adminRows.length} coaches submitted.</p></div></div><div className="mobileDataList">{adminRows.map(r=><div className="mobileAdminCard" key={r.coach.id}><div className="mobileAdminHead"><div><strong>{r.coach.full_name}</strong><span>{r.coach.email}</span></div><StatusPill status={r.timesheet?.status}/></div><div className="mobileAdminStats"><span><small>Hours</small><strong>{r.hours.toFixed(2)}</strong></span><span><small>Value</small><strong>{money(r.value)}</strong></span></div><div className="mobileAdminActions"><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open / edit</button>{(!r.timesheet||r.timesheet.status==="draft")&&r.hours>0&&<button className="btn btnPrimary" onClick={()=>adminSubmitMonth(r.coach.id)}>Submit on behalf</button>}{r.timesheet?.status==="submitted"&&<><button className="btn btnSecondary" onClick={()=>reopen(r)}>Reopen</button><button className="btn btnPrimary" onClick={()=>markPaid(r)}>Mark paid</button></>}{r.timesheet?.status==="paid"&&<button className="btn btnDanger" onClick={()=>reopen(r)}>Reopen paid month</button>}</div></div>)}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th className="num">Value</th><th>Status</th><th>Actions</th></tr></thead><tbody>{adminRows.map(r=><tr key={r.coach.id}><td><strong>{r.coach.full_name}</strong><div className="muted" style={{fontSize:11}}>{r.coach.email}</div></td><td className="num">{r.hours.toFixed(2)}</td><td className="num">{money(r.value)}</td><td><StatusPill status={r.timesheet?.status}/></td><td><div className="row"><button className="btn btnSecondary" onClick={()=>selectCoach(r.coach)}>Open / edit</button>{(!r.timesheet||r.timesheet.status==="draft")&&r.hours>0&&<button className="btn btnPrimary" onClick={()=>adminSubmitMonth(r.coach.id)}>Submit on behalf</button>}{r.timesheet?.status==="submitted"&&<><button className="btn btnSecondary" onClick={()=>reopen(r)}>Reopen</button><button className="btn btnPrimary" onClick={()=>markPaid(r)}>Mark paid</button></>}{r.timesheet?.status==="paid"&&<button className="btn btnDanger" onClick={()=>reopen(r)}>Reopen paid month</button>}</div></td></tr>)}</tbody></table></div></div></>;

    return <><PageHead centered title={viewingOther?`${activeCoach.full_name}'s timesheet`:"My Timesheet"} sub={viewingOther?"Admin view — reopen submitted months before changing them.":"Confirmed rota work and approved additional work appear here automatically. Submit the month when everything is correct."}><div className="v436TimesheetHeadControls"><MonthNavigation/>{viewingOther&&<button className="btn btnSecondary" onClick={backToAdmin}>← All coaches</button>}</div></PageHead>{TimesheetCalendar({})}</>
  }

  function TimesheetCalendar({compact=false}:{compact?:boolean}){
    const[y,m]=month.split("-").map(Number),last=new Date(y,m,0).getDate(),start=(new Date(y,m-1,1).getDay()+6)%7;
    const canEdit=isAdmin && timesheet?.status!=="submitted"&&timesheet?.status!=="paid";
    const defaultVenue=(isAdmin?adminVenues()[0]:profileVenues(activeCoach.id)[0])?.id||null;
    const newShift=(date=`${month}-${String(Math.min(new Date().getDate(),last)).padStart(2,"0")}`)=>setShiftModal({coach_id:activeCoach.id,shift_date:date,start_time:"16:30",finish_time:"20:30",break_minutes:0,venue_id:defaultVenue,session_location:"",notes:""});
    const sorted=shifts.filter(s=>s.approval_status!=="rejected").sort((a,b)=>`${a.shift_date}${a.start_time}`.localeCompare(`${b.shift_date}${b.start_time}`));
    return <div className="card timesheetCard"><div className="calendarToolbar"><div><strong>{monthLabel(month)}</strong><div className="muted" style={{fontSize:11,marginTop:3}}>{viewingOther?`Viewing ${activeCoach.full_name}`:locked?"Submitted months are locked until unsubmitted.":"Scheduled classes flow in when confirmed. Use Add extra shift only for unscheduled work."}{timesheet?.submitted_by&&timesheet.submitted_by!==activeCoach.id?" · Submitted by an administrator":""}</div></div><div className="row">{canEdit&&<><button className="btn btnAccent mobilePrimaryAdd" onClick={()=>newShift()}><PlusIcon/>Add extra shift</button><button className="btn btnSecondary" onClick={()=>setTemplateOpen(true)}>Regular shifts</button>{templates.length>0&&<button className="btn btnSecondary" onClick={fillMonthFromTemplates}>Fill month</button>}<button className="btn btnSecondary" onClick={copyPrevious}>Copy previous month</button></>}</div></div>
      <div className="mobileShiftList">
        {sorted.length===0?<div className="mobileEmpty"><ClockIcon/><strong>No shifts added yet</strong><span>No unscheduled work added for {monthLabel(month)}.</span>{canEdit&&<button className="btn btnAccent" onClick={()=>newShift()}><PlusIcon/>Add extra shift</button>}</div>:sorted.map(s=><button className="mobileShiftCard" key={s.id} onClick={()=>canEdit&&setShiftModal(s)}><div className="mobileShiftDate"><strong>{new Date(`${s.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric"})}</strong><span>{venueName(s.venue_id)}</span></div><div className="mobileShiftMain"><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong><span>{s.session_location||"Coaching"}</span></div><div className="mobileShiftHours">{s.approval_status==="pending"?"Pending":`${shiftHours(s).toFixed(2)}h`}</div></button>)}
      </div>
      <div className="calendarScroll desktopCalendar"><div className="calendar">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div className="dow" key={d}>{d}</div>)}{Array.from({length:start},(_,i)=><div className="day dayBlank" key={`b${i}`}/>) }
        {Array.from({length:last},(_,i)=>{const d=i+1,date=`${month}-${String(d).padStart(2,"0")}`,items=shifts.filter(s=>s.shift_date===date&&s.approval_status!=="rejected");return <div className="day" key={date}><div className="dayNum">{d}</div>{canEdit&&<button className="dayAdd" onClick={()=>newShift(date)}>+</button>}{items.map(s=><div className="shiftChip" key={s.id} onClick={()=>canEdit&&setShiftModal(s)}><strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong><br/><span className="venueDot"/>{venueName(s.venue_id)}<br/>{s.session_location||"Coaching"}<br/><span className="muted">{shiftHours(s).toFixed(2)}h</span></div>)}</div>})}</div></div>
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
      <div className="card"><div className="mobileDataList">{allInvoices.map((inv:any)=>{const coach=isAdmin?({...staff.find(s=>s.id===inv.coach_id),...(inv.profiles||{})} as Profile):ownProfile;return <div className="mobileAdminCard" key={inv.id}><div className="mobileAdminHead"><div><strong>{inv.invoice_number}</strong><span>{isAdmin?inv.profiles?.full_name||coach.full_name:""}</span></div><StatusPill status={inv.status==="awaiting_payment"?"submitted":inv.status}/></div><div className="mobileAdminStats"><span><small>Hours</small><strong>{Number(inv.hours).toFixed(2)}</strong></span><span><small>Amount</small><strong>{money(inv.total_amount)}</strong></span></div><div className="mobileAdminActions"><button className="btn btnSecondary" onClick={()=>downloadPDF(inv,coach)}>Download PDF</button>{isAdmin&&inv.status==="awaiting_payment"&&<button className="btn btnPrimary" onClick={()=>markInvoicePaid(inv)}>Mark paid</button>}</div></div>})}{!allInvoices.length&&<div className="empty">No invoices yet.</div>}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Invoice</th>{isAdmin&&<th>Coach</th>}<th>Date</th><th className="num">Hours</th><th className="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>{allInvoices.map((inv:any)=>{const coach=isAdmin?({...staff.find(s=>s.id===inv.coach_id),...(inv.profiles||{})} as Profile):ownProfile;return <tr key={inv.id}><td><strong>{inv.invoice_number}</strong></td>{isAdmin&&<td>{inv.profiles?.full_name||coach.full_name}</td>}<td>{dateText(inv.invoice_date)}</td><td className="num">{Number(inv.hours).toFixed(2)}</td><td className="num"><strong>{money(inv.total_amount)}</strong></td><td><StatusPill status={inv.status==="awaiting_payment"?"submitted":inv.status}/></td><td><div className="row"><button className="btn btnSecondary" onClick={()=>downloadPDF(inv,coach)}>Download PDF</button>{isAdmin&&inv.status==="awaiting_payment"&&<button className="btn btnPrimary" onClick={()=>markInvoicePaid(inv)}>Mark paid</button>}</div></td></tr>})}{!allInvoices.length&&<tr><td colSpan={isAdmin?7:6} className="empty">No invoices yet.</td></tr>}</tbody></table></div></div>
    </>
  }

  function LeaveView(){
    const today=new Date().toISOString().slice(0,10);
    const typeLabel=(t:string)=>({holiday:"Leave",sickness:"Sickness",appointment:"Appointment",compassionate:"Compassionate leave",unavailable:"Unavailable",other:"Other"} as Record<string,string>)[t]||t;
    const statusLabel=(s:string)=>s==="approved"?"Approved":s==="declined"?"Declined":s==="cancelled"?"Cancelled":"Pending";
    const displayDate=(d:string)=>new Date(`${d}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
    const person=(id:string)=>profileById(id)?.full_name||"Staff member";
    const duration=(r:TimeAwayRequest)=>r.all_day
      ? `${displayDate(r.start_date)}${r.end_date!==r.start_date?` – ${displayDate(r.end_date)}`:""} · Full day`
      : `${displayDate(r.start_date)} · ${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)}`;

    if(isAdmin){
      const leaveScope=timeAwayRequests.filter(r=>{
        if(!scheduleFilter)return true;
        const coachVenueIds=staffVenueMap[r.profile_id]||[];
        return coachVenueIds.includes(scheduleFilter);
      });
      const pending=leaveScope.filter(r=>r.status==="pending");
      const upcomingApproved=leaveScope.filter(r=>r.status==="approved"&&r.end_date>=today);
      const monthStart=`${month}-01`;
      const monthEnd=`${month}-${String(new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()).padStart(2,"0")}`;
      const calendarRequests=leaveScope.filter(r=>r.start_date<=monthEnd&&r.end_date>=monthStart&&r.status!=="cancelled"&&r.status!=="declined").sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.created_at.localeCompare(b.created_at));
      return <><PageHead centered title="Leave Management" sub="Review and manage staff leave and unavailable periods."><MonthNavigation/></PageHead>
        <PageActionBar className="v401LeaveActionBar"><div><strong>Create time away</strong><span>Add leave or an unavailable period for any member of staff.</span></div><button className="btn btnPrimary" onClick={()=>openNewTimeAway()}>+ New Time Away</button></PageActionBar>
        <div className="grid grid3 v33Summary"><StatCard label="Awaiting review" value={String(pending.length)} foot="Needs an admin decision" icon={<ClockIcon/>}/><StatCard label="Approved upcoming" value={String(upcomingApproved.length)} foot="Leave & unavailable periods" icon={<CheckIcon/>}/><StatCard label="Unavailable" value={String(leaveScope.filter(r=>r.status==="approved"&&r.request_type==="unavailable"&&r.end_date>=today).length)} foot="Upcoming approved" icon={<CalendarIcon/>}/></div>

        {pending.length>0&&<section className="card section v33ApprovalSection"><div className="sectionHeader"><div><h3>Awaiting approval</h3><p>Requests submitted by staff.</p></div><span className="v33CountBadge">{pending.length}</span></div><div className="v33RequestList">
          {pending.map(r=><article className={`v33RequestCard pending v331Type-${r.request_type}`} key={r.id}><div className="v33RequestAvatar">{initials(person(r.profile_id))}</div><div className="v33RequestMain"><div className="v33RequestTitle"><strong>{person(r.profile_id)}</strong><span>{typeLabel(r.request_type)}</span></div><h4>{duration(r)}</h4>{r.notes&&<p>{r.notes}</p>}</div><div className="v33RequestActions"><button className="btn btnSecondary" onClick={()=>openEditTimeAway(r)}>Edit</button><button className="btn btnSecondary" onClick={()=>reviewLeave(r.id,"declined")}>Decline</button><button className="btn btnPrimary" onClick={()=>reviewLeave(r.id,"approved")}>Approve</button></div></article>)}
        </div></section>}

        <section className="card section v341LeaveCalendar v401LeaveCalendar"><div className="sectionHeader"><div><h3>Monthly leave calendar</h3><p>{monthLabel(month)} · approved and pending time away.</p></div></div><div className="v341CalendarGrid v401DesktopLeaveCalendar">{Array.from({length:new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}`).map((date:string)=>{const items=leaveScope.filter(r=>date>=r.start_date&&date<=r.end_date&&r.status!=="cancelled"&&r.status!=="declined");return <div className={`v341CalendarDay ${items.length?"hasItems":""}`} key={date}><strong>{new Date(`${date}T12:00:00`).getDate()}</strong><span>{new Date(`${date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short"})}</span>{items.slice(0,3).map(r=><button key={r.id} className={`v341CalendarPill ${r.status} v331Type-${r.request_type}`} onClick={()=>openEditTimeAway(r)}><b>{profileById(r.profile_id)?.full_name?.split(" ")[0]||"Staff"}</b><small>{r.request_type==="unavailable"?"Unavailable":"Leave"}{!r.all_day?` ${r.start_time?.slice(0,5)}–${r.end_time?.slice(0,5)}`:""}</small></button>)}{items.length>3&&<em>+{items.length-3} more</em>}</div>})}</div><div className="v401MobileLeaveAgenda">{calendarRequests.map(r=><button className={`v401AgendaItem v331Type-${r.request_type}`} key={r.id} onClick={()=>openEditTimeAway(r)}><span className="v401AgendaDate"><strong>{new Date(`${r.start_date}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric"})}</strong><small>{new Date(`${r.start_date}T12:00:00`).toLocaleDateString("en-GB",{month:"short"})}</small></span><span className="v401AgendaDetails"><strong>{person(r.profile_id)}</strong><small>{typeLabel(r.request_type)} · {duration(r)}</small>{r.notes&&<em>{r.notes}</em>}</span><span className={`v33Status ${r.status}`}>{statusLabel(r.status)}</span></button>)}{!calendarRequests.length&&<div className="v401AgendaEmpty"><CalendarIcon/><strong>No time away this month</strong><span>Approved and pending requests will appear here.</span></div>}</div></section>
        <section className="card section"><div className="sectionHeader"><div><h3>Leave & availability history</h3><p>Approved, declined, pending and cancelled requests.</p></div></div><div className="v33History">
          {leaveScope.map(r=><div className={`v33HistoryRow v331HistoryRow v331Type-${r.request_type}`} key={r.id}><div><strong>{person(r.profile_id)}</strong><span>{typeLabel(r.request_type)}</span></div><div><strong>{duration(r)}</strong>{r.notes&&<span>{r.notes}</span>}</div><div className="v331AdminHistoryActions"><span className={`v33Status ${r.status}`}>{statusLabel(r.status)}</span><button className="v3TextButton" onClick={()=>openEditTimeAway(r)}>Edit</button><button className="v3TextButton danger" onClick={()=>deleteTimeAway(r)}>Delete</button></div></div>)}
          {!timeAwayRequests.length&&<div className="empty">No leave or availability requests yet.</div>}
        </div></section>
      </>
    }

    const mine=timeAwayRequests.filter(r=>r.profile_id===initialProfile.id);
    const upcoming=mine.filter(r=>r.status==="approved"&&r.end_date>=today);
    return <><PageHead title="Leave & Availability" sub="Request time away or tell us when you cannot coach."><button className="btn btnPrimary" onClick={()=>openNewTimeAway()}>Request time away</button></PageHead>
      <div className="grid grid3 v33Summary"><StatCard label="Pending" value={String(mine.filter(r=>r.status==="pending").length)} foot="Awaiting admin review" icon={<ClockIcon/>}/><StatCard label="Upcoming approved" value={String(upcoming.length)} foot="Leave & unavailable periods" icon={<CheckIcon/>}/><StatCard label="Unavailable" value={String(upcoming.filter(r=>r.request_type==="unavailable").length)} foot="Upcoming approved" icon={<CalendarIcon/>}/></div>

      <div className="grid grid2 section v33CoachCards"><button className="card v33ActionCard leave" onClick={()=>openNewTimeAway("holiday")}><div className="v33ActionIcon"><CalendarIcon/></div><div><span>Time away</span><strong>Request leave</strong><p>Leave, sickness, appointments, compassionate leave and other time away.</p></div><b>＋</b></button><button className="card v33ActionCard availability" onClick={()=>openNewTimeAway("unavailable")}><div className="v33ActionIcon"><ClockIcon/></div><div><span>Availability</span><strong>Tell us when you're unavailable</strong><p>Choose a full day or exact hours you cannot coach.</p></div><b>＋</b></button></div>

      <section className="card section"><div className="sectionHeader"><div><h3>My requests</h3><p>Your leave and availability history.</p></div></div><div className="v33History">
        {mine.map(r=><div className={`v33HistoryRow v33MyHistory v331Type-${r.request_type}`} key={r.id}><div><strong>{typeLabel(r.request_type)}</strong><span>{duration(r)}</span></div><div>{r.notes&&<span>{r.notes}</span>}</div><div className="v33MyStatus"><span className={`v33Status ${r.status}`}>{statusLabel(r.status)}</span>{r.status==="pending"&&<button className="v3TextButton danger" onClick={()=>cancelOwnLeave(r.id)}>Cancel</button>}</div></div>)}
        {!mine.length&&<div className="empty">You haven't submitted any time-away requests yet.</div>}
      </div></section>
    </>
  }

  function TimeAwayModal(){
    const editing=Boolean(timeAwayModal?.id);
    const adminEditing=isAdmin&&editing;
    return <div className="modalBackdrop"><div className="modal v33LeaveModal"><div className="modalHead"><div><h2>{editing?"Edit time away":"Request time away"}</h2><p className="muted" style={{fontSize:11,margin:"4px 0 0"}}>{adminEditing?"Changes apply immediately to this request.":isAdmin?"Create time away for any staff member.":"This will be sent to administrators for approval."}</p></div><button className="iconButton" onClick={()=>setTimeAwayModal(undefined)}>×</button></div><div className="modalBody">
      {isAdmin&&<div className="grid grid2"><div className="field"><label>Staff member</label><select value={adminTimeAwayProfileId} onChange={e=>setAdminTimeAwayProfileId(e.target.value)}><option value="">Choose staff member</option>{staff.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div><div className="field"><label>Status</label><select value={adminTimeAwayStatus} onChange={e=>setAdminTimeAwayStatus(e.target.value as any)}><option value="approved">Approved</option><option value="pending">Pending</option></select></div></div>}
      <div className="field"><label>Type</label><select value={timeAwayDraft.request_type} onChange={e=>setTimeAwayDraft({...timeAwayDraft,request_type:e.target.value as any})}><option value="holiday">Leave</option><option value="sickness">Sickness</option><option value="appointment">Appointment</option><option value="compassionate">Compassionate leave</option><option value="unavailable">Unavailable</option><option value="other">Other</option></select></div>

      <div className="field"><label>Duration</label><div className="v33Segmented v331Duration"><button type="button" className={timeAwayDraft.all_day?"active":""} onClick={()=>setTimeAwayDraft({...timeAwayDraft,all_day:true,start_time:"",end_time:""})}>Full day</button><button type="button" className={!timeAwayDraft.all_day?"active":""} onClick={()=>setTimeAwayDraft({...timeAwayDraft,all_day:false,end_date:timeAwayDraft.start_date})}>Specific hours</button></div></div>

      {timeAwayDraft.all_day?<div className="grid grid2"><div className="field"><label>Start date</label><input type="date" value={timeAwayDraft.start_date} onChange={e=>setTimeAwayDraft({...timeAwayDraft,start_date:e.target.value,end_date:timeAwayDraft.end_date||e.target.value})}/></div><div className="field"><label>End date</label><input type="date" min={timeAwayDraft.start_date||undefined} value={timeAwayDraft.end_date} onChange={e=>setTimeAwayDraft({...timeAwayDraft,end_date:e.target.value})}/></div></div>:<>
        <div className="field"><label>Date</label><input type="date" value={timeAwayDraft.start_date} onChange={e=>setTimeAwayDraft({...timeAwayDraft,start_date:e.target.value,end_date:e.target.value})}/></div>
        <div className="grid grid2"><div className="field"><label>From</label><input type="time" value={timeAwayDraft.start_time} onChange={e=>setTimeAwayDraft({...timeAwayDraft,start_time:e.target.value})}/></div><div className="field"><label>Until</label><input type="time" value={timeAwayDraft.end_time} onChange={e=>setTimeAwayDraft({...timeAwayDraft,end_time:e.target.value})}/></div></div>
      </>}

      <div className="field"><label>Notes <span className="muted">(optional)</span></label><textarea value={timeAwayDraft.notes} onChange={e=>setTimeAwayDraft({...timeAwayDraft,notes:e.target.value})} placeholder="Anything the admin team should know?"/></div>
    </div><div className="modalFoot"><button className="btn btnSecondary" onClick={()=>setTimeAwayModal(undefined)}>Cancel</button><button className="btn btnPrimary" disabled={leaveSaving} onClick={saveTimeAway}>{leaveSaving?"Saving…":editing?"Save changes":"Submit request"}</button></div></div></div>
  }

  function StaffAvailabilityView(){
    const now=new Date(),todayKey=localDateKey(now);
    const updatedTime=now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    const currentTime=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const tomorrowDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,12),tomorrowKey=localDateKey(tomorrowDate);
    const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7),12);
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const weekStart=localDateKey(monday),weekEnd=localDateKey(sunday);
    const range=availabilityPeriod==="today"?{from:todayKey,to:todayKey,label:"Today"}:availabilityPeriod==="tomorrow"?{from:tomorrowKey,to:tomorrowKey,label:"Tomorrow"}:{from:weekStart,to:weekEnd,label:"This week"};
    const scheduleMap=new Map<string,ScheduledShift>();
    [...scheduledShifts,...futureScheduledShifts].forEach(item=>{if(item.id&&!scheduleMap.has(item.id))scheduleMap.set(item.id,item)});
    const scheduleData=[...scheduleMap.values()].filter(item=>item.status!=="cancelled");
    const hoursBetween=(profileId:string,from:string,to:string)=>scheduleData.filter(item=>item.profile_id===profileId&&item.shift_date>=from&&item.shift_date<=to).reduce((total,item)=>total+scheduleHours(item),0);
    const returnDate=(request:TimeAwayRequest)=>{const[y,m,d]=request.end_date.split("-").map(Number),date=new Date(y,m-1,d+1,12);return date.toLocaleDateString("en-GB",{day:"numeric",month:"short"})};
    const reasonLabel=(request:TimeAwayRequest)=>`${request.request_type==="holiday"?"Leave":request.request_type==="unavailable"?"Unavailable":request.request_type.charAt(0).toUpperCase()+request.request_type.slice(1)}${request.notes?` · Returns ${returnDate(request)}`:""}`;
    const coaches=staff.filter(person=>person.role==="coach"&&person.is_active&&(!availabilityVenue||(staffVenueMap[person.id]||[]).includes(availabilityVenue))&&`${person.full_name} ${profileVenues(person.id).map(v=>v.name).join(" ")}`.toLowerCase().includes(availabilitySearch.trim().toLowerCase())).map(person=>{
      const coaching=scheduleData.filter(item=>item.profile_id===person.id&&item.shift_date>=range.from&&item.shift_date<=range.to).sort((a,b)=>`${a.shift_date}${a.start_time}`.localeCompare(`${b.shift_date}${b.start_time}`));
      const nextClass=scheduleData.filter(item=>item.profile_id===person.id&&item.shift_date===todayKey&&item.start_time.slice(0,5)>currentTime).sort((a,b)=>a.start_time.localeCompare(b.start_time))[0]||null;
      const approved=timeAwayRequests.filter(request=>request.profile_id===person.id&&request.status==="approved"&&request.start_date<=range.to&&request.end_date>=range.from).sort((a,b)=>a.start_date.localeCompare(b.start_date))[0];
      const pending=timeAwayRequests.filter(request=>request.profile_id===person.id&&request.status==="pending"&&request.start_date<=range.to&&request.end_date>=range.from).sort((a,b)=>a.start_date.localeCompare(b.start_date))[0];
      const group=approved?"unavailable":coaching.length?"coaching":pending?"pending":"available";
      return{person,group,coaching,nextClass,approved,pending,todayHours:hoursBetween(person.id,todayKey,todayKey),weekHours:hoursBetween(person.id,weekStart,weekEnd)};
    });
    const groups=([
      {key:"available",title:"🟢 Available",empty:"Everyone is currently assigned, away, or awaiting a leave decision."},
      {key:"coaching",title:"🟠 Currently Coaching",empty:"No coaching assignments fall within this period."},
      {key:"pending",title:"🟣 Pending Leave",empty:"There are no pending Time Away requests for this period."},
      {key:"unavailable",title:"🔴 Unavailable",empty:"No staff are unavailable during this period."}
    ] as const);
    const openSchedule=(person:Profile)=>{setAdminPersonalRota(false);setRotaView("day");setRotaDate(range.from);setMonth(monthKey(new Date(`${range.from}T12:00:00`)));const ids=staffVenueMap[person.id]||[];setScheduleFilter(ids.length===1?ids[0]:"");setTab("schedule")};
    return <><PageHead title="Staff Availability" sub="See who can coach for the club."><span className="v431Updated"><ClockIcon/>Updated {updatedTime}</span></PageHead>
      <div className="grid grid4 v430AvailabilitySummary">{groups.map(group=><div className={`card ${group.key}`} key={group.key}><span>{group.title}</span><strong>{coaches.filter(item=>item.group===group.key).length}</strong><small>{range.label}</small></div>)}</div>
      <FilterBar className="v430AvailabilityControls"><div className="v430PeriodTabs"><button className={availabilityPeriod==="today"?"active":""} onClick={()=>setAvailabilityPeriod("today")}>Today</button><button className={availabilityPeriod==="tomorrow"?"active":""} onClick={()=>setAvailabilityPeriod("tomorrow")}>Tomorrow</button><button className={availabilityPeriod==="week"?"active":""} onClick={()=>setAvailabilityPeriod("week")}>This Week</button></div><div className="searchBar"><SearchIcon/><input value={availabilitySearch} onChange={e=>setAvailabilitySearch(e.target.value)} placeholder="Search staff…"/></div></FilterBar>
      <div className="v430AvailabilityBoard">{groups.map(group=>{const people=coaches.filter(item=>item.group===group.key),expanded=availabilityExpanded[group.key];return <section className={`v430AvailabilityColumn ${group.key} ${expanded?"expanded":"collapsed"}`} key={group.key}><header><button type="button" aria-expanded={expanded} onClick={()=>setAvailabilityExpanded(current=>({...current,[group.key]:!current[group.key]}))}><strong>{group.title}</strong><span>{people.length}</span><b aria-hidden="true">⌄</b></button></header><div className="v432AvailabilityContents">{people.map(item=>{const away=item.approved||item.pending,session=item.coaching[0];return <article className="v430AvailabilityCard" key={item.person.id}>
        <div className="v430AvailabilityIdentity"><div>{initials(item.person.full_name)}</div><span><strong>{item.person.full_name}</strong><small>{group.key==="coaching"?"Coaching":group.key==="pending"?"Pending leave":group.key==="unavailable"?"Unavailable":"Available"}</small></span></div>
        <div className="v430AvailabilityHours"><span><small>Today</small><b>{item.todayHours.toFixed(2)}h</b></span><span><small>This week</small><b>{item.weekHours.toFixed(2)}h</b></span></div>
        {session&&<div className="v430AvailabilityDetail"><span>Current class</span><strong>{session.class_name}</strong><small>{new Date(`${session.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})} · {session.start_time.slice(0,5)}–{session.finish_time.slice(0,5)} · {venueName(session.venue_id)}</small></div>}
        {group.key==="available"&&(item.nextClass?<div className="v430AvailabilityDetail next"><span>Next Class</span><strong>{item.nextClass.class_name}</strong><small>{item.nextClass.start_time.slice(0,5)}–{item.nextClass.finish_time.slice(0,5)} · {venueName(item.nextClass.venue_id)}</small></div>:<div className="v431NoFurther"><CheckIcon/><span><strong>No further classes today</strong><small>Available for cover.</small></span></div>)}
        {away&&<div className="v430AvailabilityDetail away"><span>Time away</span><strong>{reasonLabel(away)}</strong><small>{away.notes||`${away.all_day?"Full day":`${away.start_time?.slice(0,5)}–${away.end_time?.slice(0,5)}`} · Returns ${returnDate(away)}`}</small></div>}
        <div className="v430AvailabilityActions"><button onClick={()=>openSchedule(item.person)}><CalendarIcon/><span>View Schedule</span></button><button onClick={()=>setTab("leave")}><ClockIcon/><span>View Time Away</span></button><button onClick={()=>void openStaffEdit(item.person)}><UserIcon/><span>View Profile</span></button></div>
      </article>})}{!people.length&&<div className="v430AvailabilityEmpty"><span>{group.key==="available"?"✓":group.key==="coaching"?"○":group.key==="pending"?"◇":"✓"}</span><strong>{group.title.replace(/^[^ ]+ /,"")}</strong><small>{group.empty}</small></div>}</div></section>})}</div>
    </>;
  }


  function StaffView(){
    const activeCount=filteredStaff.filter(s=>s.is_active).length;
    const portalCount=filteredStaff.filter(s=>Boolean(s.username)).length;
    const recentCount=filteredStaff.filter(s=>s.last_login_at&&Date.now()-new Date(s.last_login_at).getTime()<30*86400000).length;
    const roleLabel=(s:Profile)=>s.role==="club_owner"?"Club Owner":s.role==="admin"?"Super admin":s.role==="org_admin"?"Club Manager":"Coach";
    const lastLogin=(s:Profile)=>s.last_login_at?new Date(s.last_login_at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):s.username?"Never":"No portal account";
    return <><PageHead title="People" sub="Manage staff details, account access and security."><button className="btn btnPrimary" onClick={()=>setInviteOpen(true)}><PlusIcon/>Add staff</button></PageHead>
      <div className="grid grid3 v32PeopleStats"><StatCard label="Active staff" value={String(activeCount)} foot={`${filteredStaff.length} total profiles`} icon={<UsersIcon/>}/><StatCard label="Portal access" value={String(portalCount)} foot={`${filteredStaff.length-portalCount} not invited yet`} icon={<CheckIcon/>}/><StatCard label="Recently signed in" value={String(recentCount)} foot="Within the last 30 days" icon={<ClockIcon/>}/></div>
      <div className="card section"><div className="sectionHeader"><FilterBar className="staffFilters"><div className="searchBar"><SearchIcon/><input placeholder="Search staff…" value={search} onChange={e=>setSearch(e.target.value)}/></div></FilterBar><div className="muted" style={{fontSize:12}}>{filteredStaff.length} people</div></div>
        <div className="v32PeopleGrid">{filteredStaff.map(s=><button className="v32PersonCard" key={s.id} onClick={()=>openStaffEdit(s)}>
          <div className="v32PersonTop"><div className="v32PersonAvatar">{initials(s.full_name)}</div><div className="v32PersonIdentity"><strong>{s.full_name||"Unnamed coach"}</strong><span>{s.job_title||roleLabel(s)}</span></div><span className={`v32AccountDot ${s.is_active?"active":"inactive"}`}>{s.is_active?"Active":"Inactive"}</span></div>
          <div className="v32PersonMeta"><div><span>Account</span><strong>{s.username?`@${s.username}`:"No username"}</strong></div><div><span>Last sign in</span><strong>{lastLogin(s)}</strong></div></div>
          <div className="v32PersonFooter"><span>{s.email||s.contact_email||"Recovery email optional"}</span><strong>Open profile →</strong></div>
        </button>)}</div>
        {!filteredStaff.length&&<div className="empty">No staff match these filters.</div>}
      </div>
    </>
  }

  function WorkforceView(){
    type WorkforceRow={key:string;person:Profile;organisation:Venue|null;employmentType:EmploymentRecord["employment_type"];annualSalary:number;monthlySalary:number;internalHourlyRate:number;standardRate:number;enhancedRate:number;hours:number;volunteerHours:number;cost:number};
    const{from,to}=monthRange(month);
    const permittedVenues=adminVenues();
    const selectedVenueIds=new Set((workforceVenue?permittedVenues.filter(v=>v.id===workforceVenue):permittedVenues).map(v=>v.id));
    const monthShifts=adminMonthShifts.filter(s=>Boolean(s.venue_id)&&selectedVenueIds.has(s.venue_id!)&&(!s.approval_status||s.approval_status==="approved"));
    const recordFor=(person:Profile,organisationId:string)=>{
      const records=allEmploymentRecords.filter(record=>record.profile_id===person.id&&record.organisation_id===organisationId&&record.effective_from<=to&&(!record.effective_to||record.effective_to>=from));
      return records.sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0]||null;
    };
    const rows:WorkforceRow[]=[];
    staff.forEach(person=>{
      const organisationIds=new Set((staffVenueMap[person.id]||[]).filter(id=>selectedVenueIds.has(id)));
      monthShifts.filter(shift=>shift.coach_id===person.id&&shift.venue_id).forEach(shift=>organisationIds.add(shift.venue_id!));
      allEmploymentRecords.filter(record=>record.profile_id===person.id&&selectedVenueIds.has(record.organisation_id)&&record.effective_from<=to&&(!record.effective_to||record.effective_to>=from)).forEach(record=>organisationIds.add(record.organisation_id));
      organisationIds.forEach(organisationId=>{
        const record=employmentRecordsAvailable?recordFor(person,organisationId):null;
        const storedEmploymentType=(record?.employment_type||person.employment_type||"hourly") as string;
        const employmentType:EmploymentRecord["employment_type"]=storedEmploymentType==="salaried"||storedEmploymentType==="volunteer"?storedEmploymentType:"hourly";
        const personShifts=monthShifts.filter(shift=>shift.coach_id===person.id&&shift.venue_id===organisationId);
        const hours=personShifts.reduce((total,shift)=>total+shiftHours(shift),0);
        const volunteerHours=employmentType==="volunteer"?hours:personShifts.filter(shift=>shift.payment_type==="volunteer").reduce((total,shift)=>total+shiftHours(shift),0);
        const annualSalary=Number(record?.annual_salary??person.annual_salary??0);
        const monthlySalary=employmentType==="salaried"?annualSalary/12:0;
        const standardRate=Number(record?.standard_rate??person.standard_rate??person.hourly_rate??0);
        const enhancedRate=Number(record?.enhanced_rate??person.enhanced_rate??person.hourly_rate??0);
        const internalHourlyRate=Number(record?.calculated_internal_hourly_rate??(annualSalary&&Number(record?.working_weeks_per_year??person.working_weeks_per_year)&&Number(record?.contracted_weekly_hours??person.contracted_weekly_hours)?annualSalary/Number(record?.working_weeks_per_year??person.working_weeks_per_year)/Number(record?.contracted_weekly_hours??person.contracted_weekly_hours):0));
        const operationalCost=personShifts.reduce((total,shift)=>total+shiftHours(shift)*Number(person.hourly_rate||0),0);
        rows.push({key:`${person.id}:${organisationId}`,person,organisation:venues.find(v=>v.id===organisationId)||null,employmentType,annualSalary,monthlySalary,internalHourlyRate,standardRate,enhancedRate,hours,volunteerHours,cost:employmentType==="salaried"?monthlySalary:employmentType==="volunteer"?0:operationalCost});
      });
    });
    const visibleRows=rows.filter(row=>row.person.full_name.toLowerCase().includes(workforceSearch.trim().toLowerCase()));
    const salaryTotal=rows.filter(row=>row.employmentType==="salaried").reduce((total,row)=>total+row.monthlySalary,0);
    const variableStaffing=rows.filter(row=>row.employmentType==="hourly").reduce((total,row)=>total+row.cost,0);
    const volunteerHours=rows.reduce((total,row)=>total+row.volunteerHours,0);
    const totalWorkforceCost=salaryTotal+variableStaffing;
    const labels:Record<WorkforceRow["employmentType"],string>={hourly:"Hourly",salaried:"Salaried",volunteer:"Volunteer"};
    const breakdown=(type:WorkforceRow["employmentType"])=>{const typeRows=rows.filter(row=>row.employmentType===type);return{staff:new Set(typeRows.map(row=>row.person.id)).size,hours:typeRows.reduce((total,row)=>total+row.hours,0),cost:typeRows.reduce((total,row)=>total+row.cost,0)}};
    const hourlyRows=visibleRows.filter(row=>row.employmentType==="hourly"),salariedRows=visibleRows.filter(row=>row.employmentType==="salaried"),volunteerRows=visibleRows.filter(row=>row.employmentType==="volunteer");
    const mostUsed=[...rows].sort((a,b)=>b.hours-a.hours)[0];
    const highestCost=[...rows].sort((a,b)=>b.cost-a.cost)[0];
    const mostVolunteer=[...rows].sort((a,b)=>b.volunteerHours-a.volunteerHours)[0];
    const highestPaid=[...rows].sort((a,b)=>(b.employmentType==="salaried"?b.annualSalary:b.standardRate*52*37.5)-(a.employmentType==="salaried"?a.annualSalary:a.standardRate*52*37.5))[0];
    const DetailTable=({title,items,columns,render}:{title:string;items:WorkforceRow[];columns:string[];render:(row:WorkforceRow)=>React.ReactNode})=><div className="card v12WorkforceDetail"><div className="sectionHeader"><div><h2>{title}</h2><p>{items.length?`${items.length} employment ${items.length===1?"record":"records"}`:"No Data"}</p></div></div>{items.length?<div className="tableWrap"><table><thead><tr>{columns.map(column=><th key={column}>{column}</th>)}</tr></thead><tbody>{items.map(render)}</tbody></table></div>:<div className="empty">No Data</div>}</div>;
    return <div className="v12WorkforcePage">
      <PageHead title="Workforce" sub="A management view of employment, worked hours and workforce cost."><MonthNavigation/></PageHead>
      <div className="v12WorkforceSummary">
        <StatCard label="Salaried" value={money(salaryTotal)} foot={monthLabel(month)} icon={<PoundIcon/>}/><StatCard label="Hourly" value={money(variableStaffing)} foot="Estimated staffing cost" icon={<ClockIcon/>}/><StatCard label="Volunteer" value={`${volunteerHours.toFixed(2)}h`} foot="Volunteer cost £0" icon={<UsersIcon/>}/>
      </div>
      <section className="card v12WorkforceBreakdown"><div className="sectionHeader"><div><h2>Workforce breakdown</h2><p>Headcount, worked hours and cost by employment type.</p></div></div><div className="v12EmploymentBreakdown">{(["salaried","hourly","volunteer"] as const).map(type=>{const value=breakdown(type);return <article key={type}><span>{labels[type]}</span><strong>{value.staff} Staff</strong><div><small>Hours</small><b>{value.hours.toFixed(2)}h</b><small>Cost</small><b>{money(value.cost)}</b></div></article>})}</div></section>
      <section className="v12WorkforceDetails">
        <DetailTable title="Salaried staff" items={salariedRows} columns={["Employee","Annual salary","Monthly salary","Internal hourly cost","Contracted hours","Employment type"]} render={row=><tr key={row.key}><td>{row.person.full_name}</td><td>{money(row.annualSalary)}</td><td>{money(row.monthlySalary)}</td><td>{money(row.internalHourlyRate)}</td><td>{Number(allEmploymentRecords.find(record=>record.profile_id===row.person.id&&record.organisation_id===row.organisation?.id)?.contracted_weekly_hours??row.person.contracted_weekly_hours??0).toFixed(2)}h</td><td>Salaried</td></tr>}/>
        <DetailTable title="Hourly staff" items={hourlyRows} columns={["Employee","Hours worked","Estimated cost","Standard rate","Enhanced rate"]} render={row=><tr key={row.key}><td>{row.person.full_name}</td><td>{row.hours.toFixed(2)}h</td><td>{money(row.cost)}</td><td>{money(row.standardRate)}</td><td>{money(row.enhancedRate)}</td></tr>}/>
        <DetailTable title="Volunteers" items={volunteerRows} columns={["Employee","Volunteer hours"]} render={row=><tr key={row.key}><td>{row.person.full_name}</td><td>{row.volunteerHours.toFixed(2)}h</td></tr>}/>
      </section>
      <section className="card v12WorkforceTable"><div className="sectionHeader"><div><h2>Staff</h2><p>Select a row to open the existing Staff Profile.</p></div><div className="searchBar"><SearchIcon/><input value={workforceSearch} onChange={event=>setWorkforceSearch(event.target.value)} placeholder="Search workforce…"/></div></div><div className="tableWrap"><table><thead><tr><th>Name</th><th>Employment type</th><th>Monthly cost</th><th>Current rate</th><th>Hours worked</th><th>Volunteer hours</th><th>Status</th></tr></thead><tbody>{visibleRows.map(row=><tr key={row.key} onClick={()=>openStaffEdit(row.person)} className="v12WorkforceRow"><td><button type="button">{row.person.full_name}</button></td><td>{labels[row.employmentType]}</td><td>{money(row.cost)}</td><td>{row.employmentType==="salaried"?`${money(row.internalHourlyRate)}/hr`:row.employmentType==="volunteer"?money(0):`${money(row.standardRate)}/hr`}</td><td>{row.hours.toFixed(2)}h</td><td>{row.volunteerHours.toFixed(2)}h</td><td><StatusPill status={row.person.is_active?"active":"inactive"}/></td></tr>)}</tbody></table></div>{!visibleRows.length&&<div className="empty">No Data</div>}</section>
      <section className="card v12WorkforceInsights"><div className="sectionHeader"><div><h2>Insights</h2><p>Current workforce signals. Ready for richer insights as new data sources become available.</p></div></div><div>{[["Most Used Coach",mostUsed&&mostUsed.hours>0?`${mostUsed.person.full_name} · ${mostUsed.hours.toFixed(2)}h`:"No Data"],["Highest Staffing Cost",highestCost&&highestCost.cost>0?`${highestCost.person.full_name} · ${money(highestCost.cost)}`:"No Data"],["Most Volunteer Hours",mostVolunteer&&mostVolunteer.volunteerHours>0?`${mostVolunteer.person.full_name} · ${mostVolunteer.volunteerHours.toFixed(2)}h`:"No Data"],["Highest Paid Staff",highestPaid?highestPaid.person.full_name:"No Data"]].map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div></section>
    </div>
  }

  function ReportsView(){
    const avg=adminRows.length?adminHours/adminRows.length:0;
    return <><PageHead centered title="Reports & audit" sub="Monthly staffing cost plus a trace of changes made in the portal."><MonthNavigation/></PageHead>
      <div className="grid grid4"><StatCard label="Total hours" value={adminHours.toFixed(2)} foot={monthLabel(month)} icon={<ClockIcon/>}/><StatCard label="Estimated coach cost" value={money(adminRows.reduce((a,r)=>a+r.value,0))} foot="Hours × agreed rates" icon={<PoundIcon/>}/><StatCard label="Average hours" value={avg.toFixed(2)} foot="Per active coach" icon={<UsersIcon/>}/><StatCard label="Submission rate" value={adminRows.length?`${Math.round(submittedCount/adminRows.length*100)}%`:"0%"} foot={`${submittedCount} submitted`} icon={<CheckIcon/>}/></div>
      <div className="section"><div className="card"><div className="sectionHeader"><div><h2>Cost by coach</h2><p>Current selected month.</p></div></div><div className="mobileDataList">{[...adminRows].sort((a,b)=>b.value-a.value).map(r=><div className="mobileReportRow" key={r.coach.id}><strong>{r.coach.full_name}</strong><span>{r.hours.toFixed(2)}h</span><b>{money(r.value)}</b></div>)}</div><div className="tableWrap desktopDataTable"><table><thead><tr><th>Coach</th><th className="num">Hours</th><th className="num">Cost</th></tr></thead><tbody>{[...adminRows].sort((a,b)=>b.value-a.value).map(r=><tr key={r.coach.id}><td>{r.coach.full_name}</td><td className="num">{r.hours.toFixed(2)}</td><td className="num">{money(r.value)}</td></tr>)}</tbody></table></div></div></div>
      {isGlobalAdmin&&<div className="section"><button className="btn btnSecondary v504AccordionToggle" type="button" aria-expanded={auditOpen} onClick={()=>setAuditOpen(!auditOpen)}><span>{auditOpen?"Hide activity history":"View activity history"}</span><b aria-hidden="true">⌄</b></button>{auditOpen&&<div className="card" style={{marginTop:12}}><div className="activityList">{audits.slice(0,30).map(a=><div className="activityItem" key={a.id}><div className="activityIcon"><ClockIcon/></div><div><div className="activityText"><strong>{a.action.replaceAll("_"," ")}</strong> · {a.entity_type}</div><div className="activityTime">{fmtStamp(a.created_at)}</div></div></div>)}{!audits.length&&<div className="empty">No recorded activity yet.</div>}</div></div>}</div>}
    {isGlobalAdmin&&<div className="section"><PageHead title="Launch tools" sub="Clear test data before real staff begin using the portal."/><div className="card dangerZone"><div className="formSection"><div className="formSectionTitle"><h3>System reset</h3><p>This is permanent. It keeps AV branding, Club settings and the Super Admin account you are currently using.</p></div><div className="resetSummary"><strong>Always cleared</strong><span>Scheduled sessions · classes · regular shift templates · shifts · timesheets · invoices · audit/test activity</span></div><label className="checkCard resetOption"><input type="checkbox" checked={resetRemoveStaff} onChange={e=>setResetRemoveStaff(e.target.checked)}/><span><strong>Also remove every other staff account</strong><small>Use this only when you want a completely clean launch. Your current Super Admin is protected.</small></span></label><div className="field"><label>Type RESET MY DATA to enable</label><input value={resetConfirm} onChange={e=>setResetConfirm(e.target.value)} placeholder="RESET MY DATA" autoComplete="off"/></div><button className="btn btnDanger" type="button" disabled={resetBusy||resetConfirm!=="RESET MY DATA"} onClick={runLaunchReset}>{resetBusy?"Resetting…":resetRemoveStaff?"Reset data & remove other staff":"Reset operational data"}</button></div></div></div>}
    </>
  }

  async function runLaunchReset(){
    if(!isGlobalAdmin){flash("Super Admin only.");return}
    if(resetConfirm!=="RESET MY DATA"){flash('Type "RESET MY DATA" exactly before resetting.');return}
    const warning=resetRemoveStaff
      ?"This permanently clears all operational/test data AND deletes every other user account. Your current Super Admin and Club settings remain. Continue?"
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

  function StaffingIntelligenceSettingsView(){
    const criterionLabel=(key:string)=>STAFFING_CRITERIA.find(item=>item.key===key)?.label||key.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
    return <div className="section v11StaffingIntelligence">
      <PageHead title="Staffing Intelligence" sub="Configure advisory rules and recommendation ranking. These settings never block an assignment."/>
      {!staffingIntelligenceAvailable&&<div className="notice">Apply the Version 1.1 Staffing Intelligence migration to manage these settings.</div>}
      <div className="card v11IntelligenceCard">
        <div className="sectionHeader"><div><span className="v11SectionNumber">01</span><h2>Mandatory Rules</h2><p>Choose how strongly each advisory check should be shown.</p></div></div>
        <div className="v11RuleList">{STAFFING_RULES.map(rule=><div className="v11RuleRow" key={rule.key}><div><strong>{rule.label}</strong><span>{rule.description}</span></div><select aria-label={`${rule.label} severity`} value={staffingIntelligence.mandatory_rules[rule.key]||"disabled"} onChange={e=>setStaffingIntelligence({...staffingIntelligence,mandatory_rules:{...staffingIntelligence.mandatory_rules,[rule.key]:e.target.value as StaffingRuleLevel}})}><option value="disabled">Disabled</option><option value="warning">Warning</option><option value="critical">Critical</option></select></div>)}</div>
      </div>
      <div className="card v11IntelligenceCard">
        <div className="sectionHeader"><div><span className="v11SectionNumber">02</span><h2>Recommendation Priorities</h2><p>Weights influence ranking. Threshold criteria only need to pass and gain no bonus for exceeding.</p></div></div>
        <div className="v11CriteriaHeader"><span>Criterion</span><span>Weight</span><span>Behaviour</span></div>
        <div className="v11CriteriaList">{staffingIntelligence.priority_order.map(key=>{const criterion=staffingIntelligence.criteria[key];if(!criterion)return null;return <div className="v11CriterionRow" key={key}><strong>{criterionLabel(key)}</strong><input aria-label={`${criterionLabel(key)} weight`} type="number" min="0" max="100" value={criterion.weight} disabled={criterion.behaviour!=="score"} onChange={e=>setStaffingIntelligence({...staffingIntelligence,criteria:{...staffingIntelligence.criteria,[key]:{...criterion,weight:Math.min(100,Math.max(0,Number(e.target.value)||0))}}})}/><select aria-label={`${criterionLabel(key)} behaviour`} value={criterion.behaviour} onChange={e=>setStaffingIntelligence({...staffingIntelligence,criteria:{...staffingIntelligence.criteria,[key]:{...criterion,behaviour:e.target.value as StaffingCriterionBehaviour}}})}><option value="score">Score</option><option value="threshold">Threshold</option><option value="disabled">Disabled</option></select></div>})}</div>
      </div>
      <div className="card v11IntelligenceCard">
        <div className="sectionHeader"><div><span className="v11SectionNumber">03</span><h2>Priority Order</h2><p>Highest priority appears first. New criteria can be added to the stored configuration without changing this layout.</p></div></div>
        <ol className="v11PriorityList">{staffingIntelligence.priority_order.map((key,index)=><li key={key}><span>{index+1}</span><strong>{criterionLabel(key)}</strong><div><button className="iconButton" type="button" aria-label={`Move ${criterionLabel(key)} up`} disabled={index===0} onClick={()=>moveStaffingPriority(key,-1)}>↑</button><button className="iconButton" type="button" aria-label={`Move ${criterionLabel(key)} down`} disabled={index===staffingIntelligence.priority_order.length-1} onClick={()=>moveStaffingPriority(key,1)}>↓</button></div></li>)}</ol>
      </div>
      <div className="v11SettingsActions"><button className="btn btnPrimary" type="button" disabled={saving||!staffingIntelligenceAvailable} onClick={()=>void saveStaffingIntelligenceSettings()}>{saving?"Saving…":"Save Staffing Intelligence"}</button></div>
    </div>
  }

  function SettingsView(){
    return <>{isGlobalAdmin&&<><PageHead title="Club Settings" sub="Manage this club’s identity, branding and payroll defaults."/>{!clubArchitectureAvailable||!currentClub?<div className="notice">Apply the Version 1.2 Club Architecture migration to enable Club Settings. Existing settings remain unchanged.</div>:<div className="card v12ClubSettings" style={{maxWidth:900}}><div className="formSection"><div className="formSectionTitle"><h3>Club identity</h3><p>Used throughout this club’s independent workspace.</p></div><div className="grid grid2"><div className="field"><label>Club Name</label><input value={currentClub.name} onChange={e=>setCurrentClub({...currentClub,name:e.target.value})}/></div><div className="field"><label>Short Name</label><input value={currentClub.short_name||""} onChange={e=>setCurrentClub({...currentClub,short_name:e.target.value})}/></div></div><div className="field"><label>Logo URL</label><input type="url" value={currentClub.logo_url||""} onChange={e=>setCurrentClub({...currentClub,logo_url:e.target.value})} placeholder="https://…"/></div><div className="grid grid2"><div className="field"><label>Primary Colour</label><input type="color" value={currentClub.primary_colour} onChange={e=>setCurrentClub({...currentClub,primary_colour:e.target.value})}/></div><div className="field"><label>Secondary Colour</label><input type="color" value={currentClub.secondary_colour} onChange={e=>setCurrentClub({...currentClub,secondary_colour:e.target.value})}/></div></div></div><div className="formSection"><div className="formSectionTitle"><h3>Contact details</h3></div><div className="grid grid2"><div className="field"><label>Email</label><input type="email" value={currentClub.email||""} onChange={e=>setCurrentClub({...currentClub,email:e.target.value})}/></div><div className="field"><label>Telephone</label><input value={currentClub.telephone||""} onChange={e=>setCurrentClub({...currentClub,telephone:e.target.value})}/></div></div><div className="field"><label>Website</label><input type="url" value={currentClub.website||""} onChange={e=>setCurrentClub({...currentClub,website:e.target.value})}/></div><div className="field"><label>Address</label><textarea value={currentClub.address||""} onChange={e=>setCurrentClub({...currentClub,address:e.target.value})}/></div></div><div className="formSection"><div className="formSectionTitle"><h3>Bank and payroll settings</h3></div><div className="field"><label>Bank Details</label><textarea value={currentClub.bank_details||""} onChange={e=>setCurrentClub({...currentClub,bank_details:e.target.value})}/></div><div className="grid grid3"><div className="field"><label>Payroll Month</label><select value={currentClub.payroll_month} onChange={e=>setCurrentClub({...currentClub,payroll_month:Number(e.target.value)})}>{Array.from({length:12},(_,index)=>index+1).map(value=><option value={value} key={value}>{new Date(2026,value-1,1).toLocaleDateString("en-GB",{month:"long"})}</option>)}</select></div><div className="field"><label>Timezone</label><input value={currentClub.timezone} onChange={e=>setCurrentClub({...currentClub,timezone:e.target.value})}/></div><div className="field"><label>Currency</label><input maxLength={3} value={currentClub.currency} onChange={e=>setCurrentClub({...currentClub,currency:e.target.value.toUpperCase()})}/></div></div><div className="grid grid2"><div className="field"><label>Timesheet cut-off</label><select value={business.cutoff_day} onChange={e=>setBusiness({...business,cutoff_day:Number(e.target.value)})}>{Array.from({length:7},(_,i)=>i+1).map(d=><option value={d} key={d}>{d}{d===1?"st":d===2?"nd":d===3?"rd":"th"} of following month</option>)}</select></div><div className="field"><label>Payment note</label><input value={business.payment_note||""} onChange={e=>setBusiness({...business,payment_note:e.target.value})}/></div></div><button className="btn btnPrimary" onClick={async()=>{await saveClub();await saveBusiness()}} disabled={saving}>{saving?"Saving…":"Save Club Settings"}</button></div></div>}</>}
    {isGlobalAdmin&&StaffingIntelligenceSettingsView()}
    {isGlobalAdmin&&<div className="section"><PageHead title="Qualifications" sub="Manage the qualification options used by coach and class staffing profiles."/><div className="grid grid2 v101QualificationLayout"><div className="card"><div className="formSection"><div className="formSectionTitle"><h3>{qualificationDraft.id?"Edit qualification":"Add qualification"}</h3><p>Qualifications inform recommendations but never prevent assignment.</p></div><div className="field"><label>Name</label><input value={qualificationDraft.name} onChange={e=>setQualificationDraft({...qualificationDraft,name:e.target.value})} placeholder="e.g. Level 2 Trampoline"/></div><div className="grid grid2"><div className="field"><label>Qualification family <span className="muted">(optional)</span></label><input value={qualificationDraft.qualification_family} onChange={e=>setQualificationDraft({...qualificationDraft,qualification_family:e.target.value})} placeholder="e.g. Trampoline"/></div><div className="field"><label>Qualification level <span className="muted">(optional)</span></label><input type="number" min="0" step="1" value={qualificationDraft.qualification_level} onChange={e=>setQualificationDraft({...qualificationDraft,qualification_level:e.target.value})} placeholder="e.g. 3"/></div></div><div className="field"><label>Description <span className="muted">(optional)</span></label><textarea value={qualificationDraft.description} onChange={e=>setQualificationDraft({...qualificationDraft,description:e.target.value})}/></div><div className="row"><button className="btn btnPrimary" type="button" disabled={saving||!qualificationDraft.name.trim()} onClick={()=>void saveQualificationType()}>{saving?"Saving…":qualificationDraft.id?"Save qualification":"Add qualification"}</button>{qualificationDraft.id&&<button className="btn btnSecondary" type="button" onClick={()=>setQualificationDraft({name:"",description:"",qualification_family:"",qualification_level:""})}>Cancel</button>}</div></div></div><div className="card"><div className="sectionHeader"><div><h2>Qualification library</h2><p>{qualificationTypes.filter(q=>q.active).length} active · {qualificationTypes.filter(q=>!q.active).length} archived</p></div></div><div className="v101QualificationList">{sortedQualifications(qualificationTypes).map(q=><article className={`v101QualificationItem ${q.active?"active":"archived"}`} key={q.id}><div><strong>{q.name}</strong><span>{q.qualification_family?`${q.qualification_family}${q.qualification_level!=null?` · Level ${q.qualification_level}`:""}`:"Standalone qualification"}</span><span>{q.description||"No description"}</span><small>{q.active?"Active":"Inactive"}</small></div><div className="row"><button className="btn btnSecondary" type="button" onClick={()=>setQualificationDraft({id:q.id,name:q.name,description:q.description||"",qualification_family:q.qualification_family||"",qualification_level:q.qualification_level?.toString()||""})}>Edit</button><button className={`btn ${q.active?"btnDanger":"btnAccent"}`} type="button" onClick={()=>void setQualificationActive(q,!q.active)}>{q.active?"Archive":"Restore"}</button></div></article>)}{!qualificationTypes.length&&<div className="empty">No qualifications configured yet.</div>}</div></div></div></div>}
    </>
  }

  function ProfileView(){
    const p=ownProfile,fields=[p.full_name,p.email,p.phone,p.address,p.account_name,p.sort_code,p.account_number,p.invoice_prefix,p.emergency_contact_name,p.emergency_contact_phone],complete=Math.round(fields.filter(Boolean).length/fields.length*100);
    return <><PageHead title="My profile" sub="Personal, payment and security information."/><div className="card profileHero"><div className="profileAvatar">{initials(p.full_name)}</div><div><div className="profileName">{p.full_name}</div><div className="profileMeta">@{p.username||"username"} · {p.job_title||p.role}</div></div><div className="completion"><strong>{complete}% complete</strong><div className="progress"><span style={{width:`${complete}%`}}/></div></div></div>
      <div className="grid grid2 section">
        <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Personal details</h3></div><div className="field"><label>Name / trading name</label><input value={p.full_name} onChange={e=>setOwnProfile({...p,full_name:e.target.value})}/></div><div className="field"><label>Recovery email <span className="muted">(optional)</span></label><input type="email" value={p.email||p.contact_email||""} onChange={e=>setOwnProfile({...p,email:e.target.value,contact_email:e.target.value})}/><div className="fieldHint">Used for password recovery only. Your username stays the same.</div></div><div className="field"><label>Mobile</label><input value={p.phone||""} onChange={e=>setOwnProfile({...p,phone:e.target.value})}/></div><div className="field"><label>Address</label><textarea value={p.address||""} onChange={e=>setOwnProfile({...p,address:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Emergency contact</label><input value={p.emergency_contact_name||""} onChange={e=>setOwnProfile({...p,emergency_contact_name:e.target.value})}/></div><div className="field"><label>Emergency phone</label><input value={p.emergency_contact_phone||""} onChange={e=>setOwnProfile({...p,emergency_contact_phone:e.target.value})}/></div></div></div></div>
        <div className="card v32SecurityCard"><div className="formSection"><div className="formSectionTitle"><h3>Security</h3><p>Change the password you use to access AV Gymnastics.</p></div>{p.force_password_reset&&<div className="notice">An administrator has requested that you change your password.</div>}<div className="field"><label>New password</label><input type="password" autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Minimum 8 characters"/></div><div className="field"><label>Confirm new password</label><input type="password" autoComplete="new-password" value={confirmNewPassword} onChange={e=>setConfirmNewPassword(e.target.value)}/></div><button className="btn btnPrimary" onClick={changeOwnPassword} disabled={passwordBusy}>{passwordBusy?"Updating…":"Change password"}</button><div className="v32SecurityMeta"><span>Last sign in</span><strong>{p.last_login_at?new Date(p.last_login_at).toLocaleString("en-GB"):"Not recorded yet"}</strong></div></div></div>
        <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Payment details</h3><p>Used for payments and invoices.</p></div><div className="field"><label>Account name</label><input value={p.account_name||""} onChange={e=>setOwnProfile({...p,account_name:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Sort code</label><input value={p.sort_code||""} onChange={e=>setOwnProfile({...p,sort_code:e.target.value})}/></div><div className="field"><label>Account number</label><input value={p.account_number||""} onChange={e=>setOwnProfile({...p,account_number:e.target.value})}/></div></div><div className="grid grid2"><div className="field"><label>UTR</label><input value={p.utr||""} onChange={e=>setOwnProfile({...p,utr:e.target.value})}/></div><div className="field"><label>Invoice prefix</label><input value={p.invoice_prefix||""} onChange={e=>setOwnProfile({...p,invoice_prefix:e.target.value.toUpperCase()})}/></div></div></div></div>
        <div className="card"><div className="formSection"><div className="formSectionTitle"><h3>Compliance</h3></div><div className="grid grid2"><div className="field"><label>DBS expiry</label><input type="date" value={p.dbs_expiry||""} onChange={e=>setOwnProfile({...p,dbs_expiry:e.target.value})}/></div><div className="field"><label>First Aid expiry</label><input type="date" value={p.first_aid_expiry||""} onChange={e=>setOwnProfile({...p,first_aid_expiry:e.target.value})}/></div></div><div className="field"><label>Safeguarding expiry</label><input type="date" value={p.safeguarding_expiry||""} onChange={e=>setOwnProfile({...p,safeguarding_expiry:e.target.value})}/></div><div className="field"><label>Qualifications</label><textarea placeholder="e.g. Level 2 Trampoline, DMT Module..." value={p.qualifications||""} onChange={e=>setOwnProfile({...p,qualifications:e.target.value})}/></div></div></div>
      </div>
      <div className="section"><button className="btn btnPrimary" onClick={saveOwnProfile} disabled={saving}>{saving?"Saving…":"Save profile"}</button></div>
    </>
  }

  function IntelligentStaffingDrawer(){
    const shift=staffingRecommendationShift!;
    const classTemplate=classes.find(item=>item.id===shift.class_id);
    const staffingSlot=classSlots.find(item=>item.id===shift.staffing_slot_id);
    const staffingRole=staffingQualificationContext?.role||((staffingSlot?.slot_number||1)<=Number(classTemplate?.lead_coaches_required||1)?"lead":"assistant");
    const recommendedId=staffingQualificationContext?.recommendedQualificationId??(staffingRole==="lead"?classTemplate?.lead_recommended_qualification_id:classTemplate?.assistant_recommended_qualification_id);
    const recommendedQualification=staffingQualificationContext?.recommendedQualification||qualificationTypes.find(item=>item.id===recommendedId)||null;
    if(process.env.NODE_ENV!=="production")console.debug("[staffing-intelligence] qualification requirement",{scheduledShiftId:shift.id,classId:shift.class_id,staffingSlotId:shift.staffing_slot_id,classResolved:Boolean(classTemplate),slotNumber:staffingSlot?.slot_number??null,slotRole:staffingRole,leadRecommendedQualificationId:classTemplate?.lead_recommended_qualification_id??null,assistantRecommendedQualificationId:classTemplate?.assistant_recommended_qualification_id??null,recommendedQualificationId:recommendedId??null,recommendedQualificationName:recommendedQualification?.name??null});
    const sameClassShifts=scheduledShifts.filter(item=>item.shift_date===shift.shift_date&&item.class_id===shift.class_id&&item.status!=="cancelled");
    const assignedCount=sameClassShifts.filter(isAssignedShift).length;
    const totalSlots=Math.max(sameClassShifts.length,Number(classTemplate?.minimum_coaches||classTemplate?.coaches_required||1));
    const monday=new Date(`${shift.shift_date}T12:00:00`);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    const weekStart=localDateKey(monday),weekEnd=localDateKey(sunday);
    const assignedHours=(profileId:string,from:string,to:string)=>scheduledShifts.filter(item=>item.profile_id===profileId&&item.status!=="cancelled"&&item.shift_date>=from&&item.shift_date<=to).reduce((total,item)=>total+scheduleHours(item),0);
    const enabledKeys=["availability","previous_coach","lower_staffing_cost","recommended_qualification"];
    const priorities:RecommendationPriority[]=staffingIntelligence.priority_order.filter(key=>enabledKeys.includes(key)).flatMap(key=>{const config=staffingIntelligence.criteria[key];return config&&config.behaviour!=="disabled"?[{key:key as RecommendationPriority["key"],weight:config.behaviour==="score"?config.weight:0}]:[]});
    const allowed=staffOptionsForVenue(shift.venue_id);
    const normalisedProgrammeName=shift.class_name.trim().toLocaleLowerCase();
    const inputs=allowed.map(coach=>{
      const state=coachAssignmentState(coach.id,shift);
      const exactHistory=classCoachingStatistics.find(item=>item.class_id===shift.class_id&&item.coach_id===coach.id);
      const exactSessionCount=Number(exactHistory?.sessions_coached||0);
      const sameProgrammeSessionCount=classCoachingStatistics.filter(item=>item.coach_id===coach.id&&item.class_id!==shift.class_id&&item.organisation_id===shift.venue_id&&item.programme_key===normalisedProgrammeName).reduce((total,item)=>total+Number(item.sessions_coached||0),0);
      const heldTypes=coachQualifications.filter(item=>item.coach_id===coach.id).map(item=>qualificationTypes.find(type=>type.id===item.qualification_id)).filter(Boolean) as QualificationType[];
      const hasEmploymentRecord=allEmploymentRecords.some(record=>record.profile_id===coach.id&&record.organisation_id===shift.venue_id&&record.active&&record.effective_from<=shift.shift_date&&(!record.effective_to||record.effective_to>=shift.shift_date));
      return{coachId:coach.id,coachName:coach.full_name,role:staffingRole,classDurationHours:scheduleHours(shift),hourlyRate:Number(coach.hourly_rate||0),isAvailable:state.state==="available",isAssignedElsewhere:state.state==="working",approvedTimeAway:state.state==="away",pendingTimeAway:state.state==="pending",previousSessionCount:exactSessionCount,exactSessionCount,sameProgrammeSessionCount,programmeName:shift.class_name.trim(),worksAtOrganisation:true,qualificationIds:heldTypes.map(item=>item.id),recommendedQualificationId:recommendedId,qualifications:heldTypes.map(item=>({id:item.id,family:item.qualification_family,level:item.qualification_level})),recommendedQualification:recommendedQualification?{id:recommendedQualification.id,family:recommendedQualification.qualification_family,level:recommendedQualification.qualification_level}:null,dailyAssignedHours:assignedHours(coach.id,shift.shift_date,shift.shift_date),weeklyAssignedHours:assignedHours(coach.id,weekStart,weekEnd),hasEmploymentRecord};
    });
    const ranked=rankCoachRecommendations(inputs,priorities);
    const coachRows=ranked.map(result=>{
      const coach=allowed.find(item=>item.id===result.coachId)!;
      const input=inputs.find(item=>item.coachId===result.coachId)!;
      const state=coachAssignmentState(coach.id,shift);
      const conflict=scheduledOverlapsForCoach(coach.id,shift)[0]||null;
      const meetsQualification=!recommendedId||input.qualificationIds.includes(recommendedId)||Boolean(recommendedQualification&&input.qualifications.some(held=>qualificationSatisfies(held,input.recommendedQualification!)));
      if(process.env.NODE_ENV!=="production")console.debug("[staffing-intelligence] coach qualification match",{classId:shift.class_id,slotRole:staffingRole,recommendedQualificationId:recommendedId??null,recommendedQualificationName:recommendedQualification?.name??null,coachId:coach.id,coachName:coach.full_name,coachQualifications:input.qualifications.map(item=>({id:item.id,family:item.family??null,level:item.level??null})),matches:meetsQualification});
      const lowerCost=result.estimatedStaffingCost<=Math.min(...ranked.map(item=>item.estimatedStaffingCost));
      const matchLabel=result.score>=85?"Excellent Match":result.score>=70?"Strong Match":result.score>=55?"Good Match":result.score>=35?"Possible Match":"Not Recommended";
      return{coach,input,result,state,conflict,meetsQualification,lowerCost,matchLabel,recommendedQualificationId:recommendedId||null,recommendedQualificationName:recommendedQualification?.name||null};
    }).filter(row=>!coachAssignmentSearch.trim()||`${row.coach.full_name} ${row.matchLabel} ${row.state.label}`.toLowerCase().includes(coachAssignmentSearch.trim().toLowerCase()));
    const fullyPreferred=coachRows.some(row=>row.state.state==="available"&&row.meetsQualification);
    if(process.env.NODE_ENV!=="production"){
      console.debug("[staffing-intelligence] AFTER EXPERIENCE LOAD qualification status",{recommendedQualificationId:recommendedId??null,recommendedQualificationName:recommendedQualification?.name??null,experienceRows:classCoachingStatistics.length});
      console.debug("[staffing-intelligence] AFTER SORT qualification status",coachRows.map(row=>({coachId:row.coach.id,recommendedQualificationId:recommendedId??null,matches:row.meetsQualification})));
      console.debug("[staffing-intelligence] FINAL RENDER qualification status",{recommendedQualificationId:recommendedId??null,recommendedQualificationName:recommendedQualification?.name??null,visible:Boolean(recommendedId)});
    }
    const assign=async(coachId:string)=>{const changed=await reassignScheduledWithAvailability(shift,coachId);if(changed){setStaffingRecommendationShift(null);setStaffingQualificationContext(null)}};
    return <div className="v11DrawerBackdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget){setStaffingRecommendationShift(null);setStaffingQualificationContext(null)}}}><aside className="v11StaffingDrawer" role="dialog" aria-modal="true" aria-labelledby="staffing-drawer-title">
      <header className={`v11DrawerHead ${venueColourClass(shift.venue_id)}`}><div><span>Staffing Intelligence</span><h2 id="staffing-drawer-title">{shift.class_name}</h2><p>{new Date(`${shift.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})} · {shift.start_time.slice(0,5)}–{shift.finish_time.slice(0,5)}</p><div><b>{staffingRole==="lead"?"Lead Coach":"Assistant Coach"}</b><small>{venueName(shift.venue_id)} · {assignedCount} of {totalSlots} coaches assigned</small></div></div><button className="iconButton" type="button" aria-label="Close staffing recommendations" onClick={()=>{setStaffingRecommendationShift(null);setStaffingQualificationContext(null)}}>×</button></header>
      <div className="v11DrawerBody"><div className="v420CoachSearch"><span aria-hidden="true">⌕</span><input type="search" value={coachAssignmentSearch} onChange={event=>setCoachAssignmentSearch(event.target.value)} placeholder="Search coaches..." aria-label="Search coaches"/></div>
        {!fullyPreferred&&<div className="notice">No coach fully meets your preferred criteria. All available coaches remain assignable.</div>}
        {coachRows.map((row,index)=><div className="v11RecommendationWrap" key={row.coach.id}>{index===1&&<h3 className="v11OtherCoaches">Other Coaches</h3>}<article className={`v11RecommendationCard ${index===0?"best":""} ${row.state.state!=="available"?"warning":""} ${shift.profile_id===row.coach.id?"selected":""}`}>{index===0&&<div className="v11BestLabel">Best recommendation</div>}<div className="v11RecommendationHead"><div className="v11CoachAvatar">{initials(row.coach.full_name)}</div><div><h3>{row.coach.full_name}</h3><span>{shift.profile_id===row.coach.id?"Currently assigned · ":""}{row.matchLabel}</span></div><div><small>Estimated cost</small><strong>£{row.result.estimatedStaffingCost.toFixed(2)}</strong></div></div>
          <div className={`v11Availability ${row.state.state==="available"?"available":"unavailable"}`}>{row.state.state==="available"?"✓ Available":`⚠ ${row.state.label}`}</div>
          {row.recommendedQualificationId&&<div className={`v11QualificationStatus ${row.meetsQualification?"met":"unmet"}`}><strong>{row.meetsQualification?"✓ Meets recommended qualification":"⚠ Below recommended qualification"}</strong><span>Recommended: {row.recommendedQualificationName||row.recommendedQualificationId}</span></div>}
          {employmentRecordsAvailable&&!row.input.hasEmploymentRecord&&<div className="v11Conflict"><strong>⚠ No employment record for this shift date</strong><span>The coach remains assignable; add employment terms in People.</span></div>}
          {row.conflict&&<div className="v11Conflict"><strong>⚠ Already coaching another session</strong><span>{row.conflict.start_time.slice(0,5)}–{row.conflict.finish_time.slice(0,5)} · {row.conflict.class_name}</span></div>}
          <details className="v11Why"><summary>Why?</summary><div><span className={row.state.state==="available"?"positive":"warning"}>{row.state.state==="available"?"✓ Available for this session":"⚠ Not available for this session"}</span>{row.input.exactSessionCount? <span className="positive">✓ Usually coaches this session<br/><small>Completed this session {row.input.exactSessionCount} time{row.input.exactSessionCount===1?"":"s"}</small></span>:row.input.sameProgrammeSessionCount?<span className="positive">✓ Has coached {row.input.programmeName} before<br/><small>Completed {row.input.sameProgrammeSessionCount} {row.input.programmeName} session{row.input.sameProgrammeSessionCount===1?"":"s"}</small></span>:null}{recommendedQualification&&<span className={row.meetsQualification?"positive":"warning"}>{row.meetsQualification?"✓ Meets the recommended qualification":"⚠ Below the recommended qualification"}</span>}{row.lowerCost&&<span className="positive">✓ Lower staffing cost than several alternatives</span>}</div></details>
          <button className={`btn ${row.state.state==="available"?"btnPrimary":"btnAccent"}`} type="button" disabled={shift.status==="cancelled"||shift.status==="confirmed"} onClick={()=>void assign(row.coach.id)}>{row.state.state==="available"?`Assign ${staffingRole==="lead"?"Lead":"Assistant"}`:"Assign Anyway"}</button>
        </article></div>)}
        {!coachRows.length&&<div className="empty">No coaches match your search.</div>}
      </div>
    </aside></div>;
  }

  function AdminScheduleShiftModal(){
    const s=adminScheduleShift!;
    return <div className="modalBackdrop"><div className="modal v311AdminShiftModal v405ScheduleControlModal">
      <div className={`v311AdminShiftHero ${venueColourClass(s.venue_id)}`}>
        <div><span>Schedule control</span><h2>{s.class_name}</h2><p>{new Date(`${s.shift_date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})} · {s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</p></div>
        <button className="iconButton" onClick={()=>setAdminScheduleShift(null)}>×</button>
      </div>
      <div className="modalBody v405ScheduleControlBody">
        <div className="v11AssignedPrimaryActions">
          {s.status==="scheduled"&&s.profile_id&&<button className="btn btnPrimary" type="button" onClick={async()=>{await confirmScheduled(s);setAdminScheduleShift(null)}}>Confirm Worked</button>}
          {eligibleDailyConfirmations(s.shift_date).length>0&&<button className="btn btnPrimary" type="button" onClick={()=>{setAdminScheduleShift(null);openDailyConfirmation(s.shift_date)}}>✓ Confirm Selected Day</button>}
          <button className="btn btnSecondary" type="button" disabled={s.status==="cancelled"||s.status==="confirmed"} onClick={()=>{setAdminScheduleShift(null);setCoachAssignmentSearch("");openStaffingRecommendations(s)}}>Reassign Coach</button>
        </div>
        <div className="v311ShiftSummary"><div><span>Planned hours</span><strong>{scheduleHours(s).toFixed(2)}h</strong></div><div><span>Status</span><strong className={`scheduleStatus ${s.status}`}>{s.adjustment_status==="pending"?"Approval pending":s.status}</strong></div></div>
        {!s.class_id&&<div className="v518OneOffActions"><span>One-off shift</span><button className="btn btnSecondary" type="button" disabled={s.status==="confirmed"} title={s.status==="confirmed"?"Unconfirm this shift before editing its planned details.":undefined} onClick={()=>{setAdminScheduleShift(null);setOneOffShiftModal({id:s.id,venue_id:s.venue_id,shift_date:s.shift_date,start_time:s.start_time.slice(0,5),finish_time:s.finish_time.slice(0,5),class_name:s.class_name,notes:s.notes||"",profile_id:s.profile_id||""})}}>Edit details</button><button className="btn btnDanger" type="button" onClick={()=>void deleteOneOffShift(s)}>Delete shift</button></div>}
        <div className="v11AssignedCoach"><span>Assigned coach</span><strong>{validAssignedProfile(s.profile_id)?.full_name||"Unassigned"}</strong>{isAssignedShift(s)&&<small>{coachAssignmentState(s.profile_id!,s).label}</small>}<button type="button" className="v400Unassign" disabled={!isAssignedShift(s)||s.status==="cancelled"||s.status==="confirmed"} onClick={async()=>{await reassignScheduledWithAvailability(s,"");setAdminScheduleShift(null)}}>Remove Coach</button></div>
        <div className="v11ShiftManagementDetails"><div><span>Notes</span><strong>{s.notes?.trim()||"No notes"}</strong></div><div><span>Payroll</span><strong>{s.status==="confirmed"?"Included in confirmed hours":"Included when work is confirmed"}</strong></div></div>
        {s.class_id&&<div className="v311RemoveOccurrence">
          <strong>Remove from this date</strong>
          <p>Completely removes this class occurrence from this day only. It will not change the Master Timetable, previous months or future months.</p>
          <button className="btn btnDanger" disabled={s.status==="confirmed"} onClick={()=>removeScheduledOccurrence(s)}>Remove this occurrence</button>
          {s.status==="confirmed"&&<small>Unconfirm the shift before removing it.</small>}
        </div>}
      </div>
      <div className="modalFoot v405ScheduleControlFoot"><div className="v311AdminActions">
        {s.adjustment_status==="pending"&&<button className="btn btnAccent" onClick={async()=>{await approveRotaAdjustment(s);setAdminScheduleShift(null)}}>Approve extra time</button>}
        {s.status==="confirmed"&&<button className="btn btnSecondary" onClick={async()=>{await unconfirmScheduled(s);setAdminScheduleShift(null)}}>Unconfirm</button>}
        {s.status!=="confirmed"&&<button className={`btn ${s.status==="cancelled"?"btnSecondary":"btnDanger"}`} onClick={()=>toggleScheduledCancelled(s)}>{s.status==="cancelled"?"Restore session":"Cancel session"}</button>}
        {s.status!=="confirmed"&&<button className="btn btnSecondary" onClick={()=>{setAdminScheduleShift(null);openAdjustment(s)}}>Edit actual time</button>}
      </div></div>
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

  function DailyConfirmationModal(){
    const review=dailyConfirmation!;
    const person=review.profileId?(profileById(review.profileId)||(review.profileId===initialProfile.id?initialProfile:null)):null;
    const eligible=eligibleDailyConfirmations(review.date,review.profileId).sort((a,b)=>a.start_time.localeCompare(b.start_time));
    const selected=eligible.filter(shift=>review.selectedIds.includes(shift.id));
    const employmentFor=(shift:ScheduledShift)=>allEmploymentRecords
      .filter(record=>record.profile_id===shift.profile_id&&record.active&&record.effective_from<=review.date&&(!record.effective_to||record.effective_to>=review.date))
      .sort((a,b)=>b.effective_from.localeCompare(a.effective_from))[0];
    const employmentTypeFor=(shift:ScheduledShift)=>employmentFor(shift)?.employment_type||profileById(shift.profile_id)?.employment_type||"hourly";
    const rateFor=(shift:ScheduledShift)=>{const employment=employmentFor(shift),shiftPerson=profileById(shift.profile_id);return shift.payment_type==="volunteer"?0:shift.payment_type==="enhanced"?Number(employment?.enhanced_rate??shiftPerson?.enhanced_rate??shiftPerson?.hourly_rate??0):Number(employment?.standard_rate??shiftPerson?.standard_rate??shiftPerson?.hourly_rate??0)};
    const expectedPay=(shift:ScheduledShift)=>employmentTypeFor(shift)==="hourly"?scheduleHours(shift)*rateFor(shift):0;
    const totalHours=selected.reduce((total,shift)=>total+scheduleHours(shift),0);
    const totalEarnings=selected.reduce((total,shift)=>total+expectedPay(shift),0);
    const scopedEmploymentType=review.profileId&&eligible.length?employmentTypeFor(eligible[0]):null;
    const toggle=(id:string)=>setDailyConfirmation({...review,selectedIds:review.selectedIds.includes(id)?review.selectedIds.filter(item=>item!==id):[...review.selectedIds,id]});
    return <div className="modalBackdrop"><div className="modal modalWide v13DailyConfirmModal">
      <div className="modalHead"><div><span className="v3WelcomeEyebrow">Daily confirmation</span><h2>{review.profileId===initialProfile.id&&review.date===localDateKey()?"Confirm Today’s Work":"Confirm Selected Day"}</h2><p className="muted">{person?.full_name||"All staff"} · {new Date(`${review.date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p></div><button className="iconButton" type="button" onClick={()=>setDailyConfirmation(null)}>×</button></div>
      <div className="modalBody v13DailyConfirmBody">
        {eligible.length?<div className="v13ConfirmationRows">{eligible.map(shift=>{const paymentType=shift.payment_type||"standard",hours=scheduleHours(shift),employmentType=employmentTypeFor(shift),shiftPerson=profileById(shift.profile_id);return <label className={`v13ConfirmationRow ${review.selectedIds.includes(shift.id)?"selected":""}`} key={shift.id}><input type="checkbox" checked={review.selectedIds.includes(shift.id)} onChange={()=>toggle(shift.id)}/><div><strong>{shift.class_name}</strong><span>{venueName(shift.venue_id)}{!review.profileId&&shiftPerson?` · ${shiftPerson.full_name}`:""}</span></div><time>{shift.start_time.slice(0,5)}–{shift.finish_time.slice(0,5)}</time><span className={`v13PaymentType ${paymentType}`}>{paymentType.replace(/^./,letter=>letter.toUpperCase())}</span><b>{hours.toFixed(2)}h</b><strong>{employmentType==="salaried"?"Salary Included":employmentType==="hourly"?money(expectedPay(shift)):"Volunteer"}</strong></label>})}</div>:<div className="empty">No shifts require confirmation.</div>}
        <div className="v13ConfirmationTotals"><div><span>Total Shifts</span><strong>{selected.length}</strong></div><div><span>Total Hours</span><strong>{totalHours.toFixed(2)}h</strong></div><div><span>{scopedEmploymentType==="salaried"?"Pay":scopedEmploymentType==="volunteer"?"Payment":"Estimated Hourly Earnings"}</span><strong>{scopedEmploymentType==="salaried"?"Salary Included":scopedEmploymentType==="volunteer"?"Volunteer":money(totalEarnings)}</strong></div></div>
      </div>
      <div className="modalFoot"><button className="btn btnSecondary" type="button" onClick={()=>setDailyConfirmation(null)}>Cancel</button><button className="btn btnPrimary" type="button" disabled={saving||selected.length===0} onClick={()=>void confirmDailySelection()}>{saving?"Confirming…":`Confirm ${selected.length||"Selected"} Shift${selected.length===1?"":"s"}`}</button></div>
    </div></div>;
  }

  function AdjustmentModal(){
    const s=adjustShift!;
    const planned=scheduleHours(s);
    const actual=shiftHours({coach_id:s.profile_id||"",shift_date:s.shift_date,start_time:adjustStart,finish_time:adjustFinish,break_minutes:adjustBreak,session_location:s.class_name,notes:null});
    const more=actual>planned+0.001;
    return <div className="modalBackdrop"><div className="modal"><div className="modalHead"><h2>Confirm actual time</h2><button className="iconButton" onClick={()=>setAdjustShift(null)}>×</button></div><div className="modalBody"><div className="notice">Scheduled: <strong>{s.start_time.slice(0,5)}–{s.finish_time.slice(0,5)}</strong> · {planned.toFixed(2)} hours</div><div className="grid grid2"><div className="field"><label>Actual start</label><input type="time" value={adjustStart} onChange={e=>setAdjustStart(e.target.value)}/></div><div className="field"><label>Actual finish</label><input type="time" value={adjustFinish} onChange={e=>setAdjustFinish(e.target.value)}/></div></div><div className="field"><label>Break minutes</label><input type="number" min={0} value={adjustBreak} onChange={e=>setAdjustBreak(Number(e.target.value))}/></div>{more&&!isAdmin&&<><div className="notice">This is <strong>more</strong> than the scheduled time, so it will be sent to an admin for approval.</div><div className="field"><label>Reason for extra time</label><textarea value={adjustReason} onChange={e=>setAdjustReason(e.target.value)} placeholder="e.g. class ran late, parent discussion, extra cover"/></div></>}{!more&&<div className="notice success">This is the same or less than scheduled, so you can confirm it immediately.</div>}</div><div className="modalFoot"><span/><div className="row"><button className="btn btnSecondary" onClick={()=>setAdjustShift(null)}>Cancel</button><button className="btn btnPrimary" onClick={submitRotaActual}>{more&&!isAdmin?"Send for approval":"Confirm actual time"}</button></div></div></div></div>
  }

  function MasterTimetablePanel(){
    const panelDayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const masterTimetableClasses=showArchivedClasses?[...classes,...archivedClasses]:classes;
    const closePanel=()=>{setMasterTimetableOpen(false);setMasterTimetableDay(null)};
    return <div className="v510MasterOverlay" role="presentation">
      <aside className="v510MasterPanel" role="dialog" aria-modal="true" aria-labelledby="master-timetable-title">
        <div className="v510MasterPanelHandle" aria-label="Swipe down to close master timetable"
          onTouchStart={e=>{masterTimetableTouchY.current=e.touches[0]?.clientY??null}}
          onTouchCancel={()=>{masterTimetableTouchY.current=null}}
          onTouchEnd={e=>{const start=masterTimetableTouchY.current,end=e.changedTouches[0]?.clientY;masterTimetableTouchY.current=null;if(start!==null&&end!==undefined&&end-start>90)closePanel()}}><span/></div>
        <header className="v510MasterPanelHead"><div><span>Schedule configuration</span><h2 id="master-timetable-title">Weekly Master Timetable</h2><p>Configure recurring weekly classes.</p></div><div className="v12MasterHeadActions"><label className="v12ArchiveToggle"><input type="checkbox" checked={showArchivedClasses} onChange={event=>setShowArchivedClasses(event.target.checked)}/> Show Archived Classes</label><div className="row"><button className="btn btnPrimary" type="button" onClick={()=>openNewClass(masterTimetableDay??1)}><PlusIcon/>Create Class</button><button className="iconButton" type="button" aria-label="Close master timetable" onClick={closePanel}>×</button></div></div></header>
        <div className="v510MasterPanelBody">
          {[1,2,3,4,5,6,0].map(day=>{
            const dayClasses=masterTimetableClasses.filter(c=>(!scheduleFilter||c.venue_id===scheduleFilter)&&c.weekday===day).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.name.localeCompare(b.name));
            const expanded=masterTimetableDay===day;
            const hours=dayClasses.reduce((total,c)=>total+classTemplateHours(c),0);
            return <section className={`v510MasterDay ${expanded?"expanded":""}`} key={day}>
              <button className="v510MasterDayHead" type="button" aria-expanded={expanded} onClick={()=>setMasterTimetableDay(expanded?null:day)}><span><strong>{panelDayNames[day]}</strong><small>{dayClasses.length} {dayClasses.length===1?"class":"classes"} • {hours.toFixed(2)}h</small></span><b aria-hidden="true">⌄</b></button>
              {expanded&&<div className="v510MasterDayContent"><button className="btn btnPrimary v510AddClass" type="button" onClick={()=>openNewClass(day)}><PlusIcon/>Create Class</button>
                {dayClasses.map(c=>{const slots=classSlots.filter(x=>x.class_id===c.id).sort((a,b)=>a.slot_number-b.slot_number);const assigned=slots.map(x=>profileById(x.default_profile_id)?.full_name).filter(Boolean);return <article className={`v510MasterClass ${c.active?"":"v12ArchivedClass"}`} style={{borderLeftColor:c.session_colour||"#6D3A91"}} key={c.id}><time>{c.start_time.slice(0,5)}–{c.finish_time.slice(0,5)}</time><h3>{c.name}{!c.active&&<span className="v12ArchivedBadge">Archived</span>}</h3><div className={assigned.length?"assigned":"unassigned"}><small>Assigned</small><strong>{assigned.length?assigned.join(" · "):"Unassigned"}</strong></div><div className="v12ClassCardActions"><button className="btn btnPrimary" type="button" onClick={()=>openEditClass(c)}>Edit</button><ClassMoreActions classItem={c}/></div></article>})}
                {!dayClasses.length&&<div className="v510MasterEmpty"><strong>No regular classes</strong><span>Add the first recurring class for {panelDayNames[day]}.</span></div>}
              </div>}
            </section>;
          })}
        </div>
      </aside>
    </div>;
  }

  function OneOffShiftModal(){
    const d=oneOffShiftModal!;
    const eligible=staffOptionsForVenue(d.venue_id);
    return <div className="modalBackdrop"><div className="modal">
      <div className="modalHead"><div><h2>{d.id?"Edit one-off shift":"Add one-off shift"}</h2><p className="muted">A single dated session. This does not change Master TT.</p></div><button className="iconButton" type="button" onClick={()=>setOneOffShiftModal(null)}>×</button></div>
      <div className="modalBody"><div className="field"><label>Date</label><input type="date" value={d.shift_date} onChange={e=>setOneOffShiftModal({...d,shift_date:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Start time</label><input type="time" value={d.start_time} onChange={e=>setOneOffShiftModal({...d,start_time:e.target.value})}/></div><div className="field"><label>Finish time</label><input type="time" value={d.finish_time} onChange={e=>setOneOffShiftModal({...d,finish_time:e.target.value})}/></div></div><div className="field"><label>Shift / class name</label><input value={d.class_name} onChange={e=>setOneOffShiftModal({...d,class_name:e.target.value})} placeholder="e.g. Holiday training"/></div><div className="field"><label>Description <span className="muted">(optional)</span></label><textarea value={d.notes} onChange={e=>setOneOffShiftModal({...d,notes:e.target.value})} placeholder="Session details or coaching notes"/></div><div className="field"><label>Coach <span className="muted">(optional)</span></label><select value={d.profile_id} onChange={e=>setOneOffShiftModal({...d,profile_id:e.target.value})}><option value="">Unassigned</option>{eligible.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div></div>
      <div className="modalFoot"><span/><div className="row"><button className="btn btnSecondary" type="button" onClick={()=>setOneOffShiftModal(null)}>Cancel</button><button className="btn btnPrimary" type="button" disabled={saving||!d.venue_id||!d.shift_date||!d.start_time||!d.finish_time||!d.class_name.trim()} onClick={()=>void saveOneOffShift()}>{saving?"Saving…":d.id?"Save changes":"Save shift"}</button></div></div>
    </div></div>;
  }

  function ClassModal(){
    const d=classModal!;
    const dayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const occurrences=d.occurrences?.length?d.occurrences:[blankClassOccurrence(d.weekday,d.venue_id)];
    const copyLibrary=includeArchivedClassCopies?[...classes,...archivedClasses]:classes;
    const copyOptions=copyLibrary.filter((item,index,list)=>list.findIndex(candidate=>item.class_profile_id?candidate.class_profile_id===item.class_profile_id:candidate.venue_id===item.venue_id&&candidate.name===item.name)===index&&item.name.toLocaleLowerCase().includes(classCopySearch.trim().toLocaleLowerCase()));
    const sessionLengthMinutes=(()=>{const first=occurrences[0];const[startHour,startMinute]=first.start_time.split(":").map(Number),[finishHour,finishMinute]=first.finish_time.split(":").map(Number);let minutes=finishHour*60+finishMinute-startHour*60-startMinute;if(minutes<=0)minutes+=1440;return minutes})();
    const setSessionLength=(minutes:number)=>setClassModal({...d,occurrences:occurrences.map(o=>{const[hour,minute]=o.start_time.split(":").map(Number),finish=(hour*60+minute+minutes)%1440;return{...o,finish_time:`${String(Math.floor(finish/60)).padStart(2,"0")}:${String(finish%60).padStart(2,"0")}`}})});
    const setStaffingProfile=(patch:Partial<ClassDraft>)=>{
      const next={...d,...patch};
      const total=Math.max(1,Number(next.lead_coaches_required)+Number(next.assistant_coaches_required));
      setClassModal({...next,minimum_coaches:Math.min(Math.max(0,next.minimum_coaches),next.maximum_coaches),occurrences:occurrences.map(o=>({...o,coaches_required:total,coach_ids:[...o.coach_ids].slice(0,total)}))});
    };

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
    const sourceClass=[...classes,...archivedClasses].find(c=>c.id===d.id);
    const archiveMasterClass=async()=>{
      if(!sourceClass)return;
      await archiveClass(sourceClass);setClassModal(null);
    };
    const restoreMasterClass=async()=>{if(!sourceClass)return;await restoreClass(sourceClass);setClassModal(null)};
    const deleteMasterClass=async()=>{
      if(!sourceClass)return;await permanentlyDeleteClass(sourceClass);
    };

    return <div className="modalBackdrop"><div className="modal modalWide">
      <div className="modalHead"><div><h2>{d.id?"Class Profile":"Create Class"}</h2><p className="muted">{d.id?"Edit the shared profile and its recurring timetable.":"Create one profile with one or more recurring sessions."}</p></div><button className="iconButton" onClick={()=>setClassModal(null)}>×</button></div>
      <div className="modalBody">
        {classWizardStep===0&&<div className="v12CreateSource"><div className="formSectionTitle"><h3>Create from</h3><p>Start empty or copy an existing Class Profile into this same wizard.</p></div><div className="grid grid2"><button className="checkCard v12CreateChoice" type="button" onClick={()=>setClassWizardStep(1)}><span><strong>Blank Class</strong><small>Start with an empty Class Profile.</small></span></button><div className="v12CopyExisting"><strong>Copy Existing Class</strong><label className="v12ArchiveToggle"><input type="checkbox" checked={includeArchivedClassCopies} onChange={event=>setIncludeArchivedClassCopies(event.target.checked)}/> Include Archived Classes</label><div className="searchBar"><SearchIcon/><input value={classCopySearch} onChange={event=>setClassCopySearch(event.target.value)} placeholder="Search Class Profiles…"/></div><div>{copyOptions.map(item=><button type="button" key={item.id} onClick={()=>duplicateClassGroup(item)}><span style={{background:item.session_colour||"#6D3A91"}}/><b>{item.name}{!item.active&&<em className="v12ArchivedBadge">Archived</em>}</b><small>{item.programme||"Class Profile"}</small></button>)}{!copyOptions.length&&<p className="muted">No matching Class Profiles.</p>}</div></div></div></div>}
        {classWizardStep>0&&<><div className="v12WizardProgress"><span>1 General</span><span>2 Staffing</span><span>3 Qualifications</span><span>4 Intelligence</span><span>5 Timetable</span></div>
        <div className="formSectionTitle"><h3>1. General</h3><p>The shared profile used by every weekly session.</p></div>
        <div className="grid grid2">
          <div className="field"><label>Class Name</label><input value={d.name} onChange={e=>setClassModal({...d,name:e.target.value})} placeholder="e.g. Champ Tots"/></div>
          <div className="field"><label>Programme <span className="muted">(optional)</span></label><input value={d.programme} onChange={e=>setClassModal({...d,programme:e.target.value})} placeholder="e.g. Recreational Trampoline"/></div>
          <div className="field"><label>Session Colour</label><input type="color" value={d.session_colour} onChange={e=>setClassModal({...d,session_colour:e.target.value.toUpperCase()})}/></div>
          <div className="field"><label>Session Length (minutes)</label><input type="number" min={1} max={1440} value={sessionLengthMinutes} onChange={e=>setSessionLength(Math.max(1,Number(e.target.value)||1))}/></div>
          <div className="field"><label>Capacity</label><input type="number" min={1} required value={d.capacity??""} onChange={e=>setClassModal({...d,capacity:e.target.value?Math.max(1,Number(e.target.value)):null})}/></div>
          <div className="field"><label>Minimum Age <span className="muted">(optional)</span></label><input type="number" min={0} value={d.minimum_age??""} onChange={e=>setClassModal({...d,minimum_age:e.target.value?Math.max(0,Number(e.target.value)):null})}/></div>
          <div className="field"><label>Maximum Age <span className="muted">(optional)</span></label><input type="number" min={0} value={d.maximum_age??""} onChange={e=>setClassModal({...d,maximum_age:e.target.value?Math.max(0,Number(e.target.value)):null})}/></div>
          <label className="checkCard"><input type="checkbox" checked={d.active} onChange={e=>setClassModal({...d,active:e.target.checked})}/><span><strong>Active</strong><small>Inactive classes remain saved but are not scheduled.</small></span></label>
        </div>

        <div className="v12ClassProfileSections">
          <div className="formSectionTitle"><h3>2. Staffing</h3><p>These requirements apply to every recurring session.</p></div>
          <div className="grid grid2"><div className="field"><label>Lead Coaches Required</label><input type="number" min={0} max={12} value={d.lead_coaches_required} onChange={e=>setStaffingProfile({lead_coaches_required:Math.max(0,Number(e.target.value)||0)})}/></div><div className="field"><label>Assistant Coaches Required</label><input type="number" min={0} max={12} value={d.assistant_coaches_required} onChange={e=>setStaffingProfile({assistant_coaches_required:Math.max(0,Number(e.target.value)||0)})}/></div><div className="field"><label>Minimum Coaches</label><input type="number" min={0} max={24} value={d.minimum_coaches} onChange={e=>setClassModal({...d,minimum_coaches:Math.max(0,Math.min(Number(e.target.value)||0,d.maximum_coaches))})}/></div><div className="field"><label>Maximum Coaches</label><input type="number" min={d.minimum_coaches} max={24} value={d.maximum_coaches} onChange={e=>setClassModal({...d,maximum_coaches:Math.max(d.minimum_coaches,Number(e.target.value)||0)})}/></div></div>
          <div className="formSectionTitle"><h3>3. Qualification Recommendations</h3></div>
          <div className="grid grid2"><div className="field"><label>Lead Qualification</label><select value={d.lead_recommended_qualification_id} onChange={e=>setClassModal({...d,lead_recommended_qualification_id:e.target.value})}><option value="">No recommendation</option>{selectableQualifications(d.lead_recommended_qualification_id).map(q=><option key={q.id} value={q.id} disabled={!q.active}>{q.name}{q.active?"":" (Inactive)"}</option>)}</select></div><div className="field"><label>Assistant Qualification</label><select value={d.assistant_recommended_qualification_id} onChange={e=>setClassModal({...d,assistant_recommended_qualification_id:e.target.value})}><option value="">No recommendation</option>{selectableQualifications(d.assistant_recommended_qualification_id).map(q=><option key={q.id} value={q.id} disabled={!q.active}>{q.name}{q.active?"":" (Inactive)"}</option>)}</select></div></div>
          <div className="formSectionTitle"><h3>4. Staffing Intelligence</h3></div>
          <div className="checkGrid"><label className="checkCard"><input type="checkbox" checked={d.warn_if_understaffed} onChange={e=>setClassModal({...d,warn_if_understaffed:e.target.checked})}/><span><strong>Warn if understaffed</strong></span></label><label className="checkCard"><input type="checkbox" checked={d.critical_if_no_lead} onChange={e=>setClassModal({...d,critical_if_no_lead:e.target.checked})}/><span><strong>Critical if no Lead Coach</strong></span></label><label className="checkCard"><input type="checkbox" checked={d.allow_below_recommended_qualification} onChange={e=>setClassModal({...d,allow_below_recommended_qualification:e.target.checked})}/><span><strong>Allow assignment below recommended qualification</strong></span></label></div>
        </div>

        <div className="formSectionTitle"><h3>5. Recurring Timetable</h3><p>Add as many days as you need. Each occurrence can have a different day, time and default coaching team.</p></div>

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
              <div className="field"><label>Venue</label><select value={o.venue_id} onChange={e=>updateOccurrence(o.key,{venue_id:e.target.value,coach_ids:[]})}>{adminVenues().map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></div>
              <div className="field"><label>Break minutes</label><input type="number" min={0} value={o.break_minutes} onChange={e=>updateOccurrence(o.key,{break_minutes:Number(e.target.value)})}/></div>

              <div className="grid grid2">{Array.from({length:o.coaches_required},(_,i)=><div className="field" key={i}><label>{i<d.lead_coaches_required?`Default Lead Coach ${i+1}`:`Default Assistant Coach ${i-d.lead_coaches_required+1}`}</label><select value={ids[i]||""} onChange={e=>{const next=[...ids];next[i]=e.target.value;updateOccurrence(o.key,{coach_ids:next})}}><option value="">Unassigned</option>{staffOptionsForVenue(o.venue_id).map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>)}</div>
              <div className="field"><label>Session notes</label><input value={o.notes} onChange={e=>updateOccurrence(o.key,{notes:e.target.value})} placeholder="Optional"/></div>
            </div>
          })}
        </div>

        <button className="btn btnSecondary" type="button" onClick={addOccurrence}><PlusIcon/>Add recurring session</button></>}
      </div>
      <div className="modalFoot v510ClassModalFoot"><div className="v510ClassManagement">{d.id&&sourceClass&&<button className="btn btnSecondary" type="button" onClick={()=>duplicateClassGroup(sourceClass)}>Duplicate Class</button>}{d.id&&sourceClass?.active&&<button className="btn btnSecondary" type="button" onClick={()=>void archiveMasterClass()}>Archive</button>}{d.id&&sourceClass&&!sourceClass.active&&<button className="btn btnSecondary" type="button" onClick={()=>void restoreMasterClass()}>Restore</button>}{d.id&&<button className="btn btnDanger" type="button" onClick={()=>void deleteMasterClass()}>Delete</button>}</div><div className="row"><button className="btn btnSecondary" onClick={()=>setClassModal(null)}>Cancel</button>{classWizardStep>0&&<button className="btn btnPrimary" disabled={saving||!d.name.trim()||!d.capacity||!d.venue_id||!occurrences.length} onClick={saveClass}>{saving?"Saving…":d.id?"Save Class Profile":"Create Class"}</button>}</div></div>
    </div></div>;
  }

  function TemplateModal(){
    const dayNames=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return <div className="modalBackdrop"><div className="modal"><div className="modalHead"><h2>Regular shifts</h2><button className="iconButton" onClick={()=>setTemplateOpen(false)}>×</button></div><div className="modalBody"><p className="muted">Save your normal weekly sessions once, then use <strong>Fill month</strong> to add the whole month in one tap.</p><div className="templateList">{templates.map(t=><div className="templateRow" key={t.id}><div><strong>{dayNames[t.weekday]} · {t.start_time.slice(0,5)}–{t.finish_time.slice(0,5)}</strong><span>{venueName(t.venue_id)} · {t.session_location||"Coaching"}</span></div><button className="btn btnDanger" onClick={()=>deleteTemplate(t)}>Delete</button></div>)}{!templates.length&&<div className="empty">No regular shifts saved yet.</div>}</div><button className="btn btnSecondary" onClick={addTemplate}><PlusIcon/>Add regular shift</button></div><div className="modalFoot"><span/><div className="row">{templates.length>0&&<button className="btn btnAccent" onClick={()=>{void fillMonthFromTemplates();setTemplateOpen(false)}}>Fill {monthLabel(month)}</button>}<button className="btn btnPrimary" onClick={()=>setTemplateOpen(false)}>Done</button></div></div></div></div>
  }

  function ShiftModal(){
    return <div className="modalBackdrop"><div className="modal"><div className="modalHead"><h2>{shiftModal?.id?(shiftModal.approval_status==="pending"?"Review extra shift":"Edit shift"):"Add extra shift"}</h2><button className="iconButton" onClick={()=>setShiftModal(null)}>×</button></div><div className="modalBody"><div className="field"><label>Date</label><input type="date" value={shiftModal!.shift_date} onChange={e=>setShiftModal({...shiftModal!,shift_date:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Start</label><input type="time" value={shiftModal!.start_time.slice(0,5)} onChange={e=>setShiftModal({...shiftModal!,start_time:e.target.value})}/></div><div className="field"><label>Finish</label><input type="time" value={shiftModal!.finish_time.slice(0,5)} onChange={e=>setShiftModal({...shiftModal!,finish_time:e.target.value})}/></div></div><div className="field"><label>Break (minutes)</label><input type="number" min={0} value={shiftModal!.break_minutes} onChange={e=>setShiftModal({...shiftModal!,break_minutes:Number(e.target.value)})}/></div><div className="field"><label>Session / group</label><input value={shiftModal!.session_location||""} onChange={e=>setShiftModal({...shiftModal!,session_location:e.target.value})} placeholder="e.g. competition, camp, meeting, cover"/></div><div className="field"><label>Notes</label><textarea value={shiftModal!.notes||""} onChange={e=>setShiftModal({...shiftModal!,notes:e.target.value})}/></div></div><div className="modalFoot"><div>{shiftModal?.id&&<button className="btn btnDanger" onClick={deleteShift}>Delete shift</button>}</div><div className="row">{isAdmin&&shiftModal?.id&&shiftModal.approval_status==="pending"&&<><button className="btn btnDanger" onClick={()=>rejectExtraShift(shiftModal)}>Reject</button><button className="btn btnAccent" onClick={()=>approveExtraShift(shiftModal)}>Approve</button></>}<button className="btn btnSecondary" onClick={()=>setShiftModal(null)}>Cancel</button>{(!isAdmin||shiftModal?.approval_status!=="pending")&&<button className="btn btnPrimary" onClick={saveShift}>{isAdmin?"Save shift":"Send for approval"}</button>}</div></div></div></div>
  }

  function InviteModal(){
    return <div className="modalBackdrop"><form className="modal v323CreateAccount" onSubmit={sendInvite}><div className="modalHead"><div><h2>Create staff member</h2><p className="muted" style={{margin:"4px 0 0",fontSize:11}}>Save their profile, with optional portal access.</p></div><button type="button" className="iconButton" onClick={()=>setInviteOpen(false)}>×</button></div><div className="modalBody">
      <div className="field"><label>Full name</label><input value={invite.name} onChange={e=>setInvite({...invite,name:e.target.value})} required/></div>
      <label className="v321ForceCheck"><input type="checkbox" checked={invite.portalAccess} onChange={e=>setInvite({...invite,portalAccess:e.target.checked})}/><span><strong>Create portal access</strong><small>Give this person a username and temporary password.</small></span></label>
      {invite.portalAccess&&<><div className="field"><label>Username</label><div className="v323UsernameInput"><span>@</span><input autoCapitalize="none" autoCorrect="off" value={invite.username} onChange={e=>setInvite({...invite,username:e.target.value.toLowerCase().replace(/\s+/g,"")})} placeholder="e.g. gabby" required/></div><div className="fieldHint">3–32 characters. Letters, numbers, dots, dashes and underscores.</div></div>
      <div className="field"><div className="v323FieldAction"><label>Temporary password</label><button className="v3TextButton" type="button" onClick={generateInvitePassword}>Generate password</button></div><input type="text" autoComplete="off" value={invite.password} onChange={e=>setInvite({...invite,password:e.target.value})} placeholder="Minimum 8 characters" required/><div className="fieldHint">Password change is required after their first login.</div></div></>}
      <div className="field"><label>Recovery email <span className="muted">(optional)</span></label><input type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})} placeholder="Can be added later"/><div className="fieldHint">Only used for password recovery and contact. It is not their username.</div></div>
      <div className="grid grid2"><div className="field"><label>Account type</label><select value={inviteRole} onChange={e=>setInviteRole(e.target.value as any)} disabled={!isGlobalAdmin}><option value="coach">Coach</option>{isGlobalAdmin&&<option value="org_admin">Club administrator</option>}</select></div><div className="field"><label>Hourly rate</label><input type="number" min={0} step="0.01" value={invite.rate} onChange={e=>setInvite({...invite,rate:e.target.value})} required/></div></div>

    </div><div className="modalFoot"><span/><button className="btn btnPrimary" disabled={saving||!invite.name.trim()||(invite.portalAccess&&(!invite.username.trim()||invite.password.length<8))}>{saving?"Creating…":"Create staff"}</button></div></form></div>
  }

  function EmploymentRecordsPanel(){
    const current=employmentRecords.filter(record=>record.active&&!record.effective_to);
    const historic=employmentRecords.filter(record=>!record.active||record.effective_to);
    const d=employmentRecordDraft;
    return <div className="v12Records"><div className="sectionHeader"><div><h3>Employment History</h3><p>Dated employment terms preserve employment history.</p></div><button className="btn btnPrimary" type="button" onClick={()=>setEmploymentRecordDraft(newEmploymentDraft())}>Add Employment</button></div><div className="v12RecordList">{current.map(record=><article className="v12RecordCard current" key={record.id}><div><span>Current employment</span><strong>{record.employment_type.replace(/^./,letter=>letter.toUpperCase())}</strong><small>Effective from {dateText(record.effective_from)}</small></div><div><b>{record.employment_type==="salaried"?`${money(Number(record.annual_salary||0))} salary`:record.employment_type==="volunteer"?"Volunteer only":`${money(Number(record.standard_rate))}/hour`}</b><button className="btn btnSecondary" type="button" onClick={()=>setEmploymentRecordDraft(newEmploymentDraft(record))}>Edit</button></div></article>)}</div>{historic.length>0&&<details className="v12Historic"><summary>Historic records ({historic.length})</summary><div className="v12RecordList">{historic.map(record=><article className="v12RecordCard" key={record.id}><div><span>Historic employment</span><strong>{record.employment_type.replace(/^./,letter=>letter.toUpperCase())}</strong><small>{dateText(record.effective_from)} – {dateText(record.effective_to)}</small></div></article>)}</div></details>}{!employmentRecords.length&&!d&&<div className="empty">No employment history yet.</div>}{d&&<div className="v12RecordEditor"><div className="formSectionTitle"><h3>{d.id?"Create employment version":"Add employment"}</h3><p>{d.id?"The current record will close and a new record will begin today.":"Add dated employment terms."}</p></div><div className="grid grid2"><div className="field"><label>Employment Type</label><select value={d.employment_type} onChange={e=>setEmploymentRecordDraft({...d,employment_type:e.target.value as EmploymentRecord["employment_type"]})}><option value="hourly">Hourly</option><option value="salaried">Salaried</option><option value="volunteer">Volunteer</option></select></div></div>{d.employment_type!=="volunteer"&&d.employment_type!=="salaried"&&<div className="grid grid2"><div className="field"><label>Standard Rate</label><input type="number" min="0" step="0.01" value={d.standard_rate} onChange={e=>setEmploymentRecordDraft({...d,standard_rate:Number(e.target.value)})}/></div><div className="field"><label>Enhanced Rate</label><input type="number" min="0" step="0.01" value={d.enhanced_rate} onChange={e=>setEmploymentRecordDraft({...d,enhanced_rate:Number(e.target.value)})}/></div></div>}{d.employment_type==="salaried"&&<div className="grid grid3"><div className="field"><label>Annual Salary</label><input type="number" min="0" value={d.annual_salary??""} onChange={e=>setEmploymentRecordDraft({...d,annual_salary:e.target.value?Number(e.target.value):null})}/></div><div className="field"><label>Weekly Hours</label><input type="number" min="0.01" step="0.25" value={d.contracted_weekly_hours??""} onChange={e=>setEmploymentRecordDraft({...d,contracted_weekly_hours:e.target.value?Number(e.target.value):null})}/></div><div className="field"><label>Working Weeks</label><input type="number" min="0.01" step="0.5" value={d.working_weeks_per_year??""} onChange={e=>setEmploymentRecordDraft({...d,working_weeks_per_year:e.target.value?Number(e.target.value):null})}/></div></div>}<div className="grid grid2"><label className="checkCard"><input type="checkbox" checked={d.can_volunteer} onChange={e=>setEmploymentRecordDraft({...d,can_volunteer:e.target.checked})}/><span><strong>Can Volunteer</strong></span></label></div><div className="row"><button className="btn btnPrimary" disabled={saving||!d.organisation_id} onClick={()=>void saveEmploymentRecord()}>{saving?"Saving…":d.id?"Create new version":"Add Employment"}</button><button className="btn btnSecondary" onClick={()=>setEmploymentRecordDraft(null)}>Cancel</button></div></div>}</div>;
  }

  function StaffModal(){
    const s=staffEdit!;
    const roleLabel=s.role==="club_owner"?"Club Owner":s.role==="admin"?"Super admin":s.role==="org_admin"?"Club Manager":"Coach";
    const hasPortal=Boolean(s.username);
    const employmentType=s.employment_type||"hourly";
    const internalHourlyCost=employmentType==="salaried"&&Number(s.annual_salary)>0&&Number(s.contracted_weekly_hours)>0&&Number(s.working_weeks_per_year)>0?Number(s.annual_salary)/Number(s.working_weeks_per_year)/Number(s.contracted_weekly_hours):0;
    return <div className="modalBackdrop"><div className="modal modalWide v32StaffModal v322StaffModalShell">
      <div className="v32StaffHero"><div className="v32StaffHeroIdentity"><div className="v32StaffHeroAvatar">{initials(s.full_name)}</div><div><span>{s.job_title||roleLabel}</span><h2>{s.full_name}</h2><p>@{s.username||"username"}{(s.email||s.contact_email)?` · ${s.email||s.contact_email}`:""}</p></div></div><button className="iconButton" onClick={()=>setStaffEdit(null)}>×</button></div>
      <div className="v32ProfileTabs"><button className={staffPanel==="profile"?"active":""} onClick={()=>setStaffPanel("profile")}>Profile</button><button className={staffPanel==="employment"?"active":""} onClick={()=>setStaffPanel("employment")}>Employment</button><button className={staffPanel==="coaching"?"active":""} onClick={()=>setStaffPanel("coaching")}>Coaching</button><button className={staffPanel==="availability"?"active":""} onClick={()=>setStaffPanel("availability")}>Availability</button><button className={staffPanel==="payroll"?"active":""} onClick={()=>setStaffPanel("payroll")}>Payroll</button><button className={staffPanel==="security"?"active":""} onClick={()=>setStaffPanel("security")}>Account Access</button><button className={staffPanel==="notes"?"active":""} onClick={()=>setStaffPanel("notes")}>Notes</button></div>
      <div className={`modalBody v32StaffBody v322StaffModalBody staffPanel-${staffPanel} ${employmentRecordsAvailable?"employment-records-ready":""}`}>
        {staffPanel==="employment"&&employmentRecordsAvailable&&<EmploymentRecordsPanel/>}
        {staffPanel==="availability"&&<div className="v12StaffPanelSummary"><h3>Availability</h3><p>Availability and time-away records continue to be managed through the existing Staff Availability and Leave workflows.</p><button className="btn btnSecondary" type="button" onClick={()=>{setStaffEdit(null);setTab("availability")}}>Open Staff Availability</button></div>}
        {staffPanel==="payroll"&&<div className="v12StaffPanelSummary"><h3>Payroll</h3><p>Payroll calculations use the current hourly rate.</p><div className="v12EmploymentSummary"><span>Current payroll basis</span><strong>{money(Number(s.hourly_rate||0))}/hour</strong></div></div>}
        {staffPanel==="coaching"&&<>{!staffProfileFoundationAvailable?<div className="notice">Intelligent Staffing database setup is not available yet. Existing staff and scheduling functionality is unaffected.</div>:<><div className="formSectionTitle"><h3>Coaching capabilities</h3><p>Capability tags improve future recommendations and never restrict assignment.</p></div><div className="checkGrid">{([['lead_coach','Lead Coach'],['assistant_coach','Assistant Coach'],['preschool','Preschool'],['recreational','Recreational'],['performance','Performance'],['dmt','DMT'],['gymnastics','Gymnastics'],['disability','Disability'],['other','Other']] as const).map(([key,label])=><label className="checkCard" key={key}><input type="checkbox" checked={(s.coaching_types||[]).includes(key)} onChange={e=>setStaffEdit({...s,coaching_types:e.target.checked?[...(s.coaching_types||[]),key]:(s.coaching_types||[]).filter(x=>x!==key)})}/><span><strong>{label}</strong></span></label>)}</div><div className="formSectionTitle"><h3>Qualifications</h3><p>Select all qualifications held and record optional award, expiry and notes.</p></div><div className="v101CoachQualifications">{qualificationTypes.filter(q=>q.active||staffEditQualificationIds.includes(q.id)).map(q=>{const selected=staffEditQualificationIds.includes(q.id),details=staffEditQualificationDetails[q.id]||{awarded_date:"",expiry_date:"",notes:""};return <div className={`v101CoachQualification ${selected?"selected":""}`} key={q.id}><label className="checkCard"><input type="checkbox" checked={selected} onChange={e=>{setStaffEditQualificationIds(e.target.checked?[...staffEditQualificationIds,q.id]:staffEditQualificationIds.filter(id=>id!==q.id));if(e.target.checked&&!staffEditQualificationDetails[q.id])setStaffEditQualificationDetails({...staffEditQualificationDetails,[q.id]:details})}}/><span><strong>{q.name}</strong><small>{q.active?q.description||"Active qualification":"Archived qualification"}</small></span></label>{selected&&<div className="v101QualificationDetails"><div className="field"><label>Awarded date</label><input type="date" value={details.awarded_date} onChange={e=>setStaffEditQualificationDetails({...staffEditQualificationDetails,[q.id]:{...details,awarded_date:e.target.value}})}/></div><div className="field"><label>Expiry date</label><input type="date" value={details.expiry_date} onChange={e=>setStaffEditQualificationDetails({...staffEditQualificationDetails,[q.id]:{...details,expiry_date:e.target.value}})}/></div><div className="field"><label>Notes</label><input value={details.notes} onChange={e=>setStaffEditQualificationDetails({...staffEditQualificationDetails,[q.id]:{...details,notes:e.target.value}})} placeholder="Optional"/></div></div>}</div>})}{!qualificationTypes.length&&<div className="empty">No qualifications have been created in Settings.</div>}</div></>}</>}
        {staffPanel==="profile"&&<><div className="grid grid2"><div className="field"><label>Name</label><input value={s.full_name} onChange={e=>setStaffEdit({...s,full_name:e.target.value})}/></div><div className="field"><label>Username</label><div className="v323UsernameInput"><span>@</span><input value={s.username||""} autoCapitalize="none" onChange={e=>setStaffEdit({...s,username:e.target.value.toLowerCase().replace(/\s+/g,"")})}/></div></div></div><div className="grid grid2"><div className="field"><label>Recovery email <span className="muted">(optional)</span></label><input type="email" value={s.email||s.contact_email||""} onChange={e=>setStaffEdit({...s,email:e.target.value,contact_email:e.target.value})}/></div><div className="field"><label>Phone</label><input value={s.phone||""} onChange={e=>setStaffEdit({...s,phone:e.target.value})}/></div></div><div className="field"><label>Address</label><textarea value={s.address||""} onChange={e=>setStaffEdit({...s,address:e.target.value})}/></div><div className="grid grid2"><div className="field"><label>Emergency contact</label><input value={s.emergency_contact_name||""} onChange={e=>setStaffEdit({...s,emergency_contact_name:e.target.value})}/></div><div className="field"><label>Emergency phone</label><input value={s.emergency_contact_phone||""} onChange={e=>setStaffEdit({...s,emergency_contact_phone:e.target.value})}/></div></div><div className="grid grid3"><div className="field"><label>DBS expiry</label><input type="date" value={s.dbs_expiry||""} onChange={e=>setStaffEdit({...s,dbs_expiry:e.target.value})}/></div><div className="field"><label>First Aid</label><input type="date" value={s.first_aid_expiry||""} onChange={e=>setStaffEdit({...s,first_aid_expiry:e.target.value})}/></div><div className="field"><label>Safeguarding</label><input type="date" value={s.safeguarding_expiry||""} onChange={e=>setStaffEdit({...s,safeguarding_expiry:e.target.value})}/></div></div></>}
        {staffPanel==="employment"&&<><div className="grid grid2"><div className="field"><label>Job title</label><input value={s.job_title||""} onChange={e=>setStaffEdit({...s,job_title:e.target.value})} placeholder="e.g. Head Coach"/></div><div className="field"><label>Employment status</label><select value={s.employment_status||"active"} onChange={e=>setStaffEdit({...s,employment_status:e.target.value})}><option value="active">Active</option><option value="casual">Casual</option><option value="leaver">Leaver</option></select></div></div><div className="grid grid2"><div className="field"><label>Start date</label><input type="date" value={s.start_date||""} onChange={e=>setStaffEdit({...s,start_date:e.target.value})}/></div><div className="field"><label>Payroll ID</label><input value={s.payroll_id||""} onChange={e=>setStaffEdit({...s,payroll_id:e.target.value})}/></div></div>{employmentFoundationAvailable?<><div className="formSectionTitle"><h3>Employment type</h3><p>Employment terms are stored once against this staff profile.</p></div><div className="v12EmploymentTypes">{([['hourly','Hourly'],['salaried','Salaried'],['volunteer','Volunteer']] as const).map(([value,label])=><label className={`checkCard ${employmentType===value?"selected":""}`} key={value}><input type="radio" name="employment-type" checked={employmentType===value} onChange={()=>setStaffEdit({...s,employment_type:value})}/><span><strong>{label}</strong></span></label>)}</div>{employmentType==="hourly"&&<div className="grid grid2"><div className="field"><label>Standard Rate (£/hour)</label><input type="number" min="0" step="0.01" value={s.standard_rate??s.hourly_rate} onChange={e=>setStaffEdit({...s,standard_rate:Number(e.target.value),hourly_rate:Number(e.target.value)})}/></div><div className="field"><label>Enhanced Rate (£/hour)</label><input type="number" min="0" step="0.01" value={s.enhanced_rate??s.hourly_rate} onChange={e=>setStaffEdit({...s,enhanced_rate:Number(e.target.value)})}/></div><label className="checkCard"><input type="checkbox" checked={Boolean(s.can_volunteer)} onChange={e=>setStaffEdit({...s,can_volunteer:e.target.checked})}/><span><strong>Can Volunteer</strong></span></label></div>}{employmentType==="salaried"&&<><div className="grid grid3"><div className="field"><label>Annual Salary</label><input type="number" min="0" step="0.01" value={s.annual_salary??""} onChange={e=>setStaffEdit({...s,annual_salary:e.target.value===""?null:Number(e.target.value)})}/></div><div className="field"><label>Contracted Weekly Hours</label><input type="number" min="0.01" step="0.25" value={s.contracted_weekly_hours??""} onChange={e=>setStaffEdit({...s,contracted_weekly_hours:e.target.value===""?null:Number(e.target.value)})}/></div><div className="field"><label>Working Weeks Per Year</label><input type="number" min="0.01" step="0.5" value={s.working_weeks_per_year??""} onChange={e=>setStaffEdit({...s,working_weeks_per_year:e.target.value===""?null:Number(e.target.value)})}/></div></div><div className="v12CalculatedCost"><span>Calculated Internal Hourly Cost</span><strong>{money(internalHourlyCost)}</strong><small>Annual salary ÷ working weeks ÷ contracted weekly hours</small></div><label className="checkCard"><input type="checkbox" checked={Boolean(s.can_volunteer)} onChange={e=>setStaffEdit({...s,can_volunteer:e.target.checked})}/><span><strong>Can Volunteer</strong></span></label></>}{employmentType==="volunteer"&&<div className="notice success"><strong>Volunteer only</strong><br/>No hourly rates are required.</div>}<div className="v12EmploymentSummary"><span>Employment summary</span><strong>{employmentType.replace(/^./,letter=>letter.toUpperCase())}</strong>{employmentType==="salaried"?<div><small>Annual salary</small><b>{money(Number(s.annual_salary||0))}</b><small>Contracted weekly hours</small><b>{Number(s.contracted_weekly_hours||0).toFixed(2)}</b><small>Working weeks</small><b>{Number(s.working_weeks_per_year||0).toFixed(2)}</b><small>Internal hourly cost</small><b>{money(internalHourlyCost)}</b></div>:employmentType==="volunteer"?<div><small>Payment basis</small><b>Volunteer only</b></div>:<div><small>Standard rate</small><b>{money(Number(s.standard_rate??s.hourly_rate))}</b><small>Enhanced rate</small><b>{money(Number(s.enhanced_rate??s.hourly_rate))}</b></div>}</div></>:<div className="grid grid2"><div className="field"><label>Hourly rate</label><input type="number" step="0.01" value={s.hourly_rate} onChange={e=>setStaffEdit({...s,hourly_rate:Number(e.target.value)})}/></div></div>}{isGlobalAdmin&&<div className="field"><label>Account type</label><select value={s.role} onChange={e=>setStaffEdit({...s,role:e.target.value as any})}><option value="coach">Coach</option><option value="org_admin">Club administrator</option><option value="admin">Super admin</option></select></div>}<div className="grid grid2"><div className="field"><label>Account name</label><input value={s.account_name||""} onChange={e=>setStaffEdit({...s,account_name:e.target.value})}/></div><div className="field"><label>UTR</label><input value={s.utr||""} onChange={e=>setStaffEdit({...s,utr:e.target.value})}/></div></div></>}
        {staffPanel==="security"&&<><div className="v32SecurityOverview"><div><span>Status</span><strong>{!hasPortal?"No Portal Access":!s.is_active?"Disabled":s.force_password_reset?"Password Change Required":"Active"}</strong></div><div><span>Username</span><strong>{s.username?`@${s.username}`:"Not set"}</strong></div><div><span>Recovery email</span><strong>{s.email||s.contact_email||"Not set"}</strong></div><div><span>Last login</span><strong>{s.last_login_at?new Date(s.last_login_at).toLocaleString("en-GB"):"Never"}</strong></div></div>
        {hasPortal?<><div className="v321Credentials"><div className="v321CredentialsHead"><div><span>Account recovery</span><strong>Reset temporary password</strong><p>Set a temporary password for the staff member to use once.</p></div><button className="btn btnSecondary" type="button" onClick={generateTemporaryPassword}>Generate</button></div><div className="grid grid2"><div className="field"><label>Temporary password</label><input type="text" autoComplete="off" value={temporaryPassword} onChange={e=>setTemporaryPassword(e.target.value)} placeholder="Minimum 8 characters"/></div><div className="field"><label>Confirm password</label><input type="text" autoComplete="off" value={temporaryPasswordConfirm} onChange={e=>setTemporaryPasswordConfirm(e.target.value)}/></div></div><label className="v321ForceCheck"><input type="checkbox" checked={forceTempPasswordChange} onChange={e=>setForceTempPasswordChange(e.target.checked)}/><span><strong>Require password change on next login</strong><small>Enabled by default for temporary passwords.</small></span></label><div className="v321CredentialButtons"><button className="btn btnSecondary" type="button" disabled={!temporaryPassword} onClick={copyTemporaryPassword}>Copy password</button><button className="btn btnPrimary" type="button" disabled={temporaryPasswordBusy} onClick={()=>setStaffTemporaryPassword(s)}>{temporaryPasswordBusy?"Setting…":"Reset temporary password"}</button></div></div>
        <div className="v32SecurityActions"><button className="btn btnSecondary" type="button" onClick={()=>setStaffPanel("profile")}>Edit login details</button><button className={`btn ${s.is_active?"btnDanger":"btnAccent"}`} type="button" onClick={()=>setStaffEdit({...s,is_active:!s.is_active})}>{s.is_active?"Disable account":"Enable account"}</button></div></>:<div className="v321NoPortal"><strong>No Portal Access</strong><span>This staff profile is available for scheduling and payroll, but cannot sign in.</span><button className="btn btnSecondary" type="button" onClick={()=>setStaffPanel("profile")}>Edit login details</button></div>}
        {hasPortal&&<div className="v321PasswordMeta"><div><span>Password last changed</span><strong>{s.password_changed_at?new Date(s.password_changed_at).toLocaleString("en-GB"):"Not recorded"}</strong></div><div><span>Next login</span><strong>{s.force_password_reset?"Password change required":"Normal access"}</strong></div></div>}<div className="notice">Account status changes are applied when you press <strong>Save staff</strong>. Temporary password resets are applied immediately.</div></>}
        {staffPanel==="notes"&&<><div className="field"><label>Private admin notes</label><textarea className="v32Notes" value={s.admin_notes||""} onChange={e=>setStaffEdit({...s,admin_notes:e.target.value})} placeholder="Notes visible to administrators only."/></div><div className="notice">Documents and qualification uploads will build on this profile in v3.5.</div></>}
      </div>
      <div className="modalFoot staffModalFoot v322StaffModalFoot"><div className="row"><button className="btn btnDanger" onClick={()=>deleteStaffAccount(s)}>Delete account</button></div><div className="row"><button className="btn btnSecondary" onClick={()=>setStaffEdit(null)}>Cancel</button><button className="btn btnPrimary" onClick={saveStaff} disabled={saving}>{saving?"Saving…":"Save staff"}</button></div></div>
    </div></div>
  }
}
