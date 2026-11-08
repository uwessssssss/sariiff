"use client";
import { useAuth } from "@/providers/AuthProvider";
import { OfficeUserDashboard } from "@/components/OfficeUserDashboard";

export default function OfficeClientsPage() {
  const { user, logout } = useAuth();
  return (
    <OfficeUserDashboard
      userName={user?.name || "Office User"}
      onLogout={logout}
      activeTab="clients"
    />
  );
}
