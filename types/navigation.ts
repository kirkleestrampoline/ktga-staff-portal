export type DashboardTab=
  | "dashboard"
  | "availability"
  | "schedule"
  | "leave"
  | "expenses"
  | "timesheets"
  | "invoices"
  | "staff"
  | "workforce"
  | "reports"
  | "settings"
  | "profile";

export const dashboardTabs:DashboardTab[]=["dashboard","availability","schedule","leave","staff","workforce","expenses","timesheets","invoices","reports","settings","profile"];
export const coachDashboardTabs:DashboardTab[]=["schedule","leave","expenses","timesheets","invoices","profile"];

export function defaultDashboardTab(role:string):DashboardTab{
  return role==="admin"||role==="club_owner"||role==="org_admin"?"dashboard":"schedule";
}

export function dashboardTabForRole(value:string|null|undefined,role:string):DashboardTab{
  const allowed=role==="admin"||role==="club_owner"||role==="org_admin"?dashboardTabs:coachDashboardTabs;
  return allowed.includes(value as DashboardTab)?value as DashboardTab:defaultDashboardTab(role);
}
