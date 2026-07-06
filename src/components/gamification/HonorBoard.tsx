import { Award, Hand, Star, Target, Trophy, Zap, type LucideIcon } from "lucide-react";
import { RECORD_LABELS, type MatchRecords, type RecordKey } from "@/lib/gamification";
import { formatDateFr } from "@/lib/dates";
import { CountUp } from "@/components/ui/CountUp";

const RECORD_ICONS: Record<RecordKey, LucideIcon> = {
  points: Trophy,
  shots: Target,
  threes: Star,
  twosInside: Zap,
  twosOutside: Hand,
  freeThrows: Award,
};

const RECORD_ORDER: RecordKey[] = [
  "points",
  "shots",
  "threes",
  "twosInside",
  "twosOutside",
  "freeThrows",
];

/** Tableau d'honneur : les records personnels en match, à battre. */
export function HonorBoard({ records }: { records: MatchRecords }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="ed-value text-lg text-ink">Tableau d&apos;honneur</h2>
        <span className="ed-overline">Mes records à battre</span>
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
      <p className="mt-2.5 text-xs text-muted">
        {records.points === null
          ? "Saisis ta première feuille de match pour ouvrir tes records."
          : "Bats un record en match et l'app le célèbre avec toi."}
      </p>
    </div>
  );
}
