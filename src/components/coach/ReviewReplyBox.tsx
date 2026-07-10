"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircle } from "lucide-react";
import { setReviewReply } from "@/app/actions/coach";
import { REVIEW_REPLY_MAX_LENGTH } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

/**
 * Réponse du coach sous un bilan hebdo : bouton « Répondre » tant qu'aucune
 * réponse n'existe, sinon la réponse s'affiche et reste modifiable. Le joueur
 * la voit sur son planning et reçoit un push à la première réponse.
 */
export function ReviewReplyBox({
  reviewId,
  initialReply,
}: {
  reviewId: string;
  initialReply: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(initialReply);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      const result = await setReviewReply(reviewId, content);
      setError(result.ok ? null : result.error);
      if (result.ok) {
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    });
  }

  if (!editing) {
    return (
      <div className="mt-2 border-t border-navy-100 pt-2">
        {initialReply ? (
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-xs text-navy-600">
              <span className="font-semibold text-navy-800">Ta réponse : </span>
              {initialReply}
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 text-[11px] font-semibold text-navy-400 underline hover:text-navy-600"
            >
              Modifier
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-500 hover:text-navy-800"
          >
            <MessageCircle size={13} />
            Répondre au bilan
          </button>
        )}
        {saved && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success">
            <Check size={12} /> Envoyé au joueur
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-navy-100 pt-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, REVIEW_REPLY_MAX_LENGTH))}
        placeholder="Ex. : bien vu sur le tir — cette semaine on garde le même volume, ajoute 10 min de gainage."
        rows={2}
        autoFocus
        className="w-full rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
      />
      {error && (
        <p className="mt-1.5 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-navy-300">
          {content.length}/{REVIEW_REPLY_MAX_LENGTH}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button size="sm" variant="secondary" onClick={save} disabled={isPending}>
            Envoyer
          </Button>
        </div>
      </div>
    </div>
  );
}
