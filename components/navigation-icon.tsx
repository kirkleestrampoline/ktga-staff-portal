import { CalendarIcon, ChartIcon, ClockIcon, HomeIcon, InvoiceIcon, SettingsIcon, UserIcon, UsersIcon } from "./icons";
import type { NavigationIcon as IconName } from "@/lib/navigation";
const icons={home:HomeIcon,users:UsersIcon,calendar:CalendarIcon,clock:ClockIcon,chart:ChartIcon,invoice:InvoiceIcon,settings:SettingsIcon,user:UserIcon};
export default function NavigationIcon({name}:{name:IconName}){const Icon=icons[name];return <Icon/>}
