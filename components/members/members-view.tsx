"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadMembers } from "@/lib/members/data";
import { UsersIcon } from "@/components/icons";
export default function MembersView(){
  const client=useMemo(()=>createClient(),[]);
  const [view,setView]=useState<"families"|"athletes">("families");
  const [search,setSearch]=useState("");
  const [family,setFamily]=useState<{id:string;name:string}|null>(null);
  const [data,setData]=useState<Awaited<ReturnType<typeof loadMembers>>|null>(null);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let cancelled=false;setData(null);setError("");
    const timer=setTimeout(()=>{void loadMembers(client,search,view,family?.id||null).then(result=>{if(!cancelled)setData(result)}).catch(()=>{if(!cancelled)setError("Members are unavailable. Check your access or try again.")})},200);
    return ()=>{cancelled=true;clearTimeout(timer)};
  },[client,search,view,family,retry]);
  const selectView=(next:"families"|"athletes")=>{setView(next);setFamily(null);setSearch("")};
  const records=data&&!data.restricted?data.records:[];
  return <section className="membersFoundation" aria-labelledby="members-title">
    <header className="membersHeader"><div><span className="membersEyebrow">Your club community</span><h1 id="members-title">Members</h1><p>Families and athletes, connected in one place.</p></div><div className="membersAdd"><button className="btn btnPrimary" disabled aria-describedby="members-add-note">Add member</button><small id="members-add-note">Coming next</small></div></header>
    <div className="membersCounts" aria-live="polite"><div><span>Families</span><strong>{data&&!data.restricted?data.familyCount:"—"}</strong></div><div><span>Athletes</span><strong>{data&&!data.restricted?data.athleteCount:"—"}</strong></div></div>
    <div className="card membersContent"><nav className="membersTabs" aria-label="Member views">{(["families","athletes"] as const).map(item=><button key={item} className={view===item?"selected":""} aria-current={view===item?"page":undefined} onClick={()=>selectView(item)}>{item==="families"?"Families":"Athletes"}</button>)}</nav>
      <div className="membersTools"><label htmlFor="members-search">Search {view}<input id="members-search" type="search" maxLength={100} value={search} onChange={event=>setSearch(event.target.value)} placeholder={view==="families"?"Search family names":"Search athlete names"}/></label>{family&&<button className="btn btnSecondary" onClick={()=>setFamily(null)}>All {view} · Clear {family.name}</button>}</div>
      {error?<div className="membersEmpty" role="alert"><h2>Unable to load members</h2><p>{error}</p><button className="btn btnSecondary" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:!data?<p className="membersEmpty" role="status">Loading members…</p>:data.restricted?<div className="membersEmpty"><UsersIcon/><h2>Member privacy comes first</h2><p>Platform Admin access does not include member personal data. Club Owners and Club Administrators manage their own club’s records.</p></div>:records.length===0?<div className="membersEmpty"><UsersIcon/><h2>{search||family?"No matching records":view==="families"?"A home for every family":"Every athlete has a place"}</h2><p>{search||family?"Try another name or clear your filters.":view==="families"?"Your family accounts will appear here, with their athletes connected.":"Athletes will appear here, connected to their family and trusted contacts."}</p>{!search&&!family&&<small>Adding members is coming next.</small>}</div>:<><p className="membersResultCount">Showing {records.length} of {data.total} {view} · includes archived records</p><div className="membersRecords">{records.map(record=><article key={record.id}><div><h2>{record.display_name}</h2><span className="membersStatus">{record.status==="archived"?"Archived":"Active"}</span></div>{view==="families"?<button className="btn btnSecondary" onClick={()=>{setView("athletes");setFamily({id:record.id,name:record.display_name});setSearch("")}}>View athletes</button>:<button className="btn btnSecondary" onClick={()=>{if("family_id" in record){setView("families");setFamily({id:record.family_id,name:"family filter"});setSearch("")}}}>View family</button>}</article>)}</div>{data.total>50&&<p className="membersResultCount">Search by name to narrow these results.</p>}</>}
    </div>
  </section>;
}
