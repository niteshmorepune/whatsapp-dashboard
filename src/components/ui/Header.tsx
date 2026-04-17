"use client";

import { Menu } from "lucide-react";
import { Avatar } from "./Avatar";

interface HeaderProps {
  user: { name: string; email: string; role: string };
  onMenuClick: () => void;
}

export function Header({ user, onMenuClick }: HeaderProps) {
  return (
    <header className="h-14 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-4 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-white">{user.name}</p>
          <p className="text-xs text-gray-400 capitalize">{user.role.toLowerCase()}</p>
        </div>
        <Avatar name={user.name} size="sm" />
      </div>
    </header>
  );
}
