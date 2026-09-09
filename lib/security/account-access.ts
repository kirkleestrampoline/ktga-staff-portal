import type { SupabaseClient } from "@supabase/supabase-js";
import { activeAccount, canManageStaffTarget, UUID_RE, type AccountProfile, type VenueAuthority } from "./account-policy";

// Call only with the cookie-authenticated server client. The caller cannot supply an actor ID.
export async function requireActiveAccount(client: SupabaseClient) {
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return null;
  const { data: profile, error } = await client.from("profiles").select("id,role,club_id,is_active").eq("id", user.id).maybeSingle();
  if (error || !profile?.club_id || !UUID_RE.test(profile.club_id)) return null;
  const { data: club, error: clubError } = await client.from("clubs").select("id,active").eq("id", profile.club_id).maybeSingle();
  if (clubError || !activeAccount(user.id, profile, club)) return null;
  return { user, profile: profile as AccountProfile, club: club! };
}

export type ActiveAccount = NonNullable<Awaited<ReturnType<typeof requireActiveAccount>>>;

// Authorise before any service-role mutation. Lookup errors fail closed.
export async function authoriseStaffTarget(admin: SupabaseClient, actor: ActiveAccount, targetId: string) {
  if (!UUID_RE.test(targetId)) return null;
  const { data: target, error } = await admin.from("profiles").select("id,role,club_id,is_active,username,full_name,email,contact_email,auth_email")
    .eq("id", targetId).eq("club_id", actor.profile.club_id).maybeSingle();
  if (error || !target) return null;
  let actorVenues: VenueAuthority[] = [], targetVenues: VenueAuthority[] = [];
  if (actor.profile.role === "org_admin") {
    const results = await Promise.all([
      admin.from("staff_venues").select("venue_id,is_admin").eq("profile_id", actor.user.id),
      admin.from("staff_venues").select("venue_id,is_admin").eq("profile_id", target.id),
      admin.from("venues").select("id,club_id").eq("club_id", actor.profile.club_id).eq("active", true),
    ]);
    if (results.some(result => result.error)) return null;
    const venues = new Map((results[2].data || []).map(row => [row.id, row.club_id]));
    const mapLinks = (rows: typeof results[0]["data"]): VenueAuthority[] => (rows || []).map(row => ({
      venue_id: row.venue_id, is_admin: row.is_admin === true, club_id: venues.get(row.venue_id) || "",
    }));
    actorVenues = mapLinks(results[0].data);
    targetVenues = mapLinks(results[1].data);
  }
  return canManageStaffTarget({ userId: actor.user.id, actor: actor.profile, club: actor.club, targetId, target, actorVenues, targetVenues }) ? target : null;
}
