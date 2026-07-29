"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { markAnnouncementsRead } from "@/app/actions/messages";
import { BellIcon } from "@/components/icons";
import { formatAgoFr } from "@/lib/dates";
import type { Announcement } from "@/lib/types";

/**
 * Cloche flottante des annonces du club (angle haut droit de tous les écrans
 * joueur). Badge rouge = annonces non lues ; l'ouverture du panneau les marque
 * lues. Les annonces sont publiées par les admins (lives, événements…) et déjà
 * filtrées par la RLS selon l'offre du joueur.
 */
export function AnnouncementsBell({
  announcements,
  initialUnreadIds,
}: {
  announcements: Announcement[];
  initialUnreadIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [unreadIds, setUnreadIds] = useState(new Set(initialUnreadIds));

  function openPanel() {
    setOpen(true);
    if (unreadIds.size > 0) {
      // marquées lues dès l'ouverture : le badge ne doit pas survivre au panneau
      void markAnnouncementsRead([...unreadIds]);
    }
  }

  function closePanel() {
    setOpen(false);
    setUnreadIds(new Set());
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-label={
          unreadIds.size > 0
            ? `Annonces du club — ${unreadIds.size} non lue${unreadIds.size > 1 ? "s" : ""}`
            : "Annonces du club"
        }
        className="fixed right-[22px] top-4 z-40 flex h-11 w-11 items-center justify-center rounded-md border-2 border-ink bg-paper text-ink shadow-lg transition-transform hover:scale-105 active:scale-95 sm:right-8 lg:right-16"
      >
        <BellIcon size={20} />
        {unreadIds.size > 0 && (
          <span className="ed-value absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange px-1 text-[11px] leading-none text-paper">
            {unreadIds.size}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-[22px] pb-8 pt-16 sm:px-8"
          onClick={closePanel}
        >
          <div
            role="dialog"
            aria-label="Annonces du club"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[75vh] w-full max-w-lg flex-col rounded-lg border-2 border-ink bg-paper shadow-xl"
          >
            <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
              <p className="ed-overline flex items-center gap-1.5">
                <BellIcon size={13} />
                Annonces du club
              </p>
              <button
                type="button"
                onClick={closePanel}
                aria-label="Fermer les annonces"
                className="flex h-8 w-8 items-center justify-center rounded-md text-ink hover:bg-ink/5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {announcements.length === 0 ? (
                <p className="ed-meta py-8 text-center text-[11px] text-meta">
                  Aucune annonce pour le moment.
                </p>
              ) : (
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <article
                      key={a.id}
                      className={`rounded-md border-2 px-3.5 py-3 ${
                        unreadIds.has(a.id) ? "border-orange bg-card" : "border-ink/15 bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="ed-value text-sm text-ink">{a.title}</h3>
                        {unreadIds.has(a.id) && (
                          <span className="ed-meta shrink-0 text-[9px] text-orange">Nouveau</span>
                        )}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink/90">
                        {a.body}
                      </p>
                      <p className="ed-meta mt-2 text-[10px] text-meta">
                        {formatAgoFr(a.created_at)}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
