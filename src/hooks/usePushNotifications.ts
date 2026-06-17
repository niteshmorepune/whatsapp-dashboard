"use client";

import { useEffect } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export function usePushNotifications(): void {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    )
      return;

    async function setup() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const existing = await reg.pushManager.getSubscription();
        if (existing) return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
          ) as unknown as ArrayBuffer,
        });

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch {
        // Push setup failed silently — non-critical
      }
    }

    setup();
  }, []);
}
