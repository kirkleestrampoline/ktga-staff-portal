export type ClubOverviewSummary = {
  snapshot: {
    active_family_accounts: number;
    active_athletes: number;
    active_enrolments: number;
    trial_enrolments: number;
    waiting_enrolments: number;
    paused_enrolments: number;
    published_class_profiles: number;
    active_weekly_sessions: number;
  };
  today: {
    class_sessions_today: number;
    unique_athletes_expected_today: number;
    expected_attendances_today: number;
    trial_athletes_expected_today: number;
  };
  class_rows: Array<{
    class_id: string;
    class_profile_id: string;
    class_name: string;
    weekday: number;
    start_time: string;
    finish_time: string;
    venue_name: string;
    capacity: number | null;
    active_places: number;
    waiting_list: number;
    available_spaces: number | null;
  }>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const number = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const nullableNumber = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value)) ? value : null;
const string = (value: unknown) => typeof value === "string" ? value : "";

export function normalizeClubOverviewSummary(value: unknown): ClubOverviewSummary | null {
  if (!isRecord(value) || !isRecord(value.snapshot) || !isRecord(value.today) || !Array.isArray(value.class_rows)) return null;
  const snapshot = value.snapshot;
  const today = value.today;
  return {
    snapshot: {
      active_family_accounts: number(snapshot.active_family_accounts), active_athletes: number(snapshot.active_athletes),
      active_enrolments: number(snapshot.active_enrolments), trial_enrolments: number(snapshot.trial_enrolments),
      waiting_enrolments: number(snapshot.waiting_enrolments), paused_enrolments: number(snapshot.paused_enrolments),
      published_class_profiles: number(snapshot.published_class_profiles), active_weekly_sessions: number(snapshot.active_weekly_sessions),
    },
    today: {
      class_sessions_today: number(today.class_sessions_today), unique_athletes_expected_today: number(today.unique_athletes_expected_today),
      expected_attendances_today: number(today.expected_attendances_today), trial_athletes_expected_today: number(today.trial_athletes_expected_today),
    },
    class_rows: value.class_rows.filter(isRecord).map(row => ({
      class_id: string(row.class_id), class_profile_id: string(row.class_profile_id), class_name: string(row.class_name),
      weekday: number(row.weekday), start_time: string(row.start_time), finish_time: string(row.finish_time), venue_name: string(row.venue_name),
      capacity: nullableNumber(row.capacity), active_places: number(row.active_places), waiting_list: number(row.waiting_list), available_spaces: nullableNumber(row.available_spaces),
    })).filter(row => row.class_id && row.class_name),
  };
}

type RpcClient = { rpc: (name: string, args: { p_date: string }) => any };
export async function fetchClubOverviewSummary(client: RpcClient, date: string) {
  const response = await client.rpc("club_overview_summary", { p_date: date });
  if (response.error) {
    const error = new Error(response.error.message || "Unable to load the Club Overview summary.") as Error & { code?: string };
    error.code = response.error.code;
    throw error;
  }
  const summary = normalizeClubOverviewSummary(response.data);
  if (!summary) throw new Error("The Club Overview summary returned an invalid shape.");
  return summary;
}
