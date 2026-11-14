"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { SarifMark } from "@/components/SarifMark";
import { PhoneLogin } from "@/components/PhoneLogin";
import { identityEnabled } from "@/lib/api";

// ---------------------------------------------------------------------------
// Rules here mirror the backend (AuthService):
// - OTP is 6 digits and expires 5 minutes after it is sent.
// - Requesting a new code invalidates the previous one.
// - 5 wrong passwords lock the account for 30 minutes.
// Keep this page's copy in line with those rules.
// ---------------------------------------------------------------------------

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;
// Code prefixes are made from the bureau's name and may hold digits ("24/7 Forex" → "2FK")
// or be one letter: letters-only {2,4} told those bureaus their correct code was invalid.
const CODE_PATTERN = /^[A-Z0-9]{1,4}(-CL)?-\d{4}-\d{1,6}$/;
const PHONE_PATTERN = /^\+[1-9]\d{9,14}$/;

type FieldErrors = { code?: string; phone?: string; password?: string };

const cleanCode = (v: string) => v.trim().toUpperCase();
const cleanPhone = (v: string) => v.replace(/[\s-]/g, "");

// +254712345678 -> +254 ••• ••5678
const maskPhone = (phone: string) => {
  const p = cleanPhone(phone);
  if (p.length < 8) return p;
  return `${p.slice(0, 4)} ••• ••${p.slice(-4)}`;
};

