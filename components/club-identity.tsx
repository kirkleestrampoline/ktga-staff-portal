"use client";

function safeColour(value?:string|null){return /^#[0-9a-f]{6}$/i.test(value||"")?value!:undefined}

export default function ClubIdentity({name,primaryColour,compact=false}:{name:string;logoUrl?:string|null;primaryColour?:string|null;compact?:boolean}){
  const label=name.trim()||"Club workspace";
  const initials=label.split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join("").toUpperCase()||"CL";
  return <div className={`clubIdentity ${compact?"clubIdentityCompact":""}`} aria-label={`${label} club identity`}>
    <span className="clubIdentityMark fallback" style={safeColour(primaryColour)?{borderColor:safeColour(primaryColour)}:undefined}>
      <span aria-hidden="true">{initials}</span>
    </span>
    <strong title={label}>{label}</strong>
  </div>;
}
