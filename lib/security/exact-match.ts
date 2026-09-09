// PostgREST treats '*' as an alias for '%', even in an ilike value.
// Reject that alias; escape SQL LIKE metacharacters so underscores remain valid usernames.
export function exactInsensitivePattern(value: unknown): string | null {
  const normalised = String(value || "").trim().toLowerCase();
  if (!normalised || normalised.includes("*") || /[\u0000-\u001f\u007f]/.test(normalised)) return null;
  return normalised.replace(/[\\%_]/g, character => `\\${character}`);
}
