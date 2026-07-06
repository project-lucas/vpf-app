"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setNotificationsEnabled } from "@/app/actions/settings";
import { subscribeToPush } from "@/components/PushPrompt";
import { EditorialSwitch } from "@/components/editorial/EditorialSwitch";

export function NotificationsToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  async function toggle() {
    setLoading(true);
    const next = !isEnabled;
    try {
      if (next && "Notification" in window) {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm === "granted") await subscribeToPush();
      }
      const result = await setNotificationsEnabled(next);
      if (result.ok) {
        setIsEnabled(next);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border-2 border-ink bg-card p-4">
      <div>
        <p className="ed-value text-xl text-ink">Rappels &amp; bilan</p>
        <p className="mt-1.5 font-body text-sm leading-relaxed text-meta">
          30 min avant chaque événement — bilan dim. 18h45.
        </p>
        {isEnabled && permission === "denied" && (
          <p className="ed-meta mt-1.5 text-[10px] leading-relaxed text-orange">
            Bloquées par le navigateur — voir réglages du téléphone.
          </p>
        )}
      </div>
      <EditorialSwitch
        checked={isEnabled}
        onChange={toggle}
        disabled={loading}
        label="Activer les notifications push"
      />
    </div>
  );
}
