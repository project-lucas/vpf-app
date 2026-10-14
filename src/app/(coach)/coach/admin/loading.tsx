import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Squelette de l'onglet Admin (regard sur le service). */
export default function Loading() {
  return <PageSkeleton blocks={4} />;
}
