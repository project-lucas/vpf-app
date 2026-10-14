"use client";

import { useState, useTransition } from "react";
import { setPlayerGroup } from "@/app/actions/groups";
import { Field, Select } from "@/components/ui/Field";
import type { Group } from "@/lib/types";

/** Le groupe d'un joueur, modifiable par un admin depuis la fiche. */
export function PlayerGroupSelect({
  playerId,
  groups,
  currentGroupId,
}: {
  playerId: string;
  groups: Pick<Group, "id" | "name">[];
  currentGroupId: string | null;
}) {
  const [value, setValue] = useState(currentGroupId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function change(groupId: string) {
    const previous = value;
    setValue(groupId);
    setError(null);
    startTransition(async () => {
      const result = await setPlayerGroup(playerId, groupId);
      if (!result.ok) {
        setValue(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <Field label="Groupe de suivi">
        <Select value={value} onChange={(e) => change(e.target.value)} disabled={isPending}>
          {!value && <option value="">Sans groupe</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      {error && <p className="mt-1 text-xs font-semibold text-danger">{error}</p>}
    </div>
  );
}
