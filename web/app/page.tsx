"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { Loader2 } from "lucide-react";
import { SarifMark } from "@/components/SarifMark";

export default function HomePage() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated && user) {
      // Redirect to appropriate dashboard based on role
      switch (user.role) {
        case "super-admin":
          router.push("/admin/dashboard");
          break;
        case "office-user":
          router.push("/office/dashboard");
          break;
        case "client":
          router.push("/client/dashboard");
          break;
        default:
          router.push("/login");
      }
    } else {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, user, router]);

  // Shown for a moment while we check the session and redirect
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <SarifMark size={44} />
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Loading" />
    </div>
  );
}
