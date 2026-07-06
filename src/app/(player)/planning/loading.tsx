/** Squelette affiché pendant le chargement du Planning. */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-5 flex flex-col items-center pt-1">
        <div className="h-[60px] w-[52px] rounded-full bg-navy-100" />
        <div className="mt-2 h-3 w-40 rounded bg-navy-100" />
      </div>
      <div className="mb-3 h-40 rounded-2xl bg-navy-100" />
      <div className="mb-3 h-10 rounded-full bg-navy-100" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-navy-100" />
        ))}
      </div>
    </div>
  );
}
