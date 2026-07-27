"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { updatePlayerProfile } from "@/app/actions/coach";
import { POSITIONS } from "@/lib/constants";
import { OFFER_HINTS, OFFER_LABELS, PLAYER_OFFERS, toOffer } from "@/lib/offers";
import type { PlayerOffer } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";

interface ProfileData {
  first_name: string;
  last_name: string;
  whatsapp_number: string;
  position: string;
  club: string;
  birthdate: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  season_goal: string;
  offer: PlayerOffer;
}

export function PlayerProfileForm({
  playerId,
  initial,
}: {
  playerId: string;
  initial: ProfileData;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  // contrôlée : le rappel de ce que l'offre débloque suit la sélection
  const [offer, setOffer] = useState<PlayerOffer>(initial.offer);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const result = await updatePlayerProfile(playerId, {
      first_name: String(fd.get("first_name") ?? ""),
      last_name: String(fd.get("last_name") ?? ""),
      whatsapp_number: String(fd.get("whatsapp_number") ?? ""),
      position: String(fd.get("position") ?? ""),
      club: String(fd.get("club") ?? ""),
      birthdate: String(fd.get("birthdate") ?? "") || null,
      height_cm: fd.get("height_cm") ? Number(fd.get("height_cm")) : null,
      weight_kg: fd.get("weight_kg") ? Number(fd.get("weight_kg")) : null,
      season_goal: String(fd.get("season_goal") ?? ""),
      offer,
    });
    setLoading(false);
    setMessage(
      result.ok ? { ok: true, text: "Profil enregistré" } : { ok: false, text: result.error }
    );
    if (result.ok) router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom">
            <Input name="first_name" required defaultValue={initial.first_name} />
          </Field>
          <Field label="Nom">
            <Input name="last_name" required defaultValue={initial.last_name} />
          </Field>
        </div>
        <Field label="Numéro WhatsApp (l'indicatif +33 est ajouté tout seul)">
          <Input
            name="whatsapp_number"
            type="tel"
            placeholder="06 12 34 56 78"
            defaultValue={initial.whatsapp_number}
          />
        </Field>
        {/* Offre : c'est elle qui décide des écrans visibles par le joueur.
            Le changement est réversible et ne supprime aucune donnée. */}
        <Field label="Offre souscrite">
          <div className="flex gap-1.5">
            {PLAYER_OFFERS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOffer(value)}
                aria-pressed={offer === value}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                  offer === value
                    ? "bg-navy-800 text-white"
                    : "border border-navy-200 bg-white text-navy-500"
                }`}
              >
                {OFFER_LABELS[value]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-navy-400">{OFFER_HINTS[toOffer(offer)]}</p>
        </Field>
        <Field label="Poste">
          <Select name="position" defaultValue={initial.position || ""}>
            <option value="">Non renseigné</option>
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Club">
          <Input name="club" defaultValue={initial.club} />
        </Field>
        <Field label="Date de naissance">
          <Input name="birthdate" type="date" defaultValue={initial.birthdate ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Taille (cm)">
            <Input
              name="height_cm"
              type="number"
              min={100}
              max={260}
              defaultValue={initial.height_cm ?? ""}
            />
          </Field>
          <Field label="Poids (kg)">
            <Input
              name="weight_kg"
              type="number"
              min={20}
              max={250}
              step="0.1"
              defaultValue={initial.weight_kg ?? ""}
            />
          </Field>
        </div>
        <Field label="Objectif de saison">
          <Textarea name="season_goal" defaultValue={initial.season_goal} />
        </Field>
        {message && (
          <p
            className={`flex items-center gap-1 text-sm font-medium ${
              message.ok ? "text-success" : "text-danger"
            }`}
          >
            {message.ok && <Check size={14} />}
            {message.text}
          </p>
        )}
        <Button type="submit" full disabled={loading}>
          {loading ? "Enregistrement…" : "Enregistrer le profil"}
        </Button>
      </form>
    </Card>
  );
}
