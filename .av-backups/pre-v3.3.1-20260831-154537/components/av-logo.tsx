"use client";

export default function AvLogo({size=38,showWordmark=false,inverse=false}:{size?:number;showWordmark?:boolean;inverse?:boolean}){
  return <div className={`avLogoLockup ${inverse?"inverse":""}`}>
    <svg className="avLogoMark v3StandaloneMark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="AV Gymnastics">
      <defs>
        <linearGradient id="avPurple" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a06af0"/><stop offset="1" stopColor="#6335b0"/></linearGradient>
        <linearGradient id="avGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7ce39c"/><stop offset="1" stopColor="#31a962"/></linearGradient>
      </defs>
      <path d="M6.5 47.7 23.1 15.8c1.5-2.9 5.7-2.9 7.2.1l10.9 20.8h-7.8L26.7 24 14.4 47.7H6.5Z" fill="url(#avPurple)"/>
      <path d="M28.2 19h8.3l9 17.4 11.1-21h8.6L49.1 47.5c-1.4 2.8-5.4 2.9-6.9.1L28.2 19Z" fill="url(#avGreen)"/>
    </svg>
    {showWordmark&&<div className="avWordmark"><strong>AV Gymnastics</strong><span>Coach. Schedule. Perform.</span></div>}
  </div>
}