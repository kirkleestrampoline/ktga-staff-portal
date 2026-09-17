import type { DashboardTab } from "@/types/navigation";

export type NavigationIcon="home"|"users"|"calendar"|"clock"|"chart"|"invoice"|"settings"|"user";
export type NavigationLink={id:DashboardTab;label:string;icon:NavigationIcon};
export type NavigationGroup={id:"staff-module";label:string;icon:NavigationIcon;children:NavigationLink[]};
export type FutureModule={id:`module-${string}`;label:string;icon:NavigationIcon;description:string}&({enabled:false}|{enabled:true;destination:DashboardTab});
export type NavigationItem=NavigationLink|NavigationGroup|FutureModule;
export const futureModules:FutureModule[]=[
  {id:"module-members",label:"Members",icon:"users",enabled:true,destination:"members",description:"Bring athletes, families and guardians together in one club membership workspace."},
  {id:"module-classes",label:"Classes",icon:"calendar",enabled:true,destination:"classes",description:"Organise programmes, classes and enrolments across your club."},
  {id:"module-progress",label:"Progress",icon:"chart",enabled:false,description:"Track athlete skills, achievements and development over time."},
  {id:"module-finance",label:"Finance",icon:"invoice",enabled:false,description:"Manage membership billing and club payments in one place."},
  {id:"module-communications",label:"Communications",icon:"users",enabled:false,description:"Keep families and staff informed with club messages and updates."},
];
export function isFutureModule(item:NavigationItem):item is FutureModule{return "enabled" in item}
const definitions:(NavigationLink&{staff?:boolean;coachLabel?:string})[]=[
  {id:"dashboard",label:"Club Overview",icon:"home"},
  {id:"staff",label:"People",icon:"users",staff:true},
  {id:"availability",label:"Availability",icon:"users",staff:true},
  {id:"schedule",label:"Staff Rota",coachLabel:"My Schedule",icon:"calendar",staff:true},
  {id:"leave",label:"Leave",coachLabel:"Leave & Availability",icon:"clock",staff:true},
  {id:"workforce",label:"Workforce",icon:"chart",staff:true},
  {id:"expenses",label:"Expenses",coachLabel:"Expenses",icon:"invoice",staff:true},
  {id:"timesheets",label:"Payroll",coachLabel:"My Timesheet",icon:"clock",staff:true},
  {id:"invoices",label:"Staff Invoices",coachLabel:"My Payslips",icon:"invoice",staff:true},
  {id:"reports",label:"Reports",icon:"chart"},
  {id:"settings",label:"Settings",icon:"settings"},
  {id:"profile",label:"My Profile",coachLabel:"My Profile",icon:"user"},
];
export function navigationForRole(role:string):NavigationItem[]{
  const admin=role==="admin"||role==="club_owner"||role==="org_admin";
  const visible=definitions.filter(item=>admin||item.coachLabel!==undefined);
  const link=(item:typeof definitions[number]):NavigationLink=>({id:item.id,label:admin?item.label:item.coachLabel!,icon:item.icon});
  const staff:NavigationGroup={id:"staff-module",label:"Staff",icon:"users",children:visible.filter(item=>item.staff).map(link)};
  return [...visible.filter(item=>item.id==="dashboard").map(link),staff,...(admin?futureModules:[]),...visible.filter(item=>!item.staff&&item.id!=="dashboard").map(link)];
}
export function isNavigationGroup(item:NavigationItem):item is NavigationGroup{return "children" in item}
export function navigationItemActive(item:NavigationItem,tab:DashboardTab):boolean{
  return isNavigationGroup(item)?item.children.some(child=>child.id===tab):isFutureModule(item)?item.enabled&&item.destination===tab:item.id===tab;
}

export function mobileNavigationForRole(role:string){
  const items=navigationForRole(role);
  const staff=items.find(isNavigationGroup)!;
  const topLevel=items.filter(item=>!isFutureModule(item));
  // Staff have no Club Overview permission; retain their schedule as the first shortcut.
  const primary=topLevel[0]?.id==="staff-module"?[staff.children.find(item=>item.id==="schedule")!,...topLevel]:topLevel;
  const menu=items.filter(item=>isNavigationGroup(item)||isFutureModule(item));
  const directStaff=menu.length===1&&menu[0].id==="staff-module";
  const staffLabels:Partial<Record<DashboardTab,string>>={schedule:"My Schedule",availability:"Availability",leave:"Leave & Availability",timesheets:"My Timesheets",expenses:"My Expenses"};
  const staffDestinations=staff.children.map(item=>directStaff?{...item,label:staffLabels[item.id]||item.label}:item);
  return {primary,menu,directStaff,staffDestinations};
}
