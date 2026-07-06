import { redirect } from "next/navigation";

// Les séances physiques vivent désormais dans l'onglet unifié « Mes séances »
export default function PhysiquePage() {
  redirect("/seances");
}
