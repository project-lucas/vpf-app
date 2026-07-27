import { PageSkeleton } from "@/components/ui/PageSkeleton";

/** Squelette du planning coach. */
export default function Loading() {
  return <PageSkeleton blocks={4} tabs={3} />;
}
