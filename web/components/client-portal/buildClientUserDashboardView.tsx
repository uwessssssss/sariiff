"use client";

import { BureauSwitcher } from "@/components/LinkedBureaus";
import { LogOut, MessageCircle, X } from "lucide-react";
import { SUPPORT_WHATSAPP } from "./helpers";
import { SarifMark } from "../SarifMark";
import { type useClientUserDashboard } from "./useClientUserDashboard";

/** Values ClientUserDashboard works out once its data is ready (after the loading/error screens). */
export function buildClientUserDashboardView(vm: ReturnType<typeof useClientUserDashboard>) {
  const { activeView, handleContactSupport, menuItems, onLogout, profile, setActiveView, userName } = vm;
  const displayName = profile?.fullName || userName;
  const firstName = displayName.trim().split(/\s+/)[0];
  const clientInitials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const ClientSidebar = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <SarifMark size={32} className="shrink-0 rounded-[7px] ring-1 ring-white/15" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold leading-tight text-white">Sarif</div>
          <div className="text-xs text-slate-400">Client account</div>
        </div>
        {onNavigate && (
          <button onClick={onNavigate} aria-label="Close menu" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <BureauSwitcher phone={profile?.whatsAppNumber ?? ""} />
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
        {menuItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveView(item.id);
                onNavigate?.();
              }}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon className={`h-[18px] w-[18px] shrink-0 ${active ? "text-blue-300" : ""}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {(item.badge ?? 0) > 0 && (
                <span className="min-w-[20px] rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold leading-5 text-white">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        {SUPPORT_WHATSAPP && (
          <button
            onClick={handleContactSupport}
            className="mt-3 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <MessageCircle className="h-[18px] w-[18px] shrink-0" />
            Contact your bureau
          </button>
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-white">
            {clientInitials || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{displayName}</div>
            <div className="truncate text-xs text-slate-400">{profile?.code}</div>
          </div>
          <button
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            className="rounded-md p-2 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
  const sectionHead = "flex items-baseline justify-between border-b border-slate-200 px-5 py-4";
  const th = "px-4 py-2.5 text-left text-sm font-medium whitespace-nowrap text-slate-600";

  return {
    displayName,
    firstName,
    clientInitials,
    ClientSidebar,
    sectionHead,
    th,
  };
}
