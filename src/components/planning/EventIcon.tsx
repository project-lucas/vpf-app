import {
  Apple,
  Book,
  Croissant,
  Dumbbell,
  GlassWater,
  Moon,
  PersonStanding,
  Target,
  type LucideIcon,
} from "lucide-react";
import { habitPale, HABIT_COLORS } from "@/lib/constants";
import { HabitIcon } from "@/components/habits/HabitIcon";
import type { EventType, HabitColor } from "@/lib/types";

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
  petit_dejeuner: Croissant,
  collation: Apple,
  hydratation: GlassWater,
  autre: Target,
};

// Code couleur par activité (remplit le bloc de chaque tâche du planning) :
// technique = marron, physique = rouge, collation = vert, club = orange…
export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  entrainement_club: "#f97316",
  training_basket: "#b45309",
  prep_physique: "#ef4444",
  mobilite: "#14b8a6",
  revision_scolaire: "#3b82f6",
  dormir: "#6366f1",
  petit_dejeuner: "#f59e0b",
  collation: "#22c55e",
  hydratation: "#0ea5e9",
  autre: "#41668d",
};

/** Événement affichable : type + éventuelle personnalisation (« autre »). */
export interface EventLike {
  event_type: EventType;
  custom_name?: string | null;
  custom_icon?: string | null;
  custom_color?: string | null;
}

/** Couleur (hex) d'un événement : la couleur choisie prime pour une activité perso. */
export function eventColorHex(e: EventLike): string {
  if (e.event_type === "autre" && e.custom_color) {
    return HABIT_COLORS[e.custom_color as HabitColor]?.hex ?? EVENT_TYPE_COLORS.autre;
  }
  return EVENT_TYPE_COLORS[e.event_type] ?? EVENT_TYPE_COLORS.autre;
}

/** Icône nue d'un type d'événement (hérite de currentColor sauf `colored`). */
export function EventTypeIcon({
  type,
  size = 18,
  className = "",
  colored = false,
  event,
}: {
  type: EventType;
  size?: number;
  className?: string;
  colored?: boolean;
  /** personnalisation (icône/couleur) pour une activité « autre » */
  event?: EventLike;
}) {
  if (type === "autre" && event?.custom_icon) {
    return (
      <HabitIcon
        name={event.custom_icon}
        size={size}
        className={className}
        color={colored ? eventColorHex(event) : "currentColor"}
      />
    );
  }
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
  event,
}: {
  type: EventType;
  size?: "sm" | "md";
  event?: EventLike;
}) {
  const hex = event ? eventColorHex(event) : (EVENT_TYPE_COLORS[type] ?? "#41668d");
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${
        size === "sm" ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
      }`}
      style={{ backgroundColor: habitPale(hex, "bg") }}
      aria-hidden
    >
      {type === "autre" && event?.custom_icon ? (
        <HabitIcon name={event.custom_icon} size={size === "sm" ? 16 : 20} color={hex} />
      ) : (
        (() => {
          const Icon = EVENT_TYPE_ICONS[type] ?? Target;
          return <Icon size={size === "sm" ? 16 : 20} color={hex} />;
        })()
      )}
    </span>
  );
}
