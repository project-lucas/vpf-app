/** Squelette affiché pendant le chargement du Profil. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      {/* héros : écusson + nom */}
      <div className="flex items-center gap-4 pb-4 pt-2">
        <div className="h-[76px] w-[76px] shrink-0 rounded-full bg-navy-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded bg-navy-100" />
          <div className="h-6 w-36 rounded bg-navy-100" />
        </div>
      </div>
      <div className="h-1 rounded bg-navy-100" />
      {/* sections : fiche basket, notifications, mot de passe */}
      <div className="mt-6 space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="h-4 w-32 rounded bg-navy-100" />
            <div className="h-24 rounded-2xl bg-navy-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
