/**
 * Human-readable relative time for a timestamp in the past (e.g. "2 minutes ago").
 */
export function formatRelativePastSince(iso: string, localeTag: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  let diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 0) diffSec = 0;

  const loc = localeTag === "ar" ? "ar" : "en";
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });

  if (diffSec < 60) return rtf.format(-diffSec, "second");
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return rtf.format(-mins, "minute");
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return rtf.format(-hrs, "hour");
  const days = Math.floor(hrs / 24);
  if (days < 7) return rtf.format(-days, "day");
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return rtf.format(-weeks, "week");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  const years = Math.floor(days / 365);
  return rtf.format(-Math.max(1, years), "year");
}
