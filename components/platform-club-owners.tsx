"use client";
import { useEffect,useState } from "react";
type Person={id:string;full_name:string;username:string|null;role:string};
type OwnerData={club:{id:string;name:string;active:boolean};owners:Person[];candidates:Person[]};
const roleLabel=(role:string)=>role==="coach"?"Coach":role==="org_admin"?"Club Administrator":"Club Owner";
export default function PlatformClubOwners({clubId}:{clubId:string}){
 const [data,setData]=useState<OwnerData|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[selectedId,setSelectedId]=useState(""),[review,setReview]=useState<Person|null>(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{
  let cancelled=false;setData(null);setError("");setSelectedId("");setReview(null);
  void fetch(`/api/platform-admin/club-owners?club_id=${encodeURIComponent(clubId)}`,{cache:"no-store"}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error);if(!cancelled)setData(body)}).catch(()=>{if(!cancelled)setError("Club Owners could not be loaded.")});
  return ()=>{cancelled=true};
 },[clubId,reload]);
 async function promote(){
  if(!review||!data||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/platform-admin/club-owners",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({club_id:data.club.id,profile_id:review.id,expected_role:review.role,confirmed:true})});
   const body=await response.json();if(!response.ok)throw new Error(body.error);
   setNotice("Club Owner promoted successfully.");setReview(null);setReload(value=>value+1);
  }catch(e){setError(e instanceof Error?e.message:"Promotion failed");setReview(null)}finally{setBusy(false)}
 }
 return <section className="platformOwnerSection" aria-labelledby="club-owners-title"><h3 id="club-owners-title">Club Owners</h3><p>Promote an existing member of this club’s staff.</p>
 {notice&&<p role="status">{notice}</p>}{error&&<div role="alert"><p>{error}</p><button type="button" disabled={busy} onClick={()=>setReload(value=>value+1)}>Reload Club Owners</button></div>}
 {!data&&!error?<p role="status">Loading Club Owners…</p>:data&&<>
 {data.owners.length?<ul>{data.owners.map(owner=><li key={owner.id}><strong>{owner.full_name}</strong><span>{owner.username?`@${owner.username}`:"No username"} · Active Club Owner</span></li>)}</ul>:<p>No active Club Owners.</p>}
 {!data.club.active?<p>This club is suspended. Reactivate and save the club before promoting an owner.</p>:data.candidates.length===0?<p>No eligible active profiles to promote.</p>:<>
 <label>Existing active profile<select value={selectedId} disabled={busy||Boolean(review)} onChange={e=>{setSelectedId(e.target.value);setReview(null)}}><option value="">Select a person</option>{data.candidates.map(person=><option key={person.id} value={person.id}>{person.full_name} · {person.username?`@${person.username}`:"No username"} · {roleLabel(person.role)}</option>)}</select></label>
 {!review?<button type="button" disabled={!selectedId||busy} onClick={()=>{setNotice("");setReview(data.candidates.find(person=>person.id===selectedId)||null)}}>Review promotion</button>:<div className="platformOwnerConfirmation"><h4>Confirm Club Owner promotion</h4><dl><dt>Person</dt><dd>{review.full_name} {review.username&&`(@${review.username})`}</dd><dt>Club</dt><dd>{data.club.name}</dd><dt>Current role</dt><dd>{roleLabel(review.role)}</dd><dt>New role</dt><dd>Club Owner</dd></dl><p>This grants club administration access. Their existing account and work history will be retained.</p><div><button type="button" disabled={busy} onClick={()=>setReview(null)}>Cancel promotion</button><button type="button" disabled={busy} onClick={()=>void promote()}>{busy?"Promoting…":"Confirm promotion"}</button></div></div>}
 </>}
 </>}
 </section>;
}
