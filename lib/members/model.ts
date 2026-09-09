export const journeys=['enquiry','trial','waiting_list','active','paused','former'] as const;
export type Journey=typeof journeys[number];
export type AthleteDraft={first_name:string;last_name:string;date_of_birth:string;gender:string;journey_status:Journey};
export type ContactDraft={first_name:string;last_name:string;email:string;phone:string;relationship:string;is_primary:boolean;is_emergency:boolean;athlete_ids:string[]};
export type FamilyDraft={display_name:string;status:'active'|'archived'};
export type Stamp={id:string;updated_at:string;status:'active'|'archived'};
export type Contact=Stamp&ContactDraft&{display_name:string;portal_status?:'not_invited'|'invited'|'active'|'disabled'};
export type Athlete=Stamp&AthleteDraft&{display_name:string};
export type Relationship={athlete_id:string;contact_id:string;relationship:string;is_primary:boolean;is_emergency:boolean;status:string};
export type Family=Stamp&FamilyDraft&{primary_contact_id:string|null;contacts:Contact[];athletes:Athlete[];relationships:Relationship[]};
export type MemberResult={can_delete?:boolean;families:Family[];family_count:number;athlete_count:number;matched_families:number};
export const newAthlete=():AthleteDraft=>({first_name:'',last_name:'',date_of_birth:'',gender:'',journey_status:'enquiry'});
export const newContact=():ContactDraft=>({first_name:'',last_name:'',email:'',phone:'',relationship:'parent',is_primary:true,is_emergency:true,athlete_ids:[]});
export function phoneKey(value:string){let digits=value.replace(/\D/g,'');if(digits.startsWith('0044'))digits=digits.slice(2);return digits.startsWith('44')&&digits.length===12?'0'+digits.slice(2):digits}
export function ageAt(dob:string,today=new Date().toISOString().slice(0,10)){
 if(!dob||dob>today)return null;const [y,m,d]=dob.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
 return ty-y-(tm<m||(tm===m&&td<d)?1:0);
}
export function athleteError(d:AthleteDraft){
 if(!d.first_name.trim()||!d.last_name.trim())return 'Enter the athlete’s first and last name.';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.date_of_birth)||!Number.isFinite(Date.parse(d.date_of_birth))||new Date(d.date_of_birth).toISOString().slice(0,10)!==d.date_of_birth||ageAt(d.date_of_birth)===null)return 'Enter a valid date of birth that is not in the future.';
 if(!journeys.includes(d.journey_status))return 'Select a membership journey status.';
 return '';
}
export function contactError(d:ContactDraft){
 if(!d.first_name.trim()||!d.last_name.trim())return 'Enter the contact’s first and last name.';
 if(d.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))return 'Enter a valid email address.';
 if(d.phone&&phoneKey(d.phone).length<7)return 'Enter a valid mobile number.';
 if(!['parent','guardian','self','other'].includes(d.relationship))return 'Select a relationship.';
 return '';
}
export function creationError(f:FamilyDraft,c:ContactDraft,a:AthleteDraft[]){return !f.display_name.trim()?'Enter a family name.':!['active','archived'].includes(f.status)?'Select an account status.':contactError(c)||(!a.length||a.length>20?'Add between one and twenty athletes.':a.map(athleteError).find(Boolean)||'')}
export const journeyLabel=(value:string)=>value.replaceAll('_',' ').replace(/^./,letter=>letter.toUpperCase());
