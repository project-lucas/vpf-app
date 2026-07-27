import { notFound } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/server";
import { isBetaPlayer } from "@/lib/beta";
import { AssignedSessionsList } from "@/components/sessions/AssignedSessionsList";

export const metadata = { title: "Programme — VPF" };
export const dynamic = "force-dynamic";

export default async function SeancesPage() {
  // écran en construction : masquer l'onglet ne suffit pas, l'URL reste
  // tapable — hors accès anticipé, la page n'existe pas.
  const user = await getCachedUser();
  if (!isBetaPlayer(user?.id)) notFound();

  return <AssignedSessionsList />;
}
