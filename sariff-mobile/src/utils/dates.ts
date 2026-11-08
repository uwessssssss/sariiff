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
