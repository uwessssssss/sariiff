import { useEffect, useState } from 'react';
import * as api from '../services/api';
import { Currency, currencyCode } from '../types';

/**
 * The bureau's home currency (KES in Kenya, UGX in Uganda). Exchange rates are
 * "base per 1 foreign", profit is booked in it (mobile money wallets hold their network's currency).
 * Fetched once per app session and shared; KES until it arrives.
 */
let cached: number | null = null;
let inflight: Promise<number> | null = null;
const listeners = new Set<(c: number) => void>();

// Bumped on every reset: an answer that arrives after a sign-out or bureau switch belongs
// to the previous bureau and is dropped.
let generation = 0;

function load(): Promise<number> {
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) {
    const gen = generation;
    inflight = api.getCompanyCurrencies()
      .then((r: any) => (r?.success && r.data && r.data.baseCurrency !== undefined ? (Number(r.data.baseCurrency) as number) : null))
      .catch(() => null)
      .then((c: number | null) => {
        if (gen !== generation) return cached ?? (Currency.KES as number);   // a newer sign-in owns the cache
        inflight = null;
        // A failed load is NOT cached: KES is shown for now and the next screen asks again
        // (a failed first request used to label a Ugandan bureau's figures KES until reload).
        if (c === null) return Currency.KES as number;
        cached = c;
        listeners.forEach((l) => l(c));
        return c;
      });
  }
  return inflight;
}

/** Forget the cached value (call on logout so the next company re-fetches). */
export function resetBaseCurrency() {
  generation++;
  cached = null;
  inflight = null;
}

export function useBaseCurrency(): { base: number; baseCode: string } {
  const [base, setBase] = useState<number>(cached ?? Currency.KES);
  useEffect(() => {
    const on = (c: number) => setBase(c);
    listeners.add(on);
    load().then(on);
    return () => {
      listeners.delete(on);
    };
  }, []);
  return { base, baseCode: currencyCode(base) };
}
