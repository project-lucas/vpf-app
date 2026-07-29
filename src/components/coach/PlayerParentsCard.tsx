"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Link2, Trash2, UserPlus, Users } from "lucide-react";
import {
  createParentInvitation,
  deleteParentInvitation,
  removeParentLink,
} from "@/app/actions/parents";
import { formatAgoFr } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";

interface PendingInvitation {
  id: string;
  label: string;
  created_at: string;
}

/**
 * Fiche joueur : comptes parents liés + invitations en attente (2 max au
 * total). Le lien d'invitation se copie et s'envoie au parent par n'importe
 * quel canal ; le parent crée son compte dessus et suit son enfant en lecture
 * seule (planning, stats, hygiène) + participe au fil de discussion.
 */
export function PlayerParentsCard({
  playerId,
  parents,
  invitations,
}: {
  playerId: string;
  parents: { id: string; name: string }[];
  invitations: PendingInvitation[];
}) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const total = parents.length + invitations.length;

  function invitationUrl(id: string): string {
    return `${window.location.origin}/invitation-parent/${id}`;
  }

  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(invitationUrl(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError("Copie impossible — copie le lien à la main.");
    }
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createParentInvitation(playerId, label);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLabel("");
      await copyLink(result.invitationId);
    });
  }

  function revoke(invitationId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteParentInvitation(invitationId, playerId);
      if (!result.ok) setError(result.error);
    });
  }

  function unlink(parentId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeParentLink(parentId, playerId);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <Card>
      <CardTitle>
        <Users size={15} className="-mt-0.5 mr-1.5 inline" />
        Parents ({total}/2)
      </CardTitle>
      <p className="mb-3 text-xs text-navy-400">
        Un compte parent suit le joueur en lecture seule (planning, stats, hygiène) et participe à
        la conversation avec le coach.
      </p>

      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      {parents.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {parents.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-xl bg-navy-50 px-3 py-2"
            >
              <p className="min-w-0 truncate text-sm font-semibold text-navy-800">{p.name}</p>
              <button
                type="button"
                onClick={() => unlink(p.id)}
                disabled={isPending}
                aria-label={`Retirer l'accès de ${p.name}`}
                className="shrink-0 rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {invitations.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-navy-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy-600">
                  <Link2 size={13} className="-mt-0.5 mr-1 inline" />
                  {inv.label || "Invitation parent"}
                </p>
                <p className="text-[11px] text-navy-300">
                  En attente · créée {formatAgoFr(inv.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => copyLink(inv.id)}
                  aria-label="Copier le lien d'invitation"
                  className="rounded-lg p-1.5 text-navy-400 transition-colors hover:bg-navy-50 hover:text-navy-700"
                >
                  {copiedId === inv.id ? (
                    <Check size={14} className="text-success" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => revoke(inv.id)}
                  disabled={isPending}
                  aria-label="Révoquer cette invitation"
                  className="rounded-lg p-1.5 text-navy-300 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {total < 2 && (
        <div className="flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value.slice(0, 60))}
            placeholder="Repère — ex. Maman de Yanis"
            className="min-w-0 flex-1 rounded-xl border border-navy-200 px-3.5 py-2.5 text-sm focus:border-navy-600 focus:outline-none"
          />
          <Button size="sm" onClick={create} loading={isPending}>
            <UserPlus size={14} /> Inviter
          </Button>
        </div>
      )}
      {copiedId && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-success">
          <Check size={12} /> Lien copié — envoie-le au parent.
        </p>
      )}
    </Card>
  );
}
