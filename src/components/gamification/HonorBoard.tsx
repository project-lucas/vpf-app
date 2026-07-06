import { Hand, Star, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import { RECORD_LABELS, type MatchRecords, type RecordKey } from "@/lib/gamification";
import { formatDateFr } from "@/lib/dates";
import { CountUp } from "@/components/ui/CountUp";

export interface CareerShooting {
  fgMade: number;
  fgAttempted: number;
  threeMade: number;
  threeAttempted: number;
}

const RECORD_ICONS: Record<RecordKey, LucideIcon> = {
  points: Trophy,
  twos: Target,
  threes: Star,
  rebounds: Hand,
  steals: Zap,
};

const RECORD_ORDER: RecordKey[] = ["points", "twos", "threes", "rebounds", "steals"];

/**
 * Tableau d'honneur : les records personnels en match, à battre.
 * Les records de tir restent verrouillés tant qu'aucun match n'a de stats de tir.
 */
export function HonorBoard({
  records,
  shooting,
}: {
  records: MatchRecords;
  shooting?: CareerShooting | null;
}) {
  const fgPct =
    shooting && shooting.fgAttempted > 0
      ? Math.round((shooting.fgMade / shooting.fgAttempted) * 100)
      : null;
  const threePct =
    shooting && shooting.threeAttempted > 0
      ? Math.round((shooting.threeMade / shooting.threeAttempted) * 100)
      : null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="ed-value text-lg text-ink">Tableau d&apos;honneur</h2>
        <span className="ed-overline">À battre</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {RECORD_ORDER.map((key) => {
          const Icon = RECORD_ICONS[key];
          const record = records[key];
          return (
            <div
              key={key}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 ${
                record ? "bg-warm/20" : "bg-tan"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                  record ? "bg-warm/30 text-orange" : "bg-card text-muted"
                }`}
                aria-hidden
              >
                <Icon size={17} />
              </span>
              <div className="min-w-0">
                <p
                  className={`ed-value text-2xl leading-none ${
                    record ? "text-ink" : "text-muted"
                  }`}
                >
                  {record ? <CountUp value={record.value} /> : "—"}
                </p>
                <p className="truncate text-[10px] font-semibold text-meta">
                  {RECORD_LABELS[key]}
                  {record && ` · ${formatDateFr(record.date)}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {fgPct !== null && (
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md bg-ink px-3 py-2.5">
          <p className="ed-meta" style={{ color: "var(--color-warm)" }}>
            Adresse carrière
          </p>
          <p className="text-xs font-semibold text-paper">
            <span className="ed-value text-lg text-warm">{fgPct} %</span> aux tirs
            {threePct !== null && (
              <>
                {" · "}
                <span className="ed-value text-lg text-warm">{threePct} %</span> à 3
                pts
              </>
            )}
          </p>
        </div>
      )}
      <p className="mt-2.5 text-xs text-muted">
        {records.twos === null || records.threes === null
          ? "Renseigne tes tirs à la saisie d'un match pour débloquer les records de tir."
          : "Bats un record en match et l'app le célèbre avec toi."}
      </p>
    </div>
  );
}
