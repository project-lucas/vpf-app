"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, Send, X } from "lucide-react";
import { sendConversationMessage } from "@/app/actions/messages";
import { JarvisAvatar } from "@/components/coach/JarvisAvatar";
import { JarvisChat } from "@/components/coach/JarvisChat";
import { MESSAGE_MAX_LENGTH } from "@/lib/constants";
import type { BriefRecommendation } from "@/lib/briefs";

/** Une recommandation de Jarvis pour ce joueur, avec son message prêt à partir. */
function PlayerReco({ playerId, reco }: { playerId: string; reco: BriefRecommendation }) {
  const [draft, setDraft] = useState(reco.message ?? "");
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-sand bg-white p-3.5">
      <p className="text-[13.5px] font-bold text-navy-900">{reco.title}</p>
      <p className="mt-1 text-[12.5px] leading-snug text-navy-500">{reco.why}</p>
      {reco.message !== null && !sent && (
        <>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))}
              rows={3}
              className="mt-2 w-full rounded-xl border border-navy-200 px-3 py-2 text-[13px] focus:border-navy-600 focus:outline-none"
            />
          ) : (
            <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-[13px] leading-snug text-navy-900">{draft}</p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10.5px] text-navy-300">Fil Global · lu aussi par les parents</span>
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-cream px-3 text-[11.5px] font-bold text-navy-700 hover:bg-sand"
              >
                <Pencil size={11} />
                {editing ? "Aperçu" : "Modifier"}
              </button>
              <button
                type="button"
                disabled={isPending || !draft.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const r = await sendConversationMessage(playerId, draft, null);
                    if (r.ok) setSent(true);
                    else setError(r.error);
                  })
                }
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-navy-800 px-3 text-[11.5px] font-bold text-white hover:bg-navy-700 disabled:opacity-60"
              >
                <Send size={11} />
                {isPending ? "Envoi…" : "Envoyer"}
              </button>
            </span>
          </div>
        </>
      )}
      {sent && (
        <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-success">
          <Check size={13} /> Envoyé
        </p>
      )}
      {error && <p className="mt-1 text-[11px] font-semibold text-danger">{error}</p>}
    </div>
  );
}

/**
 * Jarvis pour UN joueur : ses recommandations du matin (avec leur message
 * prêt à envoyer), puis la conversation avec Jarvis centrée sur lui — on lui
 * pose des questions sur ce joueur, on lui demande d'agir pour lui.
 */
export function JarvisPlayerBox({
  playerId,
  firstName,
  groupId,
  recos,
  configured,
}: {
  playerId: string;
  firstName: string;
  groupId: string | null;
  recos: BriefRecommendation[];
  configured: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="px-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy-400">
        Suggestions du matin · {recos.length}
      </p>
      {recos.length === 0 ? (
        <p className="rounded-2xl border border-sand bg-white px-4 py-3 text-[13px] text-navy-400">
          Rien de particulier pour {firstName} dans le brief de ce matin.
        </p>
      ) : (
        recos.map((r, i) => <PlayerReco key={i} playerId={playerId} reco={r} />)
      )}
      <p className="px-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-navy-400">
        Parler à Jarvis de {firstName}
      </p>
      <JarvisChat groupId={groupId} configured={configured} focus={{ id: playerId, firstName }} />
    </div>
  );
}

/** Le bouton « Demander à Jarvis » de la fiche, et son volet par-dessus la page. */
export function JarvisPlayerButton(props: {
  playerId: string;
  firstName: string;
  groupId: string | null;
  recos: BriefRecommendation[];
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent py-1 pl-1.5 pr-4 text-[13px] font-extrabold text-white hover:opacity-90"
      >
        <JarvisAvatar size={30} />
        Demander à Jarvis
        {props.recos.length > 0 && (
          <span className="rounded-full bg-white px-1.5 text-[10.5px] font-extrabold text-accent">
            {props.recos.length}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label="Fermer le volet"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-900/40"
          />
          <aside
            role="dialog"
            aria-labelledby="jarvis-player-title"
            className="relative flex h-full w-full max-w-[520px] flex-col bg-cream shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-sand bg-white px-5 py-4">
              <h2
                id="jarvis-player-title"
                className="font-display flex items-center gap-2.5 text-[19px] font-extrabold uppercase tracking-wide text-navy-900"
              >
                <JarvisAvatar size={34} />
                Jarvis · {props.firstName}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-9 w-9 items-center justify-center rounded-full text-navy-500 hover:bg-cream"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <JarvisPlayerBox {...props} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
