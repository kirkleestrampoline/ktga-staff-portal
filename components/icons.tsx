import { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const I = ({children,...props}:P & {children:React.ReactNode}) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
export const HomeIcon=(p:P)=><I {...p}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></I>;
export const ClockIcon=(p:P)=><I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></I>;
export const InvoiceIcon=(p:P)=><I {...p}><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/></I>;
export const UsersIcon=(p:P)=><I {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></I>;
export const ChartIcon=(p:P)=><I {...p}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></I>;
export const SettingsIcon=(p:P)=><I {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.12 2.12-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.39 1.08V21h-3v-.09a1.65 1.65 0 0 0-1.08-1.6 1.65 1.65 0 0 0-1.82.33l-.06.06-2.12-2.12.06-.06A1.65 1.65 0 0 0 6.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1.08-.39H4v-3h.92A1.65 1.65 0 0 0 6.5 9.53a1.65 1.65 0 0 0-.33-1.82l-.06-.06L8.23 5.5l.06.06A1.65 1.65 0 0 0 10.11 5a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .39-1.08V3h3v.32a1.65 1.65 0 0 0 1.08 1.6 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.12 2.12-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1.08.39H21v3h-.13A1.65 1.65 0 0 0 19.4 15z"/></I>;
export const UserIcon=(p:P)=><I {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></I>;
export const PlusIcon=(p:P)=><I {...p}><path d="M12 5v14M5 12h14"/></I>;
export const SearchIcon=(p:P)=><I {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></I>;
export const ArrowIcon=(p:P)=><I {...p}><path d="m9 18 6-6-6-6"/></I>;
export const PoundIcon=(p:P)=><I {...p}><path d="M17 7a5 5 0 0 0-10 0c0 4 3 5 3 8a5 5 0 0 1-3 4h10M5 12h9"/></I>;
export const CheckIcon=(p:P)=><I {...p}><path d="m5 12 4 4L19 6"/></I>;
export const CalendarIcon=(p:P)=><I {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></I>;
export const MenuIcon=(p:P)=><I {...p}><path d="M4 7h16M4 12h16M4 17h16"/></I>;
