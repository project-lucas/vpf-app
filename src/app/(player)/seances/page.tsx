import { AssignedSessionsList } from "@/components/sessions/AssignedSessionsList";

export const metadata = { title: "Programme — VPF" };
export const dynamic = "force-dynamic";

/** Jour valide (1 = lundi … 7 = dimanche) porté par un lien, sinon undefined. */
function toWeekday(value: string | undefined): number | undefined {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day : undefined;
}

export default async function SeancesPage({
  searchParams,
}: {
  searchParams: Promise<{ jour?: string }>;
}) {
  // ?jour=3 : le planning et les notifications ouvrent le programme sur le bon
  // jour plutôt que sur aujourd'hui.
  const { jour } = await searchParams;
  return <AssignedSessionsList initialDay={toWeekday(jour)} />;
}
