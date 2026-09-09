import { activeAccount, type AccountProfile, type AccountClub } from "@/lib/security/account-policy";
export function canReadMembers(userId:string|null,profile:AccountProfile|null,club:AccountClub|null,targetClubId:string):boolean{
  return activeAccount(userId,profile,club)&&profile?.club_id===targetClubId&&
    (profile.role==="club_owner"||profile.role==="org_admin");
}
