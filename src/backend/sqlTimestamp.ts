/**
 * Normalize a SQL DATETIME value into an explicit-UTC ISO 8601 string.
 *
 * The Dolt/MySQL backend connects with `dateStrings: true`, so DATETIME columns
 * arrive as bare `'YYYY-MM-DD HH:MM:SS'` strings with NO timezone designator.
 * Beads stores these in UTC, but `new Date('2026-06-16 10:59:45')` in the
 * webview parses them as *local* time — shifting every timestamp by the local
 * offset (in behind-UTC zones, into the future, which renders as "just now").
 *
 * This stamps the UTC intent explicitly (`...Z`) so both sides agree. Values
 * that already carry a zone (`Z` or `±HH:MM`) and `Date` objects are passed
 * through unchanged. (vs-b9t)
 */
export function normalizeSqlTimestamp(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();

  const s = String(value).trim();
  if (s === "") return "";

  // Already has a timezone designator (trailing Z, or a ±HH:MM / ±HHMM offset).
  if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s)) return s;

  // Bare SQL datetime ('YYYY-MM-DD HH:MM:SS[.fff]'), known to be UTC: make it a
  // valid explicit-UTC ISO 8601 string the webview won't reinterpret as local.
  return `${s.replace(" ", "T")}Z`;
}
