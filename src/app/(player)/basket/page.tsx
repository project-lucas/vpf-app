import { redirect } from "next/navigation";

// Les séances basket vivent désormais dans l'onglet unifié « Mes séances »
export default function BasketPage() {
  redirect("/seances");
}
