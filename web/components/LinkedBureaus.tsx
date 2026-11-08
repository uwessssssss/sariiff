"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Building2, Check, Loader2, Plus, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  getLinkedBureaus,
  getStoredAuth,
  hasPhoneLogin,
  IdentityBureauDto,
  phoneLoginId,
  linkBureau,
  signOutEverywhere,
  switchBureau,
  unlinkBureau,
} from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

// Inside the client portal, for clients who signed in with their phone.
// Each bureau is a separate account: switching signs out of this bureau and into
// the other one; nothing (money, history, alerts) moves between them.

const currentCompanyId = () => getStoredAuth()?.user?.companyId;

// The portal sidebar is re-created on every render of the dashboard, so the list is
// kept here once per page load instead of being fetched again each time. It is tied
// to the phone login it belongs to, so a different person signing in on this tab
// never sees the previous person's bureaus.
let cached: { owner: string; list: IdentityBureauDto[] } | null = null;
const cachedList = () => {
  const owner = phoneLoginId();
  return owner && cached?.owner === owner ? cached.list : null;
};

function useBureaus() {
  const [bureaus, setLocal] = useState<IdentityBureauDto[] | null>(cachedList);
  const setBureaus = useCallback((next: (list: IdentityBureauDto[] | null) => IdentityBureauDto[]) => {
    setLocal((list) => {
      const updated = next(list);
      const owner = phoneLoginId();
      cached = owner ? { owner, list: updated } : null;
      return updated;
    });
  }, []);
  useEffect(() => {
    const owner = phoneLoginId();
    if (!owner || cachedList() !== null) return;
    let alive = true;
    getLinkedBureaus().then((r) => {
      const list = r.success && r.data ? r.data : [];
      cached = { owner, list };
      if (alive) setLocal(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { bureaus, setBureaus };
}

function useSwitch(phone: string) {
  const { signInWithTokens } = useAuth();
  const [switching, setSwitching] = useState<string | null>(null);
  const go = async (companyId: string) => {
    setSwitching(companyId);
    const r = await switchBureau(companyId);
    if (!r.success || !r.data) {
      setSwitching(null);
      toast.error(r.message || "Couldn't open that bureau");
      return;
    }
    // Not /api/auth/logout: that ends this client's sessions at this bureau on EVERY
    // device. This tab simply forgets the old tokens (overwritten below), then reloads
    // so nothing from this bureau stays on screen or in memory.
    cached = null;
    signInWithTokens(r.data, phone);
    window.location.replace("/client/dashboard");
  };
  return { switching, go };
}

/** Sidebar block: which bureau you're in, and a quick switch. Hidden for code+password sign-ins. */
export function BureauSwitcher({ phone }: { phone: string }) {
  const { bureaus } = useBureaus();
  const { switching, go } = useSwitch(phone);
  const [open, setOpen] = useState(false);
  if (!bureaus || bureaus.length < 2) return null;
  const here = currentCompanyId();
  const current = bureaus.find((b) => b.companyId === here);

  return (
    <div className="border-b border-white/10 px-3 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left hover:bg-white/10"
      >
        <Building2 className="h-4 w-4 shrink-0 text-blue-300" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-white">{current?.companyName ?? "This bureau"}</span>
          <span className="block text-[11px] text-slate-400">Switch bureau</span>
        </span>
        <ArrowLeftRight className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5">
          {bureaus.map((b) => {
            const isHere = b.companyId === here;
            return (
              <li key={b.companyId}>
                <button
                  type="button"
                  disabled={isHere || switching !== null}
                  onClick={() => go(b.companyId)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] text-slate-300 hover:bg-white/5 hover:text-white disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1 truncate">{b.companyName}</span>
                  {isHere && <Check className="h-4 w-4 text-blue-300" aria-label="Current" />}
                  {switching === b.companyId && <Loader2 className="h-4 w-4 animate-spin" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Profile card: every bureau on this phone login, link another, remove one, sign out everywhere. */
export function LinkedBureausCard({ phone, onSignedOut }: { phone: string; onSignedOut: () => void }) {
  const { bureaus, setBureaus } = useBureaus();
  const { switching, go } = useSwitch(phone);
  const [linking, setLinking] = useState(false);
  const [clientCode, setClientCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!hasPhoneLogin() || bureaus === null) return null;
  const here = currentCompanyId();

  const link = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientCode.trim() || !password) {
      toast.error("Enter the client code and password from that bureau");
      return;
    }
    setBusy("link");
    const r = await linkBureau(clientCode.trim().toUpperCase(), password);
    setBusy(null);
    if (!r.success || !r.data) {
      toast.error(r.message || "Couldn't link that account");
      return;
    }
    const linked = r.data;
    setBureaus((list) =>
      [...(list ?? []).filter((x) => x.companyId !== linked.companyId), linked].sort((a, b) =>
        a.companyName.localeCompare(b.companyName),
      ),
    );
    setClientCode("");
    setPassword("");
    setLinking(false);
    toast.success(`${linked.companyName} linked`);
  };

  const remove = async (b: IdentityBureauDto) => {
    if (!window.confirm(`Remove ${b.companyName} from your phone login? Your account there stays; you can still sign in with its code and password.`)) return;
    setBusy(b.companyId);
    const r = await unlinkBureau(b.companyId);
    setBusy(null);
    if (!r.success) {
      toast.error(r.message || "Couldn't remove it");
      return;
    }
    setBureaus((list) => (list ?? []).filter((x) => x.companyId !== b.companyId));
    toast.success(`${b.companyName} removed`);
  };

  const everywhere = async () => {
    if (!window.confirm("Sign out of your phone login on every device, including this one?")) return;
    setBusy("everywhere");
    const r = await signOutEverywhere();
    setBusy(null);
    if (!r.success) {
      toast.error(r.message || "Couldn't sign out everywhere");
      return;
    }
    onSignedOut();
  };

  const field =
    "block w-full h-11 px-3 rounded-lg border border-slate-300 bg-white text-[14px] text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20";

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-6">
        <h3 className="text-xl font-semibold text-blue-700">Linked bureaus</h3>
        <p className="mt-1 text-sm text-slate-600">
          Bureaus you open with your phone {phone}. Each one keeps its own balances and statements.
        </p>
      </div>
      <ul className="divide-y divide-slate-100">
        {bureaus.map((b) => {
          const isHere = b.companyId === here;
          return (
            <li key={b.companyId} className="flex items-center gap-3 px-6 py-3.5">
              <Building2 className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium text-slate-900">{b.companyName}</p>
                <p className="truncate text-[13px] text-slate-500">{b.clientCode}</p>
              </div>
              {isHere ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[12px] font-medium text-blue-700">Open now</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => go(b.companyId)}
                    disabled={switching !== null || busy !== null}
                    className="rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {switching === b.companyId ? "Opening…" : "Open"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(b)}
                    disabled={busy !== null}
                    className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    {busy === b.companyId ? "Removing…" : "Remove"}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="space-y-4 border-t border-slate-200 p-6">
        {linking ? (
          <form onSubmit={link} noValidate className="space-y-3">
            <p className="text-sm text-slate-600">
              Use the client code and password from the other bureau. That account must be on {phone}.
            </p>
            <input
              aria-label="Client code"
              value={clientCode}
              onChange={(e) => setClientCode(e.target.value.toUpperCase())}
              placeholder="Client code, e.g. KRB-CL-2026-0001"
              className={`${field} tracking-wide`}
            />
            <input
              aria-label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className={field}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLinking(false)}
                className="h-10 flex-1 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy !== null}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy === "link" && <Loader2 className="h-4 w-4 animate-spin" />}
                Link bureau
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setLinking(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
          >
            <Plus className="h-4 w-4" />
            Link another bureau
          </button>
        )}

        <button
          type="button"
          onClick={everywhere}
          disabled={busy !== null}
          className="flex items-center gap-2 text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
        >
          <Smartphone className="h-4 w-4" />
          {busy === "everywhere" ? "Signing out…" : "Sign out on every device"}
        </button>
      </div>
    </div>
  );
}
