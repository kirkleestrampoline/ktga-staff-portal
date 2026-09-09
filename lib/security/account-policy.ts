export type AccountProfile = { id: string; role: string; club_id: string | null; is_active: boolean };
export type AccountClub = { id: string; active: boolean };
export type VenueAuthority = { venue_id: string; club_id: string; is_admin: boolean };
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function activeAccount(userId: string | null, profile: AccountProfile | null, club: AccountClub | null): boolean {
  return Boolean(userId && profile && profile.id === userId && profile.is_active === true &&
    profile.club_id && UUID_RE.test(profile.club_id) && club && club.id === profile.club_id && club.active === true);
}

// Ordinary staff tools never grant cross-club or Platform Admin account access.
// Platform-wide onboarding remains a separate, explicitly authorised workflow.
export function canManageStaffTarget(input: {
  userId: string | null; actor: AccountProfile | null; club: AccountClub | null;
  targetId: string; target: AccountProfile | null;
  actorVenues?: VenueAuthority[]; targetVenues?: VenueAuthority[];
}): boolean {
  const { userId, actor, club, targetId, target, actorVenues = [], targetVenues = [] } = input;
  if (!activeAccount(userId, actor, club) || !actor || !target || !UUID_RE.test(targetId) || target.id !== targetId) return false;
  if (target.id === actor.id || target.club_id !== actor.club_id || target.role === "admin") return false;
  if (actor.role === "admin") return true;
  if (actor.role === "club_owner") return target.role !== "club_owner";
  if (actor.role !== "org_admin" || target.role !== "coach") return false;
  const allowed = new Set(actorVenues.filter(v => v.is_admin && v.club_id === actor.club_id).map(v => v.venue_id));
  // Require positive authority over every assignment: no empty-set authority.
  return targetVenues.length > 0 && targetVenues.every(v => v.club_id === actor.club_id && allowed.has(v.venue_id));
}

export function canAssignStaffRole(actorRole: string, requestedRole: unknown): boolean {
  return requestedRole === "coach" || (requestedRole === "org_admin" && ["admin", "club_owner"].includes(actorRole));
}

export function launchResetEnabled(value: string | undefined): boolean {
  return value === "true";
}
