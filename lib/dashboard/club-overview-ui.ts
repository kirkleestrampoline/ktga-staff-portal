export type CapacityRow={class_id:string;class_profile_id:string;class_name:string;weekday:number;start_time:string;finish_time:string;venue_name:string;capacity:number|null;active_places:number;waiting_list:number;available_spaces:number|null};
export type CapacityGroup={profileId:string;name:string;rows:CapacityRow[];active:number;capacity:number|null;available:number|null;waiting:number;utilisation:number;state:'over'|'full'|'nearly-full'|'available'|'empty'};
export const plural=(value:number,word:string)=>`${value} ${word}${value===1?'':'s'}`;
export function programmeState(rows:CapacityRow[], nowMinutes:number){
 const times=(time:string)=>{const [h,m]=time.slice(0,5).split(':').map(Number);return h*60+m};
 const sorted=[...rows].sort((a,b)=>times(a.start_time)-times(b.start_time));
 const running=sorted.find(row=>times(row.start_time)<=nowMinutes&&times(row.finish_time)>nowMinutes);
 if(running)return {kind:'running' as const,row:running};
 const next=sorted.find(row=>times(row.start_time)>nowMinutes);
 if(next)return {kind:'next' as const,row:next};
 return sorted.length?{kind:'complete' as const,row:sorted[sorted.length-1]}:{kind:'empty' as const,row:null};
}
export function groupCapacityRows(rows:CapacityRow[]):CapacityGroup[]{
 const groups=new Map<string,CapacityRow[]>();rows.forEach(row=>groups.set(row.class_profile_id,[...(groups.get(row.class_profile_id)||[]),row]));
 return [...groups.entries()].map(([profileId,groupRows])=>{const active=groupRows.reduce((total,row)=>total+row.active_places,0);const allCapacity=groupRows.every(row=>row.capacity!==null);const capacity=allCapacity?groupRows.reduce((total,row)=>total+(row.capacity||0),0):null;const available=allCapacity?groupRows.reduce((total,row)=>total+(row.available_spaces||0),0):null;const waiting=groupRows.reduce((total,row)=>total+row.waiting_list,0);const utilisation=capacity&&capacity>0?Math.round(active/capacity*100):0;const state=available!==null&&available<0?'over':available===0&&capacity!==null?'full':capacity!==null&&active===0?'empty':available!==null&&capacity!==null&&available/capacity<=.2?'nearly-full':'available';return {profileId,name:groupRows[0].class_name,rows:groupRows.sort((a,b)=>((a.weekday+6)%7)-((b.weekday+6)%7)||a.start_time.localeCompare(b.start_time)),active,capacity,available,waiting,utilisation,state};});
}
export function sortCapacityGroups(groups:CapacityGroup[], sort:'priority'|'name'|'spaces'){
 const priority={over:0,full:1,'nearly-full':2,available:3,empty:4};return [...groups].sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='spaces'?((a.available??Infinity)-(b.available??Infinity)||a.name.localeCompare(b.name)):priority[a.state]-priority[b.state]||a.name.localeCompare(b.name));
}
