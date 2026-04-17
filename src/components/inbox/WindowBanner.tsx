"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { getWindowTimeLeft } from "@/lib/utils";

interface WindowBannerProps {
  windowExpiresAt: string | null;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function WindowBanner({ windowExpiresAt }: WindowBannerProps) {
  const [timeLeft, setTimeLeft] = useState(() =>
    getWindowTimeLeft(windowExpiresAt)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getWindowTimeLeft(windowExpiresAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [windowExpiresAt]);

  const twoHours = 2 * 60 * 60 * 1000;

  if (timeLeft > twoHours) return null;

  const isExpired = timeLeft <= 0;

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-xs font-medium border-b ${
        isExpired
          ? "bg-red-900/30 text-red-400 border-red-800"
          : "bg-yellow-900/30 text-yellow-400 border-yellow-800"
      }`}
    >
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      {isExpired ? (
        <span>
          24-hour messaging window has expired. You can only send approved templates.
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Messaging window closing in{" "}
          <strong>{formatCountdown(timeLeft)}</strong>. After this, only
          templates can be sent.
        </span>
      )}
    </div>
  );
}
