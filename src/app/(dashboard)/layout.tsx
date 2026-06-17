"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/Sidebar";
import { Header } from "@/components/ui/Header";
import { Toaster } from "sonner";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  usePushNotifications();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    redirect("/login");
  }

  const user = {
    name: session.user.name ?? "Agent",
    email: session.user.email ?? "",
    role: session.user.role ?? "AGENT",
  };

  return (
    <div className="h-screen flex bg-gray-950 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-56 transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar role={user.role} onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: "#1f2937",
            border: "1px solid #374151",
            color: "#f9fafb",
          },
        }}
      />
    </div>
  );
}
