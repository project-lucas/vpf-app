"use client";

import { useState } from "react";
import { addMatchStat } from "@/app/actions/player";
import type { MatchRecords, RecordKey } from "@/lib/gamification";
import { EdButton, EdField, EdInput } from "@/components/editorial/forms";

export function MatchStatForm({
  records,
  onSuccess,
}: {
  /** records actuels : sert à détecter un record battu à la saisie */
  records?: MatchRecords;
  onSuccess?: (beaten: RecordKey[]) => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isStarter, setIsStarter] = useState(true);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    // confirmation : la saisie est définitive
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const num = (name: string) => Number(fd.get(name) ?? 0) || 0;

    const threes_made = num("threes_made");
    const twos_inside_made = num("twos_inside_made");
    const twos_outside_made = num("twos_outside_made");
    const free_throws_made = num("free_throws_made");

    // valeurs calculées (affichées côté joueur, recalculées côté serveur)
    const shots_made = threes_made + twos_inside_made + twos_outside_made;
    const points = 3 * threes_made + 2 * (twos_inside_made + twos_outside_made) + free_throws_made;

    const data = {
      match_date: String(fd.get("match_date") ?? ""),
      is_starter: isStarter,
      minutes: num("minutes"),
      threes_made,
      twos_inside_made,
      twos_outside_made,
      free_throws_made,
      fouls: num("fouls"),
    };
    const result = await addMatchStat(data);
    setLoading(false);
    setConfirming(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    // records battus par ce match (seulement si un record existait déjà)
    const beaten: RecordKey[] = [];
    if (records) {
      const values: Record<RecordKey, number> = {
        points,
        shots: shots_made,
        threes: threes_made,
        twosInside: twos_inside_made,
        twosOutside: twos_outside_made,
        freeThrows: free_throws_made,
      };
      (Object.keys(values) as RecordKey[]).forEach((key) => {
        const record = records[key];
        if (record && values[key] > record.value) beaten.push(key);
      });
    }

    (e.target as HTMLFormElement).reset?.();
    setIsStarter(true);
    onSuccess?.(beaten);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" onChange={() => setConfirming(false)}>
      <EdField label="Date du match">
        <EdInput name="match_date" type="date" required />
      </EdField>

      {/* Titulaire oui / non */}
      <div>
        <p className="ed-overline mb-1.5">Titulaire</p>
        <div className="flex gap-2">
          {[
            { label: "Oui", value: true },
            { label: "Non", value: false },
          ].map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                setIsStarter(opt.value);
                setConfirming(false);
              }}
              aria-pressed={isStarter === opt.value}
              className={`flex-1 rounded-md border-2 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange/40 ${
                isStarter === opt.value
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/30 bg-transparent text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <EdField label="Temps de jeu (min)">
          <EdInput name="minutes" type="number" min={0} max={60} required inputMode="numeric" />
        </EdField>
        <EdField label="Fautes">
          <EdInput name="fouls" type="number" min={0} max={20} inputMode="numeric" />
        </EdField>
      </div>

      <p className="ed-overline pt-1">Tirs réussis — le scoring se calcule tout seul</p>
      <div className="grid grid-cols-2 gap-3">
        <EdField label="2 pts intérieur">
          <EdInput name="twos_inside_made" type="number" min={0} max={100} inputMode="numeric" />
        </EdField>
        <EdField label="2 pts extérieur">
          <EdInput name="twos_outside_made" type="number" min={0} max={100} inputMode="numeric" />
        </EdField>
        <EdField label="3 pts réussis">
          <EdInput name="threes_made" type="number" min={0} max={100} inputMode="numeric" />
        </EdField>
        <EdField label="Lancers francs marqués">
          <EdInput name="free_throws_made" type="number" min={0} max={100} inputMode="numeric" />
        </EdField>
      </div>

      {error && <p className="ed-meta text-[11px] text-orange">{error}</p>}
      {confirming && (
        <p className="ed-meta rounded-md border-2 border-orange px-3 py-2 text-[10px] leading-relaxed text-orange">
          Vérifie bien tes stats : elles ne pourront plus être modifiées. Appuie à nouveau pour
          confirmer.
        </p>
      )}
      <EdButton type="submit" variant={confirming ? "red" : "navy"} full disabled={loading}>
        {loading ? "Enregistrement…" : confirming ? "Confirmer mes stats" : "Enregistrer le match"}
      </EdButton>
    </form>
  );
}
