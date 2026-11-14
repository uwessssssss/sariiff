/**
 * Reads an amount the user typed.
 *
 * parseFloat stops at the first character it does not understand, so "1,500" was read
 * as 1 and "15o0" as 15, and the screen went on to record that number. Android number
 * keyboards offer "," and pasted amounts often carry thousands separators.
 *
 *   "1,500"     → 1500        (commas only as thousands separators: 1,500 / 12,345,678.50)
 *   " 2 500.75" → 2500.75     (spaces are dropped)
 *   "1,50"      → NaN         (a decimal comma? a typo? refuse rather than guess)
 *   "15o0"      → NaN         (anything that is not a plain number is refused)
 *   ""          → NaN
 */
export function parseAmount(text: string | number | null | undefined): number {
  if (typeof text === "number") return text;
  const s = String(text ?? "").replace(/[\s ]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) {
    if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return NaN;
    return Number(s.replace(/,/g, ""));
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

/** True when any of these fields has text in it that is not an amount (empty fields are fine). */
export function anyBadAmount(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => String(t ?? "").trim() !== "" && Number.isNaN(parseAmount(t)));
}
