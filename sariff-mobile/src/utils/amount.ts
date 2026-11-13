/** How the screens read typed amounts today (parseFloat), extracted unchanged so it can be tested. */
export function parseAmount(text: string | number | null | undefined): number {
  return parseFloat(String(text ?? ""));
}

export function anyBadAmount(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => String(t ?? "").trim() !== "" && Number.isNaN(parseAmount(t)));
}
