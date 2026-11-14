"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { Loader2 } from "lucide-react";

export default function OfficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.replace("/login");
      } else if (user?.role !== "office-user") {
        // Redirect to correct dashboard based on role
        if (user?.role === "super-admin") {
          router.replace("/admin/dashboard");
        } else if (user?.role === "client") {
          router.replace("/client/dashboard");
        } else {
          router.replace("/login");
        }
      }
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-5 h-5 text-slate-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading…</p>
        </div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (!isAuthenticated || user?.role !== "office-user") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-5 h-5 text-slate-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Redirecting…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
