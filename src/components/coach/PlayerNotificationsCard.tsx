import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { BellIcon } from "@/components/icons";

/**
 * État des notifications push d'un joueur, vu par son coach (lecture seule —
 * seul le joueur peut les activer depuis son téléphone).
 *
 * Deux conditions doivent être réunies pour qu'un rappel parte vraiment :
 * l'interrupteur de ses paramètres (profiles.notifications_enabled) ET au moins
 * un appareil abonné (push_subscriptions). Comme l'interrupteur vaut `true` par
 * défaut, l'afficher seul dirait « activées » pour tout le monde, y compris un
 * joueur qui n'a jamais accepté la demande du navigateur : c'est le compte
 * d'appareils qui tranche.
 */
export function PlayerNotificationsCard({
  enabled,
  deviceCount,
}: {
  enabled: boolean;
  deviceCount: number;
}) {
  const reachable = enabled && deviceCount > 0;

  const { tone, label, detail } = !enabled
    ? {
        tone: "danger" as const,
        label: "Désactivées",
        detail:
          "Le joueur a coupé les notifications dans ses paramètres. Il ne reçoit ni rappel d'événement, ni bilan du dimanche.",
      }
    : deviceCount === 0
      ? {
          tone: "warning" as const,
          label: "Aucun appareil",
          detail:
            "Le joueur n'a encore autorisé les notifications sur aucun téléphone — il ne reçoit donc rien. À faire de son côté depuis ses paramètres.",
        }
      : {
          tone: "success" as const,
          label: "Activées",
          detail: `Il reçoit les rappels sur ${deviceCount} appareil${
            deviceCount > 1 ? "s" : ""
          }.`,
        };

  return (
    <Card>
      <CardTitle>Notifications push</CardTitle>
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 shrink-0 ${reachable ? "text-success" : "text-navy-300"}`}
          aria-hidden
        >
          <BellIcon size={18} />
        </span>
        <div className="min-w-0">
          <Badge tone={tone}>{label}</Badge>
          <p className="mt-1.5 text-xs leading-relaxed text-navy-500">{detail}</p>
        </div>
      </div>
    </Card>
  );
}
