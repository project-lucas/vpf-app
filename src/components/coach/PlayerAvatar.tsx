/**
 * Avatar à initiales des listes staff. Pas de photo côté coach : deux lettres
 * sur un disque navy suffisent à distinguer les lignes d'un coup d'œil et
 * donnent à la liste une colonne d'accroche régulière.
 *
 * `alert` pose une pastille rouge sur le coin : la ligne attend une action
 * (message non lu). C'est l'équivalent, avec avatar, de la pastille de gauche
 * de `Row`.
 */
export function PlayerAvatar({
  firstName,
  lastName,
  alert = false,
  size = "md",
}: {
  firstName: string;
  lastName: string;
  alert?: boolean;
  size?: "sm" | "md";
}) {
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
  const dims = size === "sm" ? "h-8 w-8 text-[10px]" : "h-9 w-9 text-[11px]";
  return (
    <span className="relative mt-0.5 shrink-0">
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-full bg-navy-100 font-extrabold tracking-wide text-navy-700 ${dims}`}
      >
        {initials || "?"}
      </span>
      {alert && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-danger"
        />
      )}
    </span>
  );
}
