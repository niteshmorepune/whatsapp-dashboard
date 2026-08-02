"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  MessageSquare,
  Users,
  FileText,
  UserCog,
  BarChart2,
  LogOut,
  X,
  CircleUser,
  Radio,
  Zap,
  HelpCircle,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  role: string;
  onClose?: () => void;
}

const navItems = [
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/broadcasts", label: "Broadcasts", icon: Radio },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/quick-replies", label: "Quick Replies", icon: Zap },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
];

export function Sidebar({ role, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="h-full flex flex-col bg-gray-950 border-r border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-sm">WA Dashboard</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                active
                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}

        {role === "ADMIN" && (
          <Link
            href="/agents"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              pathname.startsWith("/agents")
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
          >
            <UserCog className="w-4 h-4 flex-shrink-0" />
            Agents
          </Link>
        )}

        {role === "ADMIN" && (
          <Link
            href="/numbers"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
              pathname.startsWith("/numbers")
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
          >
            <Phone className="w-4 h-4 flex-shrink-0" />
            Numbers
          </Link>
        )}
      </nav>

      {/* Profile + Logout */}
      <div className="p-3 border-t border-gray-800 space-y-1">
        <Link
          href="/help"
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
            pathname.startsWith("/help")
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          )}
        >
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          Help & Guide
        </Link>
        <Link
          href="/profile"
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
            pathname.startsWith("/profile")
              ? "bg-green-500/10 text-green-400 border border-green-500/20"
              : "text-gray-400 hover:text-white hover:bg-gray-800"
          )}
        >
          <CircleUser className="w-4 h-4 flex-shrink-0" />
          My Profile
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-900/10 transition-all"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );
}
