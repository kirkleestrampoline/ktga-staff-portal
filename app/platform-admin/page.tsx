import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import PlatformAdmin from "./ui";

export default async function PlatformAdminPage(){
  const actor=await requirePlatformAdmin();if(!actor)redirect("/dashboard");
  return <PlatformAdmin/>;
}
