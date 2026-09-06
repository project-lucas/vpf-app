import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Ligne de liste plate — la brique commune de toutes les listes du staff
 * (joueurs, boîte de réception, coachs, santé, activité).
 *
 * Une ligne = un nom, une information secondaire, une valeur à droite. La
 * pastille rouge à gauche est réservée à ce qui attend une action ; tout le
 * reste se lit en gris. Une seule pilule par ligne au plus, à droite : c'est la
 * règle qui rend une liste lisible d'un coup d'œil.
 *
 * Avec `href`, seul le corps (pastille + textes) est un lien : la zone `right`
 * reste en dehors, ce qui permet d'y poser un bouton ou un menu sans imbriquer
 * un `<a>` dans un `<a>` (HTML invalide, hydratation cassée). Une ligne-lien
 * sans valeur à droite montre un chevron : sinon rien ne dit qu'elle s'ouvre.
 */
export function Row({
  href,
  title,
  subtitle,
  right,
  leading,
  dot = false,
  emphasis = false,
  onClick,
  airy = false,
  boxed = false,
  wrap = false,
  className = "",
  children,
}: {
  href?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** valeur, pilule ou action, à droite */
  right?: React.ReactNode;
  /** pastille rouge : cette ligne attend une action */
  dot?: boolean;
  /**
   * élément de tête (avatar à initiales, icône) — prend la place de la
   * pastille et de son retrait ; le non-lu se dit alors autrement
   */
  leading?: React.ReactNode;
  /** nom en gras appuyé (ligne non lue, alerte) */
  emphasis?: boolean;
  onClick?: () => void;
  /** ligne aérée : la liste se lit de loin plutôt que dense (vue Messages) */
  airy?: boolean;
  /**
   * ligne encadrée : chaque entrée devient une carte à contour, séparée de la
   * suivante — pour les listes où l'on distingue des personnes (joueurs) ; en
   * `emphasis`, le contour vire au rouge léger
   */
  boxed?: boolean;
  /** la ligne secondaire peut s'étendre sur plusieurs lignes (puces d'alertes) */
  wrap?: boolean;
  className?: string;
  /** contenu déplié sous la ligne (réponse rapide, détail) */
  children?: React.ReactNode;
}) {
  const body = (
    <>
      {leading ?? (dot && <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-danger" />)}
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm text-navy-900 ${
            emphasis ? "font-extrabold" : "font-semibold"
          }`}
        >
          {title}
        </span>
        {subtitle && (
          <span className={`block text-xs text-navy-400 ${wrap ? "mt-1" : "mt-0.5 truncate"}`}>
            {subtitle}
          </span>
        )}
      </span>
    </>
  );

  const bodyClass = `flex min-w-0 flex-1 items-start gap-3 ${dot || leading ? "" : "pl-5"}`;
  const rowPad = boxed ? (airy ? "py-3.5 px-3" : "py-2.5 px-3") : airy ? "py-4" : "py-2.5";
  const frame = boxed
    ? `mb-2 rounded-2xl border bg-white transition-[border-color,box-shadow] hover:shadow-sm ${
        emphasis ? "border-danger/40 hover:border-danger/60" : "border-navy-200 hover:border-navy-300"
      }`
    : "border-b border-navy-100 last:border-b-0";
  const rightContent =
    right ?? (href ? <ChevronRight size={15} className="mt-0.5 text-navy-300" /> : null);
  const rightSlot = rightContent && (
    <span className="flex shrink-0 items-center gap-1.5">{rightContent}</span>
  );

  return (
    <div className={`${frame} ${className}`}>
      {href ? (
        <div className={`flex items-start gap-3 ${rowPad}`}>
          <Link
            href={href}
            className={`${bodyClass} -mx-1 rounded-lg px-1 transition-colors hover:bg-navy-50`}
          >
            {body}
          </Link>
          {rightSlot}
        </div>
      ) : onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`flex w-full items-start gap-3 ${rowPad} text-left`}
        >
          <span className={bodyClass}>{body}</span>
          {rightSlot}
        </button>
      ) : (
        <div className={`flex items-start gap-3 ${rowPad}`}>
          <span className={bodyClass}>{body}</span>
          {rightSlot}
        </div>
      )}
      {children}
    </div>
  );
}
