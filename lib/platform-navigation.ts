export const platformSections=[
 {id:'overview',label:'Platform Overview'},
 {id:'clubs',label:'Clubs'},
 {id:'activity',label:'Platform Activity'},
 {id:'account',label:'Account'},
] as const;
export type PlatformSection=typeof platformSections[number]['id'];
export function platformSection(value:unknown):PlatformSection{return platformSections.some(item=>item.id===value)?value as PlatformSection:'overview'}
export function accountHome(role:string){return role==='admin'?'/platform-admin':'/dashboard'}
