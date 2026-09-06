/**
 * Section plate — le second niveau de surface de l'interface staff.
 *
 * La `Card` (blanc, bordure, ombre) est réservée à ce qui demande une action.
 * Tout ce qui se consulte — une liste, un historique, un flux — vit dans une
 * Section : un sur-titre discret, un filet, pas de boîte. Deux niveaux au lieu
 * d'un, c'est ce qui rend une page lisible d'un coup d'œil : l'œil va à la
 * boîte, il parcourt le reste.
 */
export function Section({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  /** à droite du titre : un compteur, un lien « tout voir »… */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between gap-3">
          {title && <SectionTitle>{title}</SectionTitle>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Sur-titre de section : petit, espacé, en capitales — le troisième niveau de
 * titre, sous le titre de page et le titre de Card. Il structure sans crier.
 */
export function SectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-[11px] font-bold uppercase tracking-[0.12em] text-navy-400 ${className}`}
    >
      {children}
    </h2>
  );
}

/** Filet fin entre deux sections plates. */
export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`border-0 border-t border-navy-100 ${className}`} />;
}
