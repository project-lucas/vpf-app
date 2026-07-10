"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target, Trophy } from "lucide-react";
import {
  addPlayerGoal,
  deletePlayerGoal,
  updatePlayerGoalProgress,
} from "@/app/actions/coach";
import { formatDateFr } from "@/lib/dates";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Field, Input } from "@/components/ui/Field";
import { TrashIcon, PlusIcon } from "@/components/icons";
import type { PlayerGoal } from "@/lib/types";

/**
 * Objectifs mesurables du joueur, gérés par le coach : cible chiffrée +
 * progression. Le joueur voit les jauges sur son dashboard et reçoit un push
 * à la création et quand un objectif est atteint.
 */
export function GoalsManager({ playerId, goals }: { playerId: string; goals: PlayerGoal[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submitNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addPlayerGoal(playerId, {
        title: String(fd.get("title") ?? ""),
        target_value: Number(fd.get("target") ?? 0),
        unit: String(fd.get("unit") ?? ""),
        deadline: String(fd.get("deadline") ?? "") || null,
      });
      setError(result.ok ? null : result.error);
      if (result.ok) {
        setAdding(false);
        router.refresh();
      }
    });
  }

  function saveProgress(goal: PlayerGoal, value: number) {
    if (Number.isNaN(value) || value < 0 || value === goal.current_value) return;
    startTransition(async () => {
      const result = await updatePlayerGoalProgress(goal.id, playerId, value);
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });
  }

  function remove(goalId: string) {
    startTransition(async () => {
      const result = await deletePlayerGoal(goalId, playerId);
      setError(result.ok ? null : result.error);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div>
      {goals.length === 0 && !adding && (
        <p className="text-sm text-navy-400">
          Aucun objectif chiffré. Fixe une cible concrète (« 70 % aux lancers francs ») : le
          joueur suit sa jauge sur son dashboard.
        </p>
      )}

      <div className="space-y-2.5">
        {goals.map((g) => {
          const achieved = g.achieved_at !== null || g.current_value >= g.target_value;
          const ratio = Math.min(1, g.target_value > 0 ? g.current_value / g.target_value : 0);
          return (
            <div key={g.id} className="rounded-xl bg-navy-50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-navy-800">
                  {achieved ? (
                    <Trophy size={13} className="-mt-0.5 mr-1 inline text-warning" />
                  ) : (
                    <Target size={13} className="-mt-0.5 mr-1 inline text-navy-400" />
                  )}
                  {g.title}
                  {g.deadline && (
                    <span className="ml-1.5 text-[11px] font-normal text-navy-400">
                      d&apos;ici le {formatDateFr(g.deadline)}
                    </span>
                  )}
                </p>
                <IconButton tone="danger" onClick={() => remove(g.id)} aria-label="Supprimer">
                  <TrashIcon size={14} />
                </IconButton>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full ${achieved ? "bg-success" : "bg-navy-600"}`}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-navy-500">
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  defaultValue={g.current_value}
                  onBlur={(e) => saveProgress(g, Number(e.target.value))}
                  disabled={isPending}
                  className="w-20 rounded-lg border border-navy-200 px-2 py-1 text-sm focus:border-navy-600 focus:outline-none"
                />
                <span>
                  / {g.target_value} {g.unit}
                </span>
                {achieved && <span className="font-semibold text-success">Atteint 🏆</span>}
              </div>
            </div>
          );
        })}
      </div>

      {adding ? (
        <form onSubmit={submitNew} className="mt-3 space-y-3 rounded-xl border border-navy-100 p-3">
          <Field label="Objectif">
            <Input name="title" required placeholder="Ex. : 70 % aux lancers francs" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cible">
              <Input name="target" type="number" step="0.1" min={0.1} required placeholder="70" />
            </Field>
            <Field label="Unité">
              <Input name="unit" placeholder="%" />
            </Field>
            <Field label="Échéance">
              <Input name="deadline" type="date" />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" type="button" onClick={() => setAdding(false)}>
              Annuler
            </Button>
            <Button size="sm" type="submit" disabled={isPending}>
              Créer l&apos;objectif
            </Button>
          </div>
        </form>
      ) : (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => setAdding(true)}>
          <PlusIcon size={14} /> Nouvel objectif
        </Button>
      )}

      {error && (
        <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
