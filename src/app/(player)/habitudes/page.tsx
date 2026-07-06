import { redirect } from "next/navigation";

// Les habitudes vivent désormais dans le dashboard (section Habitudes) ;
// la route est conservée pour les anciens liens et raccourcis PWA.
export default function HabitudesPage() {
  redirect("/dashboard");
}
