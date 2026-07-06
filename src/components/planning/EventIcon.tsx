import { Apple, Book, Dumbbell, Moon, PersonStanding, Target, type LucideIcon } from "lucide-react";
import { habitPale } from "@/lib/constants";
import type { EventType } from "@/lib/types";

// lucide n'a pas d'icône basketball : ballon dessiné dans le même style
// (24x24, trait 2, currentColor) pour rester interchangeable avec les autres
export const BasketballIcon = ({
  size = 24,
  className = "",
  color = "currentColor",
  strokeWidth = 2,
}: {
  size?: number | string;
  className?: string;
  color?: string;
  strokeWidth?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
  </svg>
);

type EventIconComponent = LucideIcon | typeof BasketballIcon;

// mobilité : pas d'icône "stretching" dans lucide, person-standing est
// l'équivalent déjà utilisé pour les habitudes (ex-🧘)
const EVENT_TYPE_ICONS: Record<EventType, EventIconComponent> = {
  entrainement_club: BasketballIcon,
  training_basket: Target,
  prep_physique: Dumbbell,
  mobilite: PersonStanding,
  revision_scolaire: Book,
  dormir: Moon,
  collation: Apple,
};

// couleur monochrome de chaque type ; le fond pastel en est dérivé (habitPale)
export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  entrainement_club: "#f97316",
  training_basket: "#ef4444",
  prep_physique: "#3b82f6",
  mobilite: "#14b8a6",
  revision_scolaire: "#8b5cf6",
  dormir: "#6366f1",
  collation: "#22c55e",
};

/** Icône nue d'un type d'événement (hérite de currentColor sauf `colored`). */
export function EventTypeIcon({
  type,
  size = 18,
  className = "",
  colored = false,
}: {
  type: EventType;
  size?: number;
  className?: string;
  colored?: boolean;
}) {
  const Icon = EVENT_TYPE_ICONS[type] ?? Target;
  return (
    <Icon
      size={size}
      className={className}
      color={colored ? EVENT_TYPE_COLORS[type] : "currentColor"}
    />
  );
}

/** Icône dans un carré arrondi à fond pastel — même rendu que les habitudes. */
export function EventIconBadge({
  type,
  size = "md",
}: {
  type: EventType;
  size?: "sm" | "md";
}) {
  const Icon = EVENT_TYPE_ICONS[type] ?? Target;
  const hex = EVENT_TYPE_COLORS[type] ?? "#41668d";
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${
        size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
      }`}
      style={{ backgroundColor: habitPale(hex, "bg") }}
      aria-hidden
    >
      <Icon size={size === "sm" ? 16 : 20} color={hex} />
    </span>
  );
}
