"use client";
import { useEffect,useState } from 'react';
export default function PlatformActivity(){
 const [rows,setRows]=useState<{id:string;action:string;created_at:string;club_id:string|null}[]|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let cancelled=false;void fetch('/api/platform-admin/activity',{cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error();const body=await response.json();if(!cancelled)setRows(body.activity)}).catch(()=>{if(!cancelled)setError(true)});return ()=>{cancelled=true}},[]);
 return <section className="platformPanel platformAccount"><h2>Platform Activity</h2><p>Latest 50 platform events.</p>{error?<p role="alert">Activity could not be loaded.</p>:!rows?<p role="status">Loading…</p>:!rows.length?<p>No platform activity yet.</p>:<ul>{rows.map(row=><li key={row.id}><strong>{row.action.replaceAll('_',' ')}</strong><p>{new Date(row.created_at).toLocaleString('en-GB')}{row.club_id&&` · Club ${row.club_id}`}</p></li>)}</ul>}</section>;
}
