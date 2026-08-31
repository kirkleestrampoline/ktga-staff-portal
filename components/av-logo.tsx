"use client";

export default function AvLogo({size=38,showWordmark=false,inverse=false}:{size?:number;showWordmark?:boolean;inverse?:boolean}){
  return <div className={`avLogoLockup ${inverse?"inverse":""}`}>
    <svg className="avLogoMark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="AV Gymnastics">
      <defs>
        <linearGradient id="avPurple" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9a63e8"/><stop offset="1" stopColor="#5f2e84"/></linearGradient>
        <linearGradient id="avGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#73df95"/><stop offset="1" stopColor="#2f9f5d"/></linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="61" height="61" rx="17" fill={inverse?"rgba(255,255,255,.07)":"#111827"}/>
      <path d="M13.2 44.8 27.3 17.5c1.2-2.3 4.5-2.3 5.7 0l9.6 18.3-6.4 0-6-11.5-10.6 20.5h-6.4Z" fill="url(#avPurple)"/>
      <path d="M31.4 20.7h6.7l7.2 14.2 9.2-17.4h7L47.9 44.8c-1.1 2.2-4.3 2.3-5.5.1L31.4 20.7Z" fill="url(#avGreen)"/>
    </svg>
    {showWordmark&&<div className="avWordmark"><strong>AV Gymnastics</strong><span>Coach. Schedule. Perform.</span></div>}
  </div>
}
