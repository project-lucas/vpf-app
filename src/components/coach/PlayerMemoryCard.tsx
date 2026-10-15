import { JarvisAvatar } from "@/components/coach/JarvisAvatar";
import { formatAgoFr } from "@/lib/dates";
import { MEMORY_SECTIONS, type PlayerMemory } from "@/lib/player-memory";

/**
 * La fiche mémoire en tête de la fiche joueur : cinq lignes tenues à jour par
 * Jarvis chaque semaine — de quoi reprendre le joueur en 30 secondes. Repliée
 * sur téléphone derrière son résumé, ouverte d'un geste. Staff seulement.
 */
export function PlayerMemoryCard({ memory }: { memory: PlayerMemory | null }) {
  if (!memory) {
    return (
      <p className="mb-4 flex items-center gap-2 text-[12px] text-navy-400">
        <JarvisAvatar size={20} />
        Pas encore de fiche mémoire : Jarvis la rédigera à son prochain passage.
      </p>
    );
  }
  const lines = MEMORY_SECTIONS.filter((s) => memory.sections[s.key]?.trim());
  return (
    <details open className="group mb-5 rounded-2xl border border-navy-100 bg-white px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2.5">
        <JarvisAvatar size={26} />
        <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-navy-400">
          Fiche mémoire
        </span>
        <span className="text-[11px] text-navy-300">· mise à jour {formatAgoFr(memory.updated_at)}</span>
        <span className="ml-auto text-[11px] font-semibold text-navy-400 group-open:hidden">Afficher</span>
      </summary>
      <dl className="mt-2.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {lines.map((s) => (
          <div key={s.key} className={s.key === "situation" ? "sm:col-span-2" : ""}>
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent">{s.label}</dt>
            <dd className="text-[13.5px] leading-snug text-navy-800">{memory.sections[s.key]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
