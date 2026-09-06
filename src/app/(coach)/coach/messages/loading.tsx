import { PageSkeleton } from "@/components/ui/PageSkeleton";

/**
 * Messages est l'onglet le plus ouvert du staff — et le seul qui n'avait pas
 * de squelette : la navigation restait figée sur l'écran précédent le temps
 * de composer la boîte. Une coquille immédiate, des lignes à la place des
 * cartes.
 */
export default function Loading() {
  return <PageSkeleton blocks={7} blockHeight="h-12" />;
}
