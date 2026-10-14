"use client";

import { useState, useTransition } from "react";
import { runMorningBrief } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { formatDateFr } from "@/lib/dates";

/**
 * Le passage de Claude du matin, vu d'Admin : la clé est-elle posée, quand
 * chaque groupe a eu son dernier brief, et un bouton pour l'écrire tout de
 * suite (test, ou relance après un raté).
 */
export function MorningBriefPanel({
  configured,
  groups,
}: {
  configured: boolean;
  groups: { id: string; name: string; lastDate: string | null }[];
}) {
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(groupId: string, name: string) {
    setNotice(null);
    setRunningId(groupId);
    startTransition(async () => {
      const result = await runMorningBrief(groupId);
      setRunningId(null);
      setNotice(
        result.ok
          ? { tone: "ok", text: `Brief du ${name} écrit${result.detail ? ` · ${result.detail}` : ""}.` }
          : { tone: "error", text: result.error }
      );
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-navy-500">
        Chaque matin à 7h, Jarvis lit l&apos;état de chaque groupe et écrit un brief : un résumé et
        des recommandations avec leurs messages prêts à envoyer, à lire dans le volet
        « Recommandations » de l&apos;accueil. Jarvis propose, le staff envoie.
      </p>
      <p
        className={`rounded-xl px-3 py-2 text-sm font-semibold ${
          configured ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
        }`}
      >
        {configured
          ? "Clé API Anthropic en place : le passage du matin est actif."
          : "Clé API Anthropic absente : rien ne tourne. À poser dans les variables d'environnement (ANTHROPIC_API_KEY), en local et sur Vercel."}
      </p>
      {notice && (
        <p
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            notice.tone === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {notice.text}
        </p>
      )}
      <div className="divide-y divide-navy-100 rounded-xl border border-navy-100 bg-white">
        {groups.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <span>
              <span className="block text-sm font-semibold text-navy-900">{g.name}</span>
              <span className="block text-[11px] text-navy-400">
                {g.lastDate ? `Dernier brief le ${formatDateFr(g.lastDate)}` : "Aucun brief écrit"}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={!configured || isPending}
              loading={runningId === g.id}
              onClick={() => run(g.id, g.name)}
            >
              Écrire maintenant
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
