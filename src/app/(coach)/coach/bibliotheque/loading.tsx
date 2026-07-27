import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Squelette de la bibliothèque de séances. */
export default function Loading() {
  return <PageSkeleton blocks={5} blockHeight="h-20" tabs={3} />;
}
