import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Squelette du tableau de bord coach (KPI + flux des remontées joueurs). */
export default function Loading() {
  return <PageSkeleton blocks={4} />;
}
