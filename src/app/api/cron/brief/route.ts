import { NextRequest, NextResponse } from "next/server";
import { generateMorningBriefs } from "@/lib/morning-brief";
import { parisNow } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Fenêtre du passage du matin, en heure de Paris. */
const BRIEF_HOUR = 7;

/**
 * Route cron du brief du matin — appelée par pg_cron à 5h et 6h UTC (l'une
 * des deux est 7h de Paris, été comme hiver). Ne travaille qu'à 7h et ne
 * réécrit jamais un brief déjà fait ; `?force=1` passe outre (test, relance).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const force = request.nextUrl.searchParams.get("force") === "1";
  const now = parisNow();
  const inWindow = now.minutesOfDay >= BRIEF_HOUR * 60 && now.minutesOfDay < (BRIEF_HOUR + 1) * 60;
  if (!force && !inWindow) {
    return NextResponse.json({ ok: true, skipped: "hors créneau", parisTime: `${now.date} ${now.time}` });
  }

  const result = await generateMorningBriefs({ force });
  return NextResponse.json({ ...result, parisTime: `${now.date} ${now.time}` }, { status: result.ok ? 200 : 500 });
}
