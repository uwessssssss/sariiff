"use client";

import { useEffect, useState } from "react";
import { Currency, currencyCode, getCompanyCurrencies } from "@/lib/api";

/**
 * The bureau's home currency (KES in Kenya, UGX in Uganda). Exchange rates are
 * "base per 1 foreign", profit is booked in it (mobile money wallets hold their network's currency).
 *
 * Fetched once per page load and shared by every caller. Until it arrives the
 * hook returns KES, which is what every existing company uses.
 */
let cached: Currency | null = null;
let inflight: Promise<Currency> | null = null;
const listeners = new Set<(c: Currency) => void>();

/** Exported for the logic tests. */
export function loadBaseCurrency(): Promise<Currency> {
  return load();
}
function load(): Promise<Currency> {
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = getCompanyCurrencies()
      .then((r) => (r.success && r.data && r.data.baseCurrency !== undefined ? (Number(r.data.baseCurrency) as Currency) : Currency.KES))
      .catch((): Currency => Currency.KES)
      .then((c) => {
        cached = c;
        listeners.forEach((l) => l(c));
        return c;
      });
  }
  return inflight;
}

/** Forget the cached value (on logout, so the next company re-fetches). */
export function resetBaseCurrency() {
  cached = null;
  inflight = null;
}

export function useBaseCurrency(): { base: Currency; baseCode: string; loaded: boolean } {
  const [base, setBase] = useState<Currency>(cached ?? Currency.KES);
  const [loaded, setLoaded] = useState(cached !== null);
  useEffect(() => {
    const on = (c: Currency) => { setBase(c); setLoaded(true); };
    listeners.add(on);
    load().then(on);
    return () => { listeners.delete(on); };
  }, []);
  return { base, baseCode: currencyCode(base), loaded };
}

/**
 * Currencies a bureau may use, by country (mirrors CurrencyInfo.AllowedFor on the API).
 *  Kenya  (KES home): KES, USD, EUR — Kenyan bureaus don't deal in UGX.
 *  Uganda (UGX home): UGX, USD, KES, EUR — shillings cross the border every day.
 * Home currency first. Pickers for NEW accounts, trades, rates and invoices use this.
 */
export const allowedCurrenciesFor = (base: number): number[] =>
  base === Currency.UGX
    ? [Currency.UGX, Currency.USD, Currency.KES, Currency.EUR]
    : [base, ...[Currency.USD, Currency.EUR].filter((c) => c !== base)];

export const isCurrencyAllowed = (base: number, c: number | string): boolean => {
  const n = typeof c === "string" ? ["KES", "USD", "UGX", "EUR"].indexOf(c.toUpperCase()) : c;
  return allowedCurrenciesFor(base).includes(n);
};

/** Foreign currencies that trade against the base (allowed ones except the base). */
export const foreignCurrenciesFor = (base: number): number[] =>
  allowedCurrenciesFor(base).filter((c) => c !== base);

/** Every currency the float can hold, base first. */
export const floatCurrenciesFor = (base: number): number[] => allowedCurrenciesFor(base);

/** The allowed currency codes for the signed-in bureau, e.g. ["KES","USD","EUR"]. */
export function useAllowedCurrencies(): { base: Currency; baseCode: string; allowed: number[]; codes: string[]; has: (c: number | string) => boolean } {
  const { base, baseCode } = useBaseCurrency();
  const allowed = allowedCurrenciesFor(base);
  return { base, baseCode, allowed, codes: allowed.map((c) => currencyCode(c)), has: (c) => isCurrencyAllowed(base, c) };
}

/**
 * Example values for form placeholders in the bureau's own country, so a Ugandan bureau
 * isn't shown "+254 712 345 678 / John Kamau / Nairobi, Kenya" (found in the Nov 2026 review).
 */
export type CountrySamples = { phone: string; phoneCompact: string; name: string; place: string };
export const samplesFor = (base: number): CountrySamples =>
  base === Currency.UGX
    ? { phone: "+256 772 123 456", phoneCompact: "+256772123456", name: "Sarah Nakato", place: "Kampala, Uganda" }
    : { phone: "+254 712 345 678", phoneCompact: "+254712345678", name: "John Kamau", place: "Nairobi, Kenya" };

export function useCountrySamples(): CountrySamples {
  const { base } = useBaseCurrency();
  return samplesFor(base);
}
