import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Squelette de la liste « Mes joueurs ». */
export default function Loading() {
  return <PageSkeleton blocks={5} blockHeight="h-24" />;
}
