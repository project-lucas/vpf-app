"use client";

import {
  Activity,
  AlarmClock,
  Apple,
  BedDouble,
  Bike,
  BookOpen,
  Brain,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  GlassWater,
  Heart,
  HeartPulse,
  Moon,
  PersonStanding,
  Salad,
  Sun,
  Target,
  Timer,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";

// Registre des icônes d'habitudes : le nom (string) est stocké dans
// habits.icon en base et rendu dynamiquement ici.
const REGISTRY: Record<string, LucideIcon> = {
  dumbbell: Dumbbell,
  footprints: Footprints,
  bike: Bike,
  "person-standing": PersonStanding,
  activity: Activity,
  zap: Zap,
  flame: Flame,
  target: Target,
  trophy: Trophy,
  timer: Timer,
  droplets: Droplets,
  "glass-water": GlassWater,
  apple: Apple,
  salad: Salad,
  moon: Moon,
  "bed-double": BedDouble,
  "alarm-clock": AlarmClock,
  "book-open": BookOpen,
  brain: Brain,
  heart: Heart,
  "heart-pulse": HeartPulse,
  sun: Sun,
};

export function HabitIcon({
  name,
  size = 20,
  className = "",
  color,
  strokeWidth = 2,
}: {
  name: string;
  size?: number;
  className?: string;
  color?: string;
  strokeWidth?: number;
}) {
  const Icon = REGISTRY[name] ?? Flame;
  return <Icon size={size} className={className} color={color} strokeWidth={strokeWidth} />;
}
