"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, ChevronRight, Loader2, Plus } from "lucide-react";
import {
  IdentityBureauDto,
  identityLink,
  identityPick,
  identityRequestCode,
  identityVerifyCode,
} from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

// Phone login: prove the phone with an SMS code, then pick one of the bureaus
// linked to it. A bureau is linked once with THAT bureau's client code + password;
// the phone number alone never links anything (numbers get recycled).
// The web never remembers the device: every phone sign-in here asks for a code.

const PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;
const CODE_PATTERN = /^\d{6}$/;
const RESEND_SECONDS = 60;

const cleanPhone = (v: string) => v.replace(/[\s-]/g, "");

const inputBase =
  "block w-full h-12 px-3.5 rounded-lg border border-slate-300 bg-white text-base text-slate-900 placeholder:text-slate-500 outline-none transition-colors hover:border-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50";
const primaryBtn =
  "flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

type Step = "phone" | "code" | "bureaus";

export function PhoneLogin() {
  const { signInWithTokens } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null); // limited phone token, memory only
  const [bureaus, setBureaus] = useState<IdentityBureauDto[]>([]);
  const [linking, setLinking] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const firstInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    firstInput.current?.focus();
  }, [step, linking]);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    const p = cleanPhone(phone);
    if (!PHONE_PATTERN.test(p)) {
      setError("Start with your country code, for example +254712345678 (Kenya) or +256772123456 (Uganda).");
      return;
    }
    setBusy("send");
    const r = await identityRequestCode(p);
    setBusy(null);
    if (!r.success) {
      setError(r.message || "Couldn't send a code. Try again.");
      return;
    }
    setCode("");
    setCooldown(RESEND_SECONDS);
    setNotice(r.message);
    setStep("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!CODE_PATTERN.test(code)) {
      setError("Enter the 6 digits from the SMS.");
      return;
    }
    setBusy("verify");
    const r = await identityVerifyCode(cleanPhone(phone), code);
    setBusy(null);
    if (!r.success || !r.data) {
      setError(r.message || "That code didn't work.");
      setCode("");
      return;
    }
    setToken(r.data.accessToken);
    setBureaus(r.data.bureaus);
    setLinking(r.data.bureaus.length === 0);
    setNotice(null);
    setStep("bureaus");
  };

  const pick = async (b: IdentityBureauDto) => {
    if (!token) return;
    setError(null);
    setBusy(b.companyId);
    const r = await identityPick(token, b.companyId);
    if (!r.success || !r.data) {
      setBusy(null);
      setError(r.message || "Couldn't open that bureau.");
      return;
    }
    signInWithTokens(r.data, cleanPhone(phone)); // AuthProvider takes it to the dashboard
  };

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (!clientCode.trim() || !password) {
      setError("Enter the client code and password that bureau gave you.");
      return;
    }
    setBusy("link");
    const r = await identityLink(token, clientCode.trim().toUpperCase(), password);
    setBusy(null);
    if (!r.success || !r.data) {
      setError(r.message || "Couldn't link that account.");
      return;
    }
    const linked = r.data;
    setBureaus((list) => [...list.filter((x) => x.companyId !== linked.companyId), linked]
      .sort((a, b) => a.companyName.localeCompare(b.companyName)));
    setClientCode("");
    setPassword("");
    setLinking(false);
    setNotice(`${linked.companyName} is linked. Pick it below.`);
  };

  const restart = () => {
    setStep("phone");
    setToken(null);
    setBureaus([]);
    setLinking(false);
    setError(null);
    setNotice(null);
  };

  const alert = error && (
    <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {error}
    </div>
  );
  const status = notice && !error && (
    <div role="status" className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
      {notice}
    </div>
  );

  if (step === "phone") {
    return (
      <>
        <p className="mt-2 text-base text-slate-600">
          One sign-in for every bureau you use. We'll text you a code.
        </p>
        {alert}
        <form onSubmit={sendCode} noValidate className="mt-8 space-y-5">
          <div>
            <label htmlFor="pl-phone" className="mb-1.5 block text-sm font-medium text-slate-800">
              Phone number
            </label>
            <input
              id="pl-phone"
              ref={firstInput}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254712345678"
              disabled={busy !== null}
              className={inputBase}
            />
          </div>
          <button type="submit" disabled={busy !== null} className={primaryBtn}>
            {busy === "send" && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy === "send" ? "Sending…" : "Send code"}
          </button>
        </form>
      </>
    );
  }

  if (step === "code") {
    return (
      <>
        <button
          type="button"
          onClick={restart}
          className="-ml-1 mt-4 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Change number
        </button>
        {alert}
        {status}
        <form onSubmit={verify} noValidate className="mt-6 space-y-5">
          <div>
            <label htmlFor="pl-code" className="mb-1.5 block text-sm font-medium text-slate-800">
              Code sent to {cleanPhone(phone)}
            </label>
            <input
              id="pl-code"
              ref={firstInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 digits"
              disabled={busy !== null}
              className={`${inputBase} text-center text-xl tracking-[0.4em] tabular-nums`}
            />
          </div>
          <button type="submit" disabled={busy !== null} className={primaryBtn}>
            {busy === "verify" && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy === "verify" ? "Checking…" : "Continue"}
          </button>
        </form>
        <div className="mt-6 text-sm text-slate-600">
          {cooldown > 0 ? (
            <span aria-live="polite">You can ask for a new code in {cooldown}s.</span>
          ) : (
            <button type="button" onClick={() => sendCode()} className="font-semibold text-blue-700 hover:underline">
              Send a new code
            </button>
          )}
        </div>
      </>
    );
  }

  // step === "bureaus"
  return (
    <>
      <p className="mt-2 text-base text-slate-600">
        {bureaus.length > 0 ? "Choose the bureau to open." : "Link the first bureau you use."}
      </p>
      {alert}
      {status}

      {bureaus.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {bureaus.map((b) => (
            <li key={b.companyId}>
              <button
                type="button"
                onClick={() => pick(b)}
                disabled={busy !== null}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-slate-900">{b.companyName}</span>
                  <span className="block truncate text-sm text-slate-500">{b.clientCode}</span>
                </span>
                {busy === b.companyId ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {linking ? (
        <form onSubmit={link} noValidate className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Use the client code and password from that bureau's welcome SMS. The account must be on {cleanPhone(phone)}.
          </p>
          <div>
            <label htmlFor="pl-ccode" className="mb-1.5 block text-sm font-medium text-slate-800">Client code</label>
            <input
              id="pl-ccode"
              ref={firstInput}
              type="text"
              autoCapitalize="characters"
              spellCheck={false}
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase())}
              placeholder="AFB-CL-2026-0001"
              disabled={busy !== null}
              className={`${inputBase} tracking-wide`}
            />
          </div>
          <div>
            <label htmlFor="pl-pass" className="mb-1.5 block text-sm font-medium text-slate-800">Password</label>
            <input
              id="pl-pass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy !== null}
              className={inputBase}
            />
          </div>
          <div className="flex gap-2">
            {bureaus.length > 0 && (
              <button
                type="button"
                onClick={() => setLinking(false)}
                className="h-11 flex-1 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
            <button type="submit" disabled={busy !== null} className={`${primaryBtn} h-11 flex-1`}>
              {busy === "link" && <Loader2 className="h-4 w-4 animate-spin" />}
              Link bureau
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setLinking(true);
            setNotice(null);
          }}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
        >
          <Plus className="h-4 w-4" />
          Link another bureau
        </button>
      )}

      <button type="button" onClick={restart} className="mt-8 block text-sm text-slate-500 hover:text-slate-800">
        Use a different number
      </button>
    </>
  );
}
