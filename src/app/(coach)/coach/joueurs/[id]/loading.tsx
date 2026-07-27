import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Squelette de la fiche joueur (la page la plus lourde du côté coach). */
export default function Loading() {
  return <PageSkeleton blocks={3} tabs={5} />;
}
