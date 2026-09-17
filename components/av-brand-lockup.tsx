"use client";

import AvLogo from "./av-logo";

export default function AvBrandLockup({size=43,className="",singleLine=false}:{size?:number;className?:string;singleLine?:boolean}){
  return <div className={`avBrandLockup ${className}`.trim()}>
    <AvLogo size={size} inverse />
    <div className="avBrandText">
      {singleLine?<strong>AV Gymnastics Solutions</strong>:<><strong>AV Gymnastics</strong><strong>Solutions</strong></>}
    </div>
  </div>;
}
