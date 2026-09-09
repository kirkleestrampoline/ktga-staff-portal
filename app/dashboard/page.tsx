import { launchResetEnabled } from "@/lib/security/account-policy";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Dashboard from "./ui";
import { dashboardTabForRole } from "@/types/navigation";

export default async function DashboardPage({searchParams}:{searchParams:Promise<{tab?:string|string[];month?:string|string[]}>}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile || !profile.is_active || !profile.club_id) {
    redirect("/");
  }

  const{data:club,error:clubError}=await supabase.from("clubs").select("active").eq("id",profile.club_id).maybeSingle();
  if(clubError||!club||club.active!==true)redirect("/suspended");

  if(profile.role==="admin")redirect("/platform-admin");

  const params=await searchParams;
  const requestedTab=params.tab;
  const initialTab=dashboardTabForRole(Array.isArray(requestedTab)?requestedTab[0]:requestedTab,profile.role);
  const requestedMonth=Array.isArray(params.month)?params.month[0]:params.month;
  const nowParts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/London",year:"numeric",month:"2-digit"}).formatToParts(new Date());
  const currentMonth=`${nowParts.find(part=>part.type==="year")?.value}-${nowParts.find(part=>part.type==="month")?.value}`;
  const initialMonth=/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth||"")?requestedMonth!:currentMonth;

  return <Dashboard initialProfile={profile} initialTab={initialTab} initialMonth={initialMonth} launchResetEnabled={launchResetEnabled(process.env.ENABLE_LAUNCH_RESET)} />;
}
