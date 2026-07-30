"use client";

import { useEffect, useState } from "react";
import { setNotificationsEnabled } from "@/app/actions/settings";
import { subscribeToPush } from "@/components/PushPrompt";
import { EditorialSwitch } from "@/components/editorial/EditorialSwitch";

/**
 * Interrupteur des notifications push.
 *
 * variant "editorial" : écran joueur (thème Retro Varsity, scope .ed).
 * variant "coach"     : réglages coach/admin, style navy — mêmes actions, mais
 *                       la promesse change (messages et alertes santé, pas des
 *                       rappels de séance).
 */
export function NotificationsToggle({
  enabled,
  variant = "editorial",
}: {
  enabled: boolean;
  variant?: "editorial" | "coach";
}) {
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
      }
    } finally {
      setLoading(false);
    }
  }

  const blocked = isEnabled && permission === "denied";

  if (variant === "coach") {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-navy-800">Messages &amp; alertes santé</p>
          <p className="mt-1 text-xs leading-relaxed text-navy-400">
            Message d&apos;un joueur ou d&apos;un parent, et alerte dès qu&apos;un joueur se note
            6/10 ou plus en douleur au check-in.
          </p>
          {blocked && (
            <p className="mt-1.5 text-xs font-semibold text-danger">
              Bloquées par le navigateur — voir les réglages du téléphone.
            </p>
          )}
        </div>
        <EditorialSwitch
          checked={isEnabled}
          onChange={toggle}
          disabled={loading}
          label="Activer les notifications push"
          tone="navy"
        />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border-2 border-ink bg-card p-4">
      <div>
        <p className="ed-value text-xl text-ink">Rappels &amp; bilan</p>
        <p className="mt-1.5 font-body text-sm leading-relaxed text-meta">
          30 min avant chaque événement — bilan dim. 18h45.
        </p>
        {blocked && (
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
