"use client";

import { useState } from "react";
import { completeOnboarding } from "@/app/actions/auth";
import { POSITIONS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";

export function OnboardingForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const result = await completeOnboarding({
      first_name: String(fd.get("first_name") ?? ""),
      last_name: String(fd.get("last_name") ?? ""),
      position: String(fd.get("position") ?? ""),
      club: String(fd.get("club") ?? ""),
      birthdate: String(fd.get("birthdate") ?? ""),
      height_cm: Number(fd.get("height_cm")),
      weight_kg: Number(fd.get("weight_kg")),
      season_goal: String(fd.get("season_goal") ?? ""),
    });
    if (!result.ok) {
      setLoading(false);
      setError(result.error);
      return;
    }
    window.location.href = "/planning";
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom">
          <Input name="first_name" required autoComplete="given-name" />
        </Field>
        <Field label="Nom">
          <Input name="last_name" required autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Poste">
        <Select name="position" required defaultValue="">
          <option value="" disabled>
            Choisis ton poste
          </option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Club">
        <Input name="club" required placeholder="Nom de ton club" />
      </Field>
      <Field label="Date de naissance">
        <Input name="birthdate" type="date" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Taille (cm)">
          <Input name="height_cm" type="number" required min={100} max={260} inputMode="numeric" />
        </Field>
        <Field label="Poids (kg)">
          <Input
            name="weight_kg"
            type="number"
            required
            min={20}
            max={250}
            step="0.1"
            inputMode="decimal"
          />
        </Field>
      </div>
      <Field label="Objectif de saison">
        <Textarea
          name="season_goal"
          required
          placeholder="Ex. : devenir titulaire en équipe 1 et progresser au tir extérieur"
        />
      </Field>
      {error && <FormError>{error}</FormError>}
      <Button type="submit" size="lg" full disabled={loading}>
        {loading ? "Enregistrement…" : "Valider mon profil"}
      </Button>
    </form>
  );
}
