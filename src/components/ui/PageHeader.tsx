export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-bold uppercase leading-none tracking-wide text-navy-900">
          {title}
        </h1>
        {/* tick doré incliné : la signature VPF, clin d'œil aux lignes du parquet */}
        <span aria-hidden className="mt-1.5 block h-1 w-9 -skew-x-12 rounded-sm bg-gold" />
        {subtitle && <p className="mt-1.5 text-sm text-navy-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
