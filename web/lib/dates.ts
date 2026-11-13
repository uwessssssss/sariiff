/**
 * Calendar dates in the viewer's own time zone.
 *
 * `new Date().toISOString().split("T")[0]` is the UTC date: in Nairobi/Kampala
 * (UTC+3) it still says YESTERDAY from midnight to 03:00, so forms defaulted to the
 * wrong day and "today" filters missed the night's transactions. Use these instead.
 */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Is an API timestamp inside a report's date range? Ranges are local calendar days:
 * "today", "week" (Monday to today), "month", "year", or "custom" (from/to as YYYY-MM-DD,
 * either may be blank). Anything unreadable is outside every range but "all".
 */
export function inDateRange(
  when: string | undefined | null,
  range: string,
  from = "",
  to = "",
  now: Date = new Date(),
): boolean {
  if (range === "all") return true;
  const d = when ? new Date(when) : null;
  if (!d || isNaN(d.getTime())) return false;
  const day = localDate(d);
  const today = localDate(now);
  if (range === "today") return day === today;
  if (range === "week") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return day >= localDate(monday) && day <= today;
  }
  if (range === "month") return day.slice(0, 7) === today.slice(0, 7) && day <= today;
  if (range === "year") return day.slice(0, 4) === today.slice(0, 4) && day <= today;
  if (range === "custom") return (!from || day >= from) && (!to || day <= to);
  return true;
}
