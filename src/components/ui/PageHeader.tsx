import { CourtLines } from "./CourtLines";

/**
 * Titre de page du staff. Derrière, en filigrane, les lignes du demi-terrain
 * (cf. CourtLines) ; dessous, le tick or incliné — les lignes du parquet.
 * Deux gestes basket, aucun qui prenne de la place.
 */
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
    <div className="relative mb-4 flex items-start justify-between gap-3">
      <CourtLines className="pointer-events-none absolute -top-3 right-0 h-[88px] w-auto text-navy-900/[0.06]" />
      <div className="relative">
        <h1 className="font-display text-[26px] font-bold uppercase leading-none tracking-wide text-navy-900">
          {title}
        </h1>
        {/* tick doré incliné : la signature VPF, clin d'œil aux lignes du parquet */}
        <span aria-hidden className="mt-1.5 block h-1 w-9 -skew-x-12 rounded-sm bg-gold" />
        {subtitle && <p className="mt-1.5 text-sm text-navy-400">{subtitle}</p>}
      </div>
      {action && <div className="relative">{action}</div>}
    </div>
  );
}
