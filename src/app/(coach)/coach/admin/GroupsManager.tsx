"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { createGroup, deleteGroup, renameGroup, setGroupStaff } from "@/app/actions/groups";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import type { GroupWithStaff, StaffProfile } from "@/lib/types";

/**
 * Les groupes du service et leur staff : qui encadre quoi. Un panneau de
 * l'onglet Admin — un geste rare (créer un groupe, y mettre un coach), pas du
 * quotidien. Les joueurs se déplacent depuis leur fiche.
 */
export function GroupsManager({
  groups,
  staff,
  playerCount,
}: {
  groups: GroupWithStaff[];
  /** tout le staff du club (coachs et admins) */
  staff: StaffProfile[];
  /** joueurs actifs par groupe */
  playerCount: Record<string, number>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <GroupPanel
            key={g.id}
            group={g}
            staff={staff}
            count={playerCount[g.id] ?? 0}
            disabled={isPending}
            onRename={(value) => run(() => renameGroup(g.id, value))}
            onToggle={(profileId, member) => run(() => setGroupStaff(g.id, profileId, member))}
            onDelete={() => run(() => deleteGroup(g.id))}
          />
        ))}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(async () => {
            const result = await createGroup(name);
            if (result.ok) setName("");
            return result;
          });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nouveau groupe (ex. Groupe B)"
          maxLength={40}
        />
        <Button type="submit" variant="secondary" disabled={isPending || !name.trim()}>
          Créer
        </Button>
      </form>
    </div>
  );
}

function GroupPanel({
  group,
  staff,
  count,
  disabled,
  onRename,
  onToggle,
  onDelete,
}: {
  group: GroupWithStaff;
  staff: StaffProfile[];
  count: number;
  disabled: boolean;
  onRename: (name: string) => void;
  onToggle: (profileId: string, member: boolean) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(group.name);
  const members = new Set(group.staff.map((s) => s.id));

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-3">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const clean = name.trim();
            if (clean && clean !== group.name) onRename(clean);
            else setName(group.name);
          }}
          maxLength={40}
          aria-label="Nom du groupe"
          className="font-semibold"
        />
        <span className="shrink-0 text-[11px] text-navy-400">
          {count} joueur{count > 1 ? "s" : ""}
        </span>
        {count === 0 && (
          <IconButton tone="danger" onClick={onDelete} disabled={disabled} aria-label="Supprimer le groupe">
            <Trash2 size={15} />
          </IconButton>
        )}
      </div>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-navy-400">Staff</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {staff.map((s) => {
          const member = members.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(s.id, !member)}
              aria-pressed={member}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                member
                  ? "bg-navy-800 text-white hover:bg-navy-700"
                  : "ring-1 ring-inset ring-navy-200 text-navy-500 hover:bg-navy-50"
              }`}
            >
              {s.first_name} {s.last_name.charAt(0)}.
            </button>
          );
        })}
      </div>
    </div>
  );
}
