export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-navy-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-navy-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-navy-400">{hint}</p>}
    </div>
  );
}
