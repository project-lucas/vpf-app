"use client";

import { useState } from "react";
import { createInvitation, deleteInvitation } from "@/app/actions/admin";
import { formatDateFr } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Check } from "lucide-react";
import { TrashIcon } from "@/components/icons";
import type { Invitation } from "@/lib/types";

type InvitationRow = Invitation & { used_by_name: string | null };

export function CoachInvitations({
  coachId,
  invitations,
  appUrl,
  title = "Invitations",
}: {
  coachId: string;
  invitations: InvitationRow[];
  appUrl: string;
  title?: string;
}) {
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const invitationLink = (token: string) =>
    `${appUrl || (typeof window !== "undefined" ? window.location.origin : "")}/invitation/${token}`;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await createInvitation(coachId, label);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLabel("");
    if (result.token) copy(result.token);
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(invitationLink(token));
      setCopiedId(token);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // le lien reste visible dans la liste
    }
  }

  const pending = invitations.filter((i) => !i.used_at);
  const used = invitations.filter((i) => i.used_at);

  return (
    <Card>
      <CardTitle>{title}</CardTitle>

      <form onSubmit={handleCreate} className="space-y-3">
        <Field label="Nom du joueur (repère interne, optionnel)">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex. : Lucas Martin"
          />
        </Field>
        {error && <p className="text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" full disabled={loading}>
          {loading ? "Création…" : "Générer un lien d'invitation"}
        </Button>
      </form>

      {pending.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
            En attente ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-navy-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-navy-900">
                    {inv.player_label || "Sans nom"}
                  </p>
                  <p className="text-xs text-navy-400">
                    Créée le {formatDateFr(inv.created_at.slice(0, 10))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => copy(inv.id)}>
                    {copiedId === inv.id ? (
                      <>
                        Copié <Check size={13} />
                      </>
                    ) : (
                      "Copier le lien"
                    )}
                  </Button>
                  <IconButton
                    tone="danger"
                    onClick={() => deleteInvitation(inv.id)}
                    aria-label="Supprimer l'invitation"
                  >
                    <TrashIcon size={15} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {used.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">
            Utilisées ({used.length})
          </p>
          <div className="space-y-2">
            {used.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-navy-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-navy-900">
                    {inv.used_by_name ?? inv.player_label ?? "Joueur"}
                  </p>
                  {inv.used_at && (
                    <p className="text-xs text-navy-400">
                      Inscrite le {formatDateFr(inv.used_at.slice(0, 10))}
                    </p>
                  )}
                </div>
                <Badge tone="success">Utilisée</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
