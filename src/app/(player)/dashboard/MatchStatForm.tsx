"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMatchStat } from "@/app/actions/player";
import { twosOf, type MatchRecords, type RecordKey } from "@/lib/gamification";
import { EdButton, EdField, EdInput } from "@/components/editorial/forms";

export function MatchStatForm({
  records,
  onSuccess,
}: {
  /** records actuels : sert à détecter un record battu à la saisie */
  records?: MatchRecords;
  onSuccess?: (beaten: RecordKey[]) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    // champs de tir optionnels : vide = non renseigné
    const numOrNull = (name: string) => {
      const v = String(fd.get(name) ?? "");
      return v === "" ? null : Number(v);
    };
    const data = {
      match_date: String(fd.get("match_date") ?? ""),
      points: Number(fd.get("points")),
      minutes: Number(fd.get("minutes")),
      rebounds: Number(fd.get("rebounds")),
      steals: Number(fd.get("steals")),
      shots_attempted: numOrNull("shots_attempted"),
      shots_made: numOrNull("shots_made"),
      threes_attempted: numOrNull("threes_attempted"),
      threes_made: numOrNull("threes_made"),
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
      const twos = twosOf(data);
      const beats = (key: RecordKey, value: number | null) => {
        const record = records[key];
        if (record && value != null && value > record.value) beaten.push(key);
      };
      beats("points", data.points);
      beats("twos", twos);
      beats("threes", data.threes_made);
      beats("rebounds", data.rebounds);
      beats("steals", data.steals);
    }

    (e.target as HTMLFormElement).reset?.();
    router.refresh();
    onSuccess?.(beaten);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" onChange={() => setConfirming(false)}>
      <EdField label="Date du match">
        <EdInput name="match_date" type="date" required />
      </EdField>
      <div className="grid grid-cols-2 gap-3">
        <EdField label="Points">
          <EdInput name="points" type="number" min={0} max={200} required inputMode="numeric" />
        </EdField>
        <EdField label="Minutes jouées">
          <EdInput name="minutes" type="number" min={0} max={60} required inputMode="numeric" />
        </EdField>
        <EdField label="Rebonds">
          <EdInput name="rebounds" type="number" min={0} max={100} required inputMode="numeric" />
        </EdField>
        <EdField label="Interceptions">
          <EdInput name="steals" type="number" min={0} max={100} required inputMode="numeric" />
        </EdField>
      </div>
      <p className="ed-overline pt-1">Tirs — optionnel mais ton objectif de saison se joue là</p>
      <div className="grid grid-cols-2 gap-3">
        <EdField label="Tirs tentés">
          <EdInput name="shots_attempted" type="number" min={0} max={200} inputMode="numeric" />
        </EdField>
        <EdField label="Tirs réussis">
          <EdInput name="shots_made" type="number" min={0} max={200} inputMode="numeric" />
        </EdField>
        <EdField label="3 pts tentés">
          <EdInput name="threes_attempted" type="number" min={0} max={100} inputMode="numeric" />
        </EdField>
        <EdField label="3 pts réussis">
          <EdInput name="threes_made" type="number" min={0} max={100} inputMode="numeric" />
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
