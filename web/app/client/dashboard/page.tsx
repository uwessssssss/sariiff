"use client";

import { useAuth } from "@/providers/AuthProvider";
import { ClientUserDashboard } from "@/components/client-portal/ClientUserDashboard";

export default function ClientDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <ClientUserDashboard
      userName={user?.name || "Client"}
      onLogout={logout}
    />
  );
}
