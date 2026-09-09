import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createClient } from "@/lib/supabase/server";
import { platformSection } from "@/lib/platform-navigation";
import PlatformAdmin from "./ui";

export default async function PlatformAdminPage({searchParams}:{searchParams:Promise<{view?:string}>}){
  const actor=await requirePlatformAdmin();if(!actor)redirect("/dashboard");
  const client=await createClient();
  const {data}=await client.from("profiles").select("username").eq("id",actor.user.id).single();
  return <PlatformAdmin section={platformSection((await searchParams).view)} username={data?.username||"Platform Admin"} />;
}
