export type DashboardTab=
  | "dashboard"
  | "availability"
  | "schedule"
  | "leave"
  | "timesheets"
  | "invoices"
  | "staff"
  | "reports"
  | "settings"
  | "profile";

export const dashboardTabs:DashboardTab[]=["dashboard","availability","schedule","leave","timesheets","invoices","staff","reports","settings","profile"];
export const coachDashboardTabs:DashboardTab[]=["schedule","leave","timesheets","invoices","profile"];

export function defaultDashboardTab(role:string):DashboardTab{
  return role==="admin"||role==="org_admin"?"dashboard":"schedule";
}

export function dashboardTabForRole(value:string|null|undefined,role:string):DashboardTab{
  const allowed=role==="admin"||role==="org_admin"?dashboardTabs:coachDashboardTabs;
  return allowed.includes(value as DashboardTab)?value as DashboardTab:defaultDashboardTab(role);
}
