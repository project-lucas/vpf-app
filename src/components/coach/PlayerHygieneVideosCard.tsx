"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Video } from "lucide-react";
import { setHygieneVideoVisibility } from "@/app/actions/hygiene";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { HygieneVideo } from "@/lib/types";

/**
 * Fiche joueur, onglet Hygiène : interrupteur vidéo par vidéo. Activer une
 * vidéo l'affiche dans l'onglet Hygiène de vie du joueur (offre formation) et
 * lui envoie un push. Le catalogue se gère dans la Bibliothèque (admins).
 */
export function PlayerHygieneVideosCard({
  playerId,
  videos,
  initialAssignedIds,
}: {
  playerId: string;
  videos: HygieneVideo[];
  initialAssignedIds: string[];
}) {
  const [assigned, setAssigned] = useState(new Set(initialAssignedIds));
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(videoId: string) {
    const next = !assigned.has(videoId);
    setError(null);
    setPendingId(videoId);
    startTransition(async () => {
      const result = await setHygieneVideoVisibility(videoId, next ? [playerId] : [], [playerId]);
      if (result.ok) {
        setAssigned((prev) => {
          const s = new Set(prev);
          if (next) s.add(videoId);
          else s.delete(videoId);
          return s;
        });
      } else {
        setError(result.error);
      }
      setPendingId(null);
    });
  }

  return (
    <Card>
      <CardTitle>
        <Video size={15} className="-mt-0.5 mr-1.5 inline" />
        Vidéos éducatives
      </CardTitle>
      <p className="mb-3 text-xs text-navy-400">
        Active une vidéo pour qu&apos;elle apparaisse dans l&apos;onglet Hygiène de vie du joueur
        (il reçoit une notification).
      </p>

      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {videos.length === 0 ? (
        <p className="text-sm text-navy-400">
          Aucune vidéo dans la base — elles se créent dans la Bibliothèque (admins).
        </p>
      ) : (
        <div className="divide-y divide-navy-50">
          {videos.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-800">
                  {v.title}
                  {v.category && (
                    <Badge tone="neutral" className="ml-1.5 align-middle">
                      {v.category}
                    </Badge>
                  )}
                </p>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-navy-400 underline hover:text-navy-600"
                >
                  <ExternalLink size={11} /> Voir la vidéo
                </a>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <span className="text-xs font-semibold text-navy-500">
                  {assigned.has(v.id) ? "Visible" : "Masquée"}
                </span>
                <input
                  type="checkbox"
                  checked={assigned.has(v.id)}
                  disabled={pendingId === v.id}
                  onChange={() => toggle(v.id)}
                  className="h-4 w-4 accent-navy-800"
                />
              </label>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
