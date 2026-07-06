import { redirect } from "next/navigation";

// Le middleware redirige déjà vers l'accueil du rôle ; ce fallback couvre
// le cas où la page est atteinte sans session.
export default function Home() {
  redirect("/login");
}
