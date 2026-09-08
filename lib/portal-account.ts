export type PortalProfile={
  id:string;club_id:string|null;role:string;username:string|null;email:string|null;
  contact_email:string|null;auth_email:string|null;is_active:boolean;
  force_password_reset?:boolean|null;
};

export type PortalResolution=
  |{status:"found";profile:PortalProfile;club:{id:string;slug:string;active:boolean}}
  |{status:"ambiguous"}
  |{status:"not_found"}
  |{status:"lookup_error";code?:string};

// This helper is server-only in practice: callers pass the service-role client.
// Limit(2) is intentional; it detects ambiguity without returning account lists.
export async function resolvePortalAccount(admin:any,rawUsername:unknown,rawClubCode:unknown):Promise<PortalResolution>{
  const username=String(rawUsername||"").trim().toLowerCase();
  const clubCode=String(rawClubCode||"").trim().toLowerCase();
  if(!username)return{status:"not_found"};

  let club:{id:string;slug:string;active:boolean}|null=null;
  if(clubCode){
    const{data:clubs,error}=await admin.from("clubs").select("id,slug,active").ilike("slug",clubCode).limit(2);
    if(error)return{status:"lookup_error",code:error.code};
    if(!clubs||clubs.length!==1||!clubs[0].active)return{status:"not_found"};
    club=clubs[0];
  }

  let query=admin.from("profiles").select("id,club_id,role,username,email,contact_email,auth_email,is_active,force_password_reset").ilike("username",username).limit(2);
  if(club)query=query.eq("club_id",club.id);
  const{data:profiles,error}=await query;
  if(error)return{status:"lookup_error",code:error.code};
  if(!profiles||profiles.length===0)return{status:"not_found"};
  if(profiles.length>1)return{status:"ambiguous"};

  const profile=profiles[0] as PortalProfile;
  if(!club){
    const{data:resolvedClub,error:clubError}=await admin.from("clubs").select("id,slug,active").eq("id",profile.club_id).maybeSingle();
    if(clubError)return{status:"lookup_error",code:clubError.code};
    if(!resolvedClub)return{status:"not_found"};
    club=resolvedClub;
  }
  return{status:"found",profile,club:club!};
}
