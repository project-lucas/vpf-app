import { AssignedSessionsList } from "@/components/sessions/AssignedSessionsList";

export const metadata = { title: "Mes séances — VPF" };
export const dynamic = "force-dynamic";

export default function SeancesPage() {
  return <AssignedSessionsList />;
}
