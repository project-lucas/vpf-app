"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvitation, deleteInvitation } from "@/app/actions/admin";
import { formatDateFr } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { Check } from "lucide-react";
import { TrashIcon } from "@/components/icons";
import type { Invitation } from "@/lib/types";

type InvitationRow = Invitation & { coach_name: string; used_by_name: string | null };

export function InvitationsManager({
  invitations,
  coachs,
  appUrl,
}: {
  invitations: InvitationRow[];
  coachs: { id: string; name: string }[];
  appUrl: string;
}) {
  const router = useRouter();
  const [coachId, setCoachId] = useState(coachs[0]?.id ?? "");
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
    router.refresh();
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

  async function remove(id: string) {
    await deleteInvitation(id);
    router.refresh();
  }

  const pending = invitations.filter((i) => !i.used_at);
  const used = invitations.filter((i) => i.used_at);

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Nouvelle invitation</CardTitle>
        <form onSubmit={handleCreate} className="space-y-3">
          <Field label="Coach référent">
            <Select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              {coachs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nom du joueur (repère interne, optionnel)">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex. : Lucas Martin"
            />
          </Field>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
          <Button type="submit" full disabled={loading || !coachId}>
            {loading ? "Création…" : "Générer le lien d'invitation"}
          </Button>
        </form>
      </Card>

      <div>
        <CardTitle>En attente ({pending.length})</CardTitle>
        {pending.length === 0 ? (
          <p className="text-sm text-navy-400">Aucune invitation en attente.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((inv) => (
              <Card key={inv.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy-900">
                      {inv.player_label || "Sans nom"}
                    </p>
                    <p className="text-xs text-navy-400">
                      Coach : {inv.coach_name} · créée le {formatDateFr(inv.created_at.slice(0, 10))}
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
                      onClick={() => remove(inv.id)}
                      aria-label="Supprimer l'invitation"
                    >
                      <TrashIcon size={15} />
                    </IconButton>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <CardTitle>Utilisées ({used.length})</CardTitle>
        {used.length === 0 ? (
          <p className="text-sm text-navy-400">Aucune invitation utilisée.</p>
        ) : (
          <div className="space-y-2">
            {used.map((inv) => (
              <Card key={inv.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-navy-900">
                      {inv.used_by_name ?? inv.player_label ?? "Joueur"}
                    </p>
                    <p className="text-xs text-navy-400">
                      Coach : {inv.coach_name}
                      {inv.used_at && ` · inscrite le ${formatDateFr(inv.used_at.slice(0, 10))}`}
                    </p>
                  </div>
                  <Badge tone="success">Utilisée</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