export default function LoginPage() {
  const { login, verifyOtp, isLoading } = useAuth();

  // Step 1 — credentials
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Step 2 — verification code
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // Shared
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone login (one login, several bureaus) only shows when the server has it on.
  const [mode, setMode] = useState<"code" | "phone">("code");
  const [phoneLoginOn, setPhoneLoginOn] = useState(false);
  useEffect(() => {
    let alive = true;
    identityEnabled().then((on) => alive && setPhoneLoginOn(on));
    return () => {
      alive = false;
    };
  }, []);

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Resend cooldown tick
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Focus the first box when the OTP step opens
  useEffect(() => {
    if (step === "otp") otpRefs.current[0]?.focus();
    else codeInputRef.current?.focus();
  }, [step]);

  // ------------------------------------------------------------ validation
  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    const c = cleanCode(code);
    const p = cleanPhone(phone);
    if (!c) errs.code = "Enter your user code.";
    else if (!CODE_PATTERN.test(c))
      errs.code = "Check your code. It looks like AFB-2026-0001.";
    if (!p) errs.phone = "Enter your phone number.";
    else if (!PHONE_PATTERN.test(p))
      errs.phone = "Start with your country code, for example +254712345678 (Kenya) or +256772123456 (Uganda).";
    if (!password) errs.password = "Enter your password.";
    return errs;
  };

  // ------------------------------------------------------------ step 1
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const result = await login(cleanCode(code), cleanPhone(phone), password);
      if (!result.success) {
        setError(result.message || "Sign in failed. Check your details and try again.");
        return;
      }
      if (result.requiresOtp) {
        setDigits(Array(OTP_LENGTH).fill(""));
        setNotice(null);
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setStep("otp");
      }
      // Without OTP, AuthProvider redirects to the dashboard.
    } catch (err: any) {
      setError(err?.message || "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------ step 2
  const submitOtp = async (value: string) => {
    if (value.length !== OTP_LENGTH || submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await verifyOtp(cleanCode(code), cleanPhone(phone), value);
      if (!result.success) {
        setError(result.message || "That code didn't work. Check it and try again.");
        setDigits(Array(OTP_LENGTH).fill(""));
        otpRefs.current[0]?.focus();
      }
      // On success AuthProvider redirects.
    } catch (err: any) {
      setError(err?.message || "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const setDigitAt = (index: number, value: string) => {
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    return next;
  };

  const handleDigitChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      setDigitAt(index, "");
      return;
    }
    // Typing or autofill that delivers several digits at once
    if (value.length > 1) {
      fillFrom(index, value);
      return;
    }
    const next = setDigitAt(index, value);
    if (index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
    if (next.every((d) => d)) submitOtp(next.join(""));
  };

  const fillFrom = (start: number, value: string) => {
    const next = [...digits];
    let i = start;
    for (const ch of value) {
      if (i >= OTP_LENGTH) break;
      next[i++] = ch;
    }
    setDigits(next);
    otpRefs.current[Math.min(i, OTP_LENGTH - 1)]?.focus();
    if (next.every((d) => d)) submitOtp(next.join(""));
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setDigitAt(index - 1, "");
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      otpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      e.preventDefault();
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    fillFrom(index, pasted);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const value = digits.join("");
    if (value.length !== OTP_LENGTH) {
      setError(`Enter all ${OTP_LENGTH} digits.`);
      return;
    }
    submitOtp(value);
  };

  const handleResend = async () => {
    if (cooldown > 0 || submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await login(cleanCode(code), cleanPhone(phone), password);
      if (result.success && result.requiresOtp) {
        setDigits(Array(OTP_LENGTH).fill(""));
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setNotice("New code sent. Earlier codes no longer work.");
        otpRefs.current[0]?.focus();
      } else {
        setError(result.message || "Couldn't send a new code. Try again.");
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const backToCredentials = () => {
    setStep("credentials");
    setDigits(Array(OTP_LENGTH).fill(""));
    setError(null);
    setNotice(null);
  };

  const formatCooldown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ------------------------------------------------------------ render
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="Loading" />
      </div>
    );
  }

  const inputBase =
    "block w-full h-12 px-3.5 rounded-lg border bg-white text-base text-slate-900 placeholder:text-slate-500 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50";
  const inputState = (hasError?: string) =>
    hasError ? "border-red-500" : "border-slate-300 hover:border-slate-400";

  return (
    <div className="fixed inset-0 z-40 flex overflow-y-auto bg-slate-50">
      {/* Brand panel — desktop only */}
      <aside className="hidden lg:flex lg:w-[42%] xl:w-[40%] flex-col justify-between bg-[#0F172A] px-14 py-12 text-white">
        <div className="flex items-center gap-3">
          <SarifMark size={36} className="rounded-[7px] ring-1 ring-white/15" />
          <span className="text-xl font-bold tracking-tight">Sarif</span>
        </div>

        <div>
          <p className="max-w-sm text-lg leading-relaxed text-slate-300">
            Cash, bank, mobile money and client accounts for your bureau, in one ledger.
          </p>
          <div
            className="mt-10 grid grid-cols-2 gap-x-10 gap-y-2 text-6xl font-bold leading-none tracking-tight tabular-nums text-white/90 xl:text-7xl"
            aria-hidden="true"
          >
            <span>KES</span>
            <span className="text-white/35">UGX</span>
            <span className="text-white/35">USD</span>
            <span className="text-white/35">EUR</span>
          </div>
        </div>

        <p className="text-sm text-slate-400">© {new Date().getFullYear()} Sarif</p>
      </aside>

      {/* Form column */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden">
            <SarifMark size={32} />
            <span className="text-xl font-bold tracking-tight text-slate-900">Sarif</span>
          </div>

          {step === "credentials" ? (
            <>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Sign in</h1>

              {phoneLoginOn && (
                <div role="tablist" aria-label="Sign-in method" className="mt-6 grid grid-cols-2 rounded-lg bg-slate-200/70 p-1 text-sm font-medium">
                  {([
                    ["code", "Code & password"],
                    ["phone", "Phone number"],
                  ] as const).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => {
                        setMode(m);
                        setError(null);
                      }}
                      className={`h-9 rounded-md transition-colors ${
                        mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {phoneLoginOn && mode === "phone" ? (
                <PhoneLogin />
              ) : (
              <>
              <p className="mt-2 text-base text-slate-600">
                Use the code and password from your welcome SMS.
              </p>

              {error && (
                <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <form onSubmit={handleSignIn} noValidate className="mt-8 space-y-5">
                <div>
                  <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-800">
                    User code
                  </label>
                  <input
                    id="code"
                    ref={codeInputRef}
                    type="text"
                    autoComplete="username"
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      if (fieldErrors.code) setFieldErrors({ ...fieldErrors, code: undefined });
                    }}
                    placeholder="AFB-2026-0001"
                    aria-invalid={!!fieldErrors.code}
                    aria-describedby={fieldErrors.code ? "code-error" : undefined}
                    disabled={submitting}
                    className={`${inputBase} ${inputState(fieldErrors.code)} tracking-wide`}
                  />
                  {fieldErrors.code && (
                    <p id="code-error" className="mt-1.5 text-sm text-red-600">{fieldErrors.code}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-800">
                    Phone number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: undefined });
                    }}
                    placeholder="+254712345678"
                    aria-invalid={!!fieldErrors.phone}
                    aria-describedby={fieldErrors.phone ? "phone-error" : "phone-hint"}
                    disabled={submitting}
                    className={`${inputBase} ${inputState(fieldErrors.phone)}`}
                  />
                  {fieldErrors.phone ? (
                    <p id="phone-error" className="mt-1.5 text-sm text-red-600">{fieldErrors.phone}</p>
                  ) : (
                    <p id="phone-hint" className="mt-1.5 text-sm text-slate-500">
                      The number registered with your account, with country code.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-800">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                      }}
                      aria-invalid={!!fieldErrors.password}
                      aria-describedby={fieldErrors.password ? "password-error" : undefined}
                      disabled={submitting}
                      className={`${inputBase} ${inputState(fieldErrors.password)} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p id="password-error" className="mt-1.5 text-sm text-red-600">{fieldErrors.password}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <p className="mt-8 text-sm leading-relaxed text-slate-500">
                Office and admin accounts confirm each sign-in with a code sent by SMS.
                Forgot your password? Ask your bureau to reset it.
              </p>
              </>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={backToCredentials}
                className="-ml-1 mb-8 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <ArrowLeft className="h-4 w-4" />
                Use a different account
              </button>

              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Enter the code we sent
              </h1>
              <p className="mt-2 text-base text-slate-600">
                We sent a {OTP_LENGTH}-digit code by SMS to{" "}
                <span className="font-medium text-slate-900 tabular-nums whitespace-nowrap">{maskPhone(phone)}</span>.
                It expires 5 minutes after it's sent.
              </p>

              {error && (
                <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              )}
              {notice && !error && (
                <div role="status" className="mt-6 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                  {notice}
                </div>
              )}

              <form onSubmit={handleVerify} className="mt-8">
                <fieldset disabled={submitting}>
                  <legend className="sr-only">Verification code</legend>
                  <div className="flex justify-between gap-2">
                    {digits.map((d, i) => (
                      <input
                        key={i}
                        ref={(el) => {
                          otpRefs.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete={i === 0 ? "one-time-code" : "off"}
                        pattern="[0-9]*"
                        maxLength={i === 0 ? OTP_LENGTH : 1}
                        value={d}
                        aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                        onChange={(e) => handleDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(i, e)}
                        onPaste={(e) => handlePaste(i, e)}
                        onFocus={(e) => e.target.select()}
                        className={`h-14 w-full min-w-0 rounded-lg border bg-white text-center text-2xl font-semibold tabular-nums text-slate-900 outline-none transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50 ${
                          error ? "border-red-500" : "border-slate-300"
                        }`}
                      />
                    ))}
                  </div>
                </fieldset>

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Verifying…" : "Verify and sign in"}
                </button>
              </form>

              <div className="mt-6 text-sm text-slate-600">
                {cooldown > 0 ? (
                  <span aria-live="polite">
                    Didn't get it? You can request a new code in{" "}
                    <span className="tabular-nums">{formatCooldown(cooldown)}</span>.
                  </span>
                ) : (
                  <>
                    Didn't get it?{" "}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={submitting}
                      className="rounded font-semibold text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60"
                    >
                      Send a new code
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
