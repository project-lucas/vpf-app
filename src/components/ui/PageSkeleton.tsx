/**
 * Squelette générique des écrans coach, affiché par les `loading.tsx` pendant
 * que le serveur assemble la page.
 *
 * Sans lui, une navigation sur une page dynamique reste bloquée sur l'écran
 * précédent jusqu'à ce que TOUTES les requêtes soient revenues : l'application
 * a l'air figée. Avec lui, Next envoie immédiatement cette coquille puis
 * remplace le contenu en streaming — la navigation paraît instantanée.
 */
export function PageSkeleton({
  /** nombre de blocs sous le titre (une carte, une ligne de liste…) */
  blocks = 3,
  /** hauteur des blocs, en classes Tailwind */
  blockHeight = "h-28",
  /** barre d'onglets sous le titre (fiches joueur, planning) */
  tabs = 0,
}: {
  blocks?: number;
  blockHeight?: string;
  tabs?: number;
}) {
  return (
    <div className="animate-pulse" aria-hidden>
      {/* titre + tick doré */}
      <div className="mb-4">
        <div className="h-6 w-40 rounded bg-navy-100" />
        <div className="mt-1.5 h-1 w-9 rounded-sm bg-navy-100" />
        <div className="mt-2 h-3 w-28 rounded bg-navy-100" />
      </div>

      {tabs > 0 && (
        <div className="mb-4 flex gap-1.5 overflow-hidden">
          {Array.from({ length: tabs }).map((_, i) => (
            <div key={i} className="h-8 w-20 shrink-0 rounded-xl bg-navy-100" />
          ))}
        </div>
      )}

      <div className="space-y-2.5">
        {Array.from({ length: blocks }).map((_, i) => (
          <div key={i} className={`${blockHeight} rounded-2xl bg-navy-100`} />
        ))}
      </div>
    </div>
  );
}
