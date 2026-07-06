"use client";

import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/actions/settings";
import { Button } from "@/components/ui/Button";
import { BellIcon } from "@/components/icons";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function subscribeToPush(): Promise<boolean> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const result = await savePushSubscription({
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  });
  return result.ok;
}

/**
 * Bandeau affiché au joueur tant qu'il n'a pas autorisé les notifications.
 * Si l'autorisation est déjà accordée, la subscription est resynchronisée
 * silencieusement.
 */
export function PushPrompt({ notificationsEnabled }: { notificationsEnabled: boolean }) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!notificationsEnabled) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission === "default") {
      setVisible(true);
    } else if (Notification.permission === "granted") {
      subscribeToPush().catch(() => {});
    }
  }, [notificationsEnabled]);

  async function enable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") await subscribeToPush();
    } finally {
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-lg px-4 pb-2">
      <div className="flex items-center gap-3 rounded-2xl border border-navy-100 bg-white p-3.5 shadow-lg">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white">
          <BellIcon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy-900">Active tes rappels</p>
          <p className="text-xs text-navy-400">Reçois un rappel avant chaque événement.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button size="sm" onClick={enable} disabled={loading}>
            Activer
          </Button>
          <button
            onClick={() => setVisible(false)}
            className="text-xs font-medium text-navy-400"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
