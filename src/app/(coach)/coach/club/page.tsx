import { redirect } from "next/navigation";

/**
 * L'ancien onglet Staff vit désormais dans l'onglet Admin (`/coach/admin`) :
 * cette adresse ne sert plus qu'aux anciens liens. Les fiches coach restent
 * sous `/coach/club/<id>`.
 */
export default function ClubPage() {
  redirect("/coach/admin");
}
