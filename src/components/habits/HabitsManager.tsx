"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHabit, deleteHabit, updateHabit } from "@/app/actions/habits";
import { HABIT_COLORS, HABIT_ICON_NAMES } from "@/lib/constants";
import { HabitIcon } from "./HabitIcon";
import { EdButton, EdField, EdInput } from "@/components/editorial/forms";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlusIcon } from "@/components/icons";
import { HabitCard } from "./HabitCard";
import type { HabitColor, HabitWithChecks } from "@/lib/types";

// Suggestions préremplies pour démarrer sans page blanche
const SUGGESTIONS: { name: string; icon: string; color: HabitColor; goal: string }[] = [
  { name: "Sommeil avant 22h30", icon: "moon", color: "purple", goal: "8 h de sommeil minimum" },
  { name: "Étirements", icon: "person-standing", color: "teal", goal: "10 min après chaque entraînement" },
  { name: "100 tirs", icon: "target", color: "orange", goal: "100 tirs par jour" },
  { name: "Hydratation", icon: "droplets", color: "blue", goal: "2 L d'eau par jour" },
];

export function HabitsManager({
  habits,
  today,
}: {
  habits: HabitWithChecks[];
  today: string;
}) {
  const router = useRouter();
  const [formTarget, setFormTarget] = useState<HabitWithChecks | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [icon, setIcon] = useState<string>(HABIT_ICON_NAMES[0]);
  const [color, setColor] = useState<HabitColor>("gold");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function openForm(target: HabitWithChecks | "new") {
    setFormTarget(target);
    setError("");
    if (target === "new") {
      setName("");
      setDescription("");
      setGoal("");
      setIcon(HABIT_ICON_NAMES[0]);
      setColor("gold");
    } else {
      setName(target.name);
      setDescription(target.description);
      setGoal(target.goal);
      setIcon(target.icon);
      setColor(target.color);
    }
  }

  function openSuggestion(s: (typeof SUGGESTIONS)[number]) {
    openForm("new");
    setName(s.name);
    setIcon(s.icon);
    setColor(s.color);
    setGoal(s.goal);
  }

  async function save() {
    setError("");
    setLoading(true);
    const input = { name, description, goal, icon, color };
    const result =
      formTarget === "new"
        ? await createHabit(input)
        : await updateHabit((formTarget as HabitWithChecks).id, input);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFormTarget(null);
    router.refresh();
  }

  async function remove() {
    if (formTarget === "new" || !formTarget) return;
    setLoading(true);
    await deleteHabit(formTarget.id);
    setLoading(false);
    setFormTarget(null);
    router.refresh();
  }

  return (
    <div>
      {/* En-tête du panneau : titre + ajout inline (le panneau vit dans le dashboard) */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="ed-display text-lg">Mes habitudes</p>
          <p className="mt-0.5 text-xs text-meta">
            Coche-les dans ton planning : chaque validation s&apos;additionne.
          </p>
        </div>
        <button
          onClick={() => openForm("new")}
          aria-label="Nouvelle habitude"
          title="Nouvelle habitude"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink text-paper transition-all hover:brightness-110 active:scale-95"
        >
          <PlusIcon size={18} />
        </button>
      </div>

      {habits.length === 0 ? (
        <EmptyState>
          <p className="font-semibold text-meta">
            Ta première habitude commence aujourd&apos;hui.
          </p>
          <p className="mt-1">
            Pas besoin de la faire tous les jours : coche-la quand c&apos;est fait,
            ton total grimpe à chaque fois.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                onClick={() => openSuggestion(s)}
                className="flex items-center gap-2 rounded-md border-2 border-ink bg-card px-3 py-2.5 text-left transition-transform active:scale-[0.97]"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{ backgroundColor: `${HABIT_COLORS[s.color].hex}24` }}
                >
                  <HabitIcon name={s.icon} size={16} color={HABIT_COLORS[s.color].hex} />
                </span>
                <span className="text-xs font-semibold text-ink">{s.name}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => openForm("new")}
            className="mt-3 text-xs font-bold text-meta underline-offset-2 hover:underline"
          >
            ou crée la tienne de zéro
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} today={today} onEdit={() => openForm(h)} />
          ))}
        </div>
      )}

      <Modal
        open={formTarget !== null}
        onClose={() => setFormTarget(null)}
        title={formTarget === "new" ? "Nouvelle habitude" : "Modifier l'habitude"}
      >
        <div className="space-y-4">
          <EdField label="Nom">
            <EdInput
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="Ex. : 50 lancers francs, boire 2L d'eau…"
            />
          </EdField>
          <EdField label="Description (optionnelle)">
            <EdInput
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 200))}
              placeholder="Ex. : après chaque entraînement"
            />
          </EdField>
          <EdField label="Objectif (optionnel)">
            <EdInput
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, 80))}
              placeholder="Ex. : tous les jours, 5x par semaine…"
            />
          </EdField>

          <div>
            <p className="ed-overline mb-1.5">Icône</p>
            {/* aperçu de l'icône sélectionnée : grand cercle crème bordé navy */}
            <div className="mb-3 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink bg-card">
                <HabitIcon name={icon} size={36} className="text-ink" strokeWidth={1.8} />
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {HABIT_ICON_NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIcon(n)}
                  aria-label={n}
                  className={`flex h-11 items-center justify-center rounded-md transition-colors ${
                    icon === n
                      ? "bg-ink text-paper"
                      : "bg-tan text-meta hover:bg-ink/10 hover:text-ink"
                  }`}
                >
                  <HabitIcon name={n} size={20} strokeWidth={1.8} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="ed-overline mb-1.5">Couleur</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(HABIT_COLORS) as HabitColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={HABIT_COLORS[c].label}
                  title={HABIT_COLORS[c].label}
                  className={`h-9 w-9 rounded-md transition-transform ${
                    color === c
                      ? "scale-110 ring-2 ring-ink ring-offset-2"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: HABIT_COLORS[c].hex }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm font-medium text-orange">{error}</p>}

          <EdButton variant="navy" full onClick={save} disabled={loading || !name.trim()}>
            {loading ? "Enregistrement…" : formTarget === "new" ? "Créer l'habitude" : "Enregistrer"}
          </EdButton>
          {formTarget !== "new" && formTarget !== null && (
            <button
              onClick={remove}
              disabled={loading}
              className="w-full text-center text-sm font-semibold text-orange"
            >
              Supprimer cette habitude (et tout son historique)
            </button>
          )}
        </div>
      </Modal>
    </div>
  );
}
