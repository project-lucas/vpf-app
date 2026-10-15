import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Squelette de l'onglet Jarvis : il s'affiche aussitôt, la file arrive ensuite. */
export default function Loading() {
  return <PageSkeleton blocks={4} blockHeight="h-32" />;
}
