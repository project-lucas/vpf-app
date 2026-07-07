"use client";

import { useState } from "react";
import { updateMyPlayerInfo } from "@/app/actions/player";
import { PLAYER_CATEGORIES, POSITIONS } from "@/lib/constants";
import { EdButton, EdField, EdInput, EdSelect, EdTextarea } from "@/components/editorial/forms";
import { CheckIcon } from "@/components/icons";

/** Le joueur édite lui-même sa fiche basket : catégorie, poste, club, objectif. */
export function PlayerInfoForm({
  initial,
}: {
  initial: { category: string; position: string; club: string; season_goal: string };
}) {
  const [category, setCategory] = useState(initial.category);
  const [position, setPosition] = useState(initial.position);
  const [club, setClub] = useState(initial.club);
  const [seasonGoal, setSeasonGoal] = useState(initial.season_goal);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    const result = await updateMyPlayerInfo({
      category,
      position,
      club,
      season_goal: seasonGoal,
    });
    setLoading(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error });
      return;
    }
    setMessage({ ok: true, text: "Fiche mise à jour" });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-5">
        <EdField label="Catégorie">
          <EdSelect value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {PLAYER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </EdSelect>
        </EdField>
        <EdField label="Poste">
          <EdSelect value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">—</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </EdSelect>
        </EdField>
      </div>
      <EdField label="Club / équipe">
        <EdInput
          value={club}
          onChange={(e) => setClub(e.target.value)}
          placeholder="AS MEAUX BASKET"
        />
      </EdField>
      <EdField label="Objectif de saison">
        <EdTextarea
          value={seasonGoal}
          onChange={(e) => setSeasonGoal(e.target.value)}
          placeholder="Devenir titulaire en U18 région et progresser au tir extérieur."
        />
      </EdField>
      {message && (
        <p
          className={`ed-meta flex items-center gap-1.5 text-[11px] ${
            message.ok ? "text-ink" : "text-orange"
          }`}
        >
          {message.ok && <CheckIcon size={14} />}
          {message.text}
        </p>
      )}
      <EdButton type="submit" variant="red" full disabled={loading}>
        <CheckIcon size={16} />
        {loading ? "Enregistrement…" : "Enregistrer ma fiche"}
      </EdButton>
    </form>
  );
}
