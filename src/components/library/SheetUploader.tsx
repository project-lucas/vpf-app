"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

/** Plafond posé sur le bucket (0024). */
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Dépôt de la fiche de training dans le bucket "fiches" (écriture réservée aux
 * admins par les policies). Comme VideoUploader, le composant ne fait
 * qu'uploader et remonter l'URL publique — l'enregistrement en base se fait à
 * la soumission du formulaire de séance.
 */
export function SheetUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setError("Format non accepté (JPG, PNG ou WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image trop lourde (10 Mo max).");
      return;
    }

    setError("");
    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no session");

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      // crypto.randomUUID : chemin unique, pas de collision entre deux dépôts
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("fiches")
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("fiches").getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch {
      setError("Upload impossible (taille ou droits). Réessaie.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL Supabase externe */}
          <img
            src={value}
            alt="Aperçu de la fiche de training"
            className="max-h-64 w-full rounded-lg border border-navy-100 bg-white object-contain"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              Remplacer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange("")}
              disabled={uploading}
            >
              Retirer
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Envoi…" : "Choisir une fiche"}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={handleFile}
      />
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
