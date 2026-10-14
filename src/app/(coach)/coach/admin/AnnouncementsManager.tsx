"use client";

import { useState, useTransition } from "react";
import { Megaphone, Trash2 } from "lucide-react";
import { deleteAnnouncement, publishAnnouncement } from "@/app/actions/messages";
import {
  ANNOUNCEMENT_BODY_MAX_LENGTH,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
} from "@/lib/constants";
import { formatAgoFr } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Announcement, AnnouncementAudience } from "@/lib/types";

const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string; hint: string }[] = [
  { value: "all", label: "Tout le monde", hint: "tous les joueurs actifs" },
  { value: "perf", label: "Joueurs Perf", hint: "offre 1 uniquement" },
  { value: "formation", label: "Joueurs Formation", hint: "offre 2 uniquement" },
];

const AUDIENCE_BADGE: Record<AnnouncementAudience, string> = {
  all: "Tous",
  perf: "Perf",
  formation: "Formation",
};

/**
 * Publication et gestion des annonces du club (page Staff, admins uniquement —
 * la RLS refuse l'écriture aux autres). Chaque annonce part en push à tous les
 * joueurs actifs ciblés et apparaît dans la cloche de leur interface.
 */
export function AnnouncementsManager({ announcements }: { announcements: Announcement[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function publish() {
    setMessage(null);
    startTransition(async () => {
      const result = await publishAnnouncement({ title, body, audience });
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setTitle("");
      setBody("");
      setAudience("all");
      setMessage({ ok: true, text: "Annonce publiée et envoyée en notification." });
    });
  }

  function remove(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      const result = await deleteAnnouncement(id);
      if (!result.ok) setMessage({ ok: false, text: result.error });
      setDeletingId(null);
    });
  }

  return (
    <Card>
      <CardTitle>
        <Megaphone size={15} className="-mt-0.5 mr-1.5 inline" />
        Annonces aux joueurs
      </CardTitle>
      <p className="mb-3 text-xs text-navy-400">
        Lives, événements, infos du club : l&apos;annonce arrive en notification push et dans la
        cloche de l&apos;application des joueurs ciblés.
      </p>

      <div className="space-y-2.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, ANNOUNCEMENT_TITLE_MAX_LENGTH))}
          placeholder="Titre — ex. Live spécial tirs jeudi 20h"
          className="w-full rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, ANNOUNCEMENT_BODY_MAX_LENGTH))}
          placeholder="Le message que les joueurs liront…"
          rows={3}
          className="w-full rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
        />

        <div className="flex flex-wrap gap-1.5">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAudience(opt.value)}
              title={opt.hint}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                audience === opt.value
                  ? "bg-navy-800 text-white"
                  : "bg-navy-50 text-navy-500 hover:bg-navy-100"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {message && (
          <p
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              message.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
            }`}
          >
            {message.text}
          </p>
        )}

        <Button
          onClick={publish}
          loading={isPending && deletingId === null}
          disabled={!title.trim() || !body.trim()}
        >
          Publier l&apos;annonce
        </Button>
      </div>

      {announcements.length > 0 && (
        <div className="mt-4 divide-y divide-navy-50 border-t border-navy-100">
          {announcements.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-800">
                  {a.title}
                  <Badge
                    tone={a.audience === "all" ? "neutral" : "navy"}
                    className="ml-1.5 align-middle"
                  >
                    {AUDIENCE_BADGE[a.audience]}
                  </Badge>
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-navy-500">{a.body}</p>
                <p className="mt-0.5 text-[11px] text-navy-300">{formatAgoFr(a.created_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(a.id)}
                disabled={isPending}
                aria-label={`Supprimer l'annonce « ${a.title} »`}
                className="shrink-0 rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
