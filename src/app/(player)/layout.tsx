import { createClient, getCachedUser } from "@/lib/supabase/server";
import { daysBetween, parisNow } from "@/lib/dates";
import { CHECKIN_INTERVAL_DAYS } from "@/lib/constants";
import { BottomNav } from "@/components/BottomNav";
import { CheckinModal } from "@/components/CheckinModal";
import { PushPrompt } from "@/components/PushPrompt";
import { InstallPrompt } from "@/components/InstallPrompt";
import {
  BallIcon,
  CalendarIcon,
  ChartIcon,
  UserIcon,
} from "@/components/icons";
import type { CheckinQuestion } from "@/lib/types";

export default async function PlayerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCachedUser();

  let checkinQuestion: CheckinQuestion | null = null;
  let notificationsEnabled = false;

  if (user) {
    const [{ data: lastCheckin }, { data: profile }] = await Promise.all([
      supabase
        .from("checkins")
        .select("question, created_at")
        .eq("player_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("profiles").select("notifications_enabled").eq("id", user.id).maybeSingle(),
    ]);

    // ?? true : aligné sur le défaut de la colonne (0001) et sur la page profil
    notificationsEnabled = profile?.notifications_enabled ?? true;

    // date Paris du dernier check-in : created_at est en UTC, sa date tronquée
    // ferait revenir le pop-up un jour trop tôt pour un check-in fait après minuit
    const daysSince = lastCheckin
      ? daysBetween(parisNow(new Date(lastCheckin.created_at)).date, parisNow().date)
      : Infinity;
    if (daysSince >= CHECKIN_INTERVAL_DAYS) {
      // alterne les deux questions de la V1
      checkinQuestion = lastCheckin?.question === "energy" ? "pain" : "energy";
    }
  }

  return (
    // Pleine largeur : le fond crème (matte) remplit tout l'écran et le contenu
    // s'étire avec la fenêtre. Le padding s'élargit sur grand écran pour respirer.
    // overflow-x-clip : coupe le débordement horizontal des animations décoratives
    // (halo de la frise, reflet du header) qui faisait clignoter une scrollbar,
    // sans créer de conteneur de défilement vertical (contrairement à hidden).
    <div className="ed min-h-dvh w-full overflow-x-clip bg-paper">
      <main className="w-full px-[22px] pb-32 pt-8 sm:px-8 lg:px-16 xl:px-24">{children}</main>
      {checkinQuestion && <CheckinModal question={checkinQuestion} />}
      <PushPrompt notificationsEnabled={notificationsEnabled} />
      <InstallPrompt />
      <BottomNav
        variant="editorial"
        items={[
          { href: "/planning", label: "Planning", icon: <CalendarIcon size={22} /> },
          // Séances : seul accès au programme préparé par le coach — sans cet
          // onglet, la page n'était joignable que depuis la fiche de 2 types d'événements
          { href: "/seances", label: "Séances", icon: <BallIcon size={22} /> },
          { href: "/dashboard", label: "Dashboard", icon: <ChartIcon size={22} /> },
          { href: "/parametres", label: "Profil", icon: <UserIcon size={22} /> },
        ]}
      />
    </div>
  );
}
