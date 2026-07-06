/** Squelette affiché pendant le chargement des données du Dashboard. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      {/* héros */}
      <div className="flex items-center gap-4 pb-4 pt-2">
        <div className="h-[76px] w-[76px] shrink-0 rounded-full bg-navy-100" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-32 rounded bg-navy-100" />
          <div className="h-3 w-24 rounded bg-navy-100" />
        </div>
      </div>
      {/* KPI */}
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[76px] rounded-xl bg-navy-100" />
        ))}
      </div>
      <div className="mt-2.5 h-11 rounded-xl bg-navy-100" />
      {/* barre d'icônes */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl bg-navy-100" />
        ))}
      </div>
      <div className="mt-2 h-52 rounded-2xl bg-navy-100" />
    </div>
  );
}
