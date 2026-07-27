/** Squelette affiché pendant le chargement de l'Hygiène de vie. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      {/* surtitre + titre serif */}
      <div className="space-y-2">
        <div className="h-3 w-28 rounded bg-navy-100" />
        <div className="h-16 w-48 rounded bg-navy-100" />
      </div>
      <div className="mt-4 h-1 rounded bg-navy-100" />
      {/* saisie du jour */}
      <div className="mt-7 h-4 w-28 rounded bg-navy-100" />
      <div className="mt-4 h-64 rounded-2xl bg-navy-100" />
      {/* radar des moyennes */}
      <div className="mt-8 h-4 w-32 rounded bg-navy-100" />
      <div className="mt-4 h-72 rounded-2xl bg-navy-100" />
    </div>
  );
}
