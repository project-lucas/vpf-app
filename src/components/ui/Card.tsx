export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-navy-100 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`font-display mb-3 text-[17px] font-semibold uppercase tracking-wide text-navy-800 ${className}`}
    >
      {children}
    </h2>
  );
}
