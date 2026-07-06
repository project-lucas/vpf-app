"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CameraIcon } from "@/components/icons";

/**
 * Avatar du joueur : photo si définie, sinon initiales. Le badge appareil
 * photo ouvre le sélecteur de fichier ; upload dans le bucket "avatars"
 * (dossier <user_id>/, imposé par les policies) puis mise à jour du profil.
 */
export function AvatarUploader({
  avatarUrl,
  initials,
  tag,
}: {
  avatarUrl: string | null;
  initials: string;
  tag?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image (JPG, PNG…).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image trop lourde (5 Mo max).");
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
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      // cache-bust : même chemin de fichier à chaque upload
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.id);
      if (updateError) throw updateError;

      router.refresh();
    } catch {
      setError("Upload impossible. Réessaie.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="shrink-0">
      <div className="relative">
        {/* Écusson rond : navy cerclé de rouge, photo ou initiales + club */}
        <div className="flex h-[68px] w-[68px] flex-col items-center justify-center overflow-hidden rounded-full border-[3px] border-orange bg-ink text-paper">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL Supabase externe, avatar 68px
            <img
              src={avatarUrl}
              alt="Ma photo de profil"
              width={68}
              height={68}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <>
              <span className="font-cond text-xl font-extrabold uppercase leading-none">
                {initials || "?"}
              </span>
              {tag && (
                <span className="ed-meta mt-0.5 text-[6px] leading-none text-warm">
                  {tag} · 01
                </span>
              )}
            </>
          )}
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Changer ma photo"
          title="Changer ma photo"
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-paper bg-orange text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <CameraIcon size={12} />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {uploading && <p className="ed-meta mt-2 text-[9px] text-meta">Upload…</p>}
      {error && <p className="ed-meta mt-2 text-[9px] text-orange">{error}</p>}
    </div>
  );
}
