/** Squelette affiché pendant le chargement des séances. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-4 space-y-2">
        <div className="h-6 w-40 rounded bg-navy-100" />
        <div className="h-3 w-56 rounded bg-navy-100" />
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-navy-100" />
        ))}
      </div>
    </div>
  );
}
