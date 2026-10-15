import { NextRequest, NextResponse } from "next/server";
import { runJarvisWork } from "@/lib/jarvis-work";
import { parisNow } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Route cron du travail de Jarvis — appelée toutes les 10 min par pg_cron
 * (`npm run setup:cron:jarvis`). Chaque appel avance ce qui reste à préparer
 * (réponses aux bilans, visios, fiches mémoire, rapports du mois) dans la
 * limite de temps, puis rend la main : le suivant reprend. Sans travail en
 * attente, il ne fait que quelques lectures.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    request.nextUrl.searchParams.get("secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const now = parisNow();
  const result = await runJarvisWork({
    budgetMs: 50_000,
    scanDropout: request.nextUrl.searchParams.get("decrochage") === "1",
    reports: request.nextUrl.searchParams.get("rapports") === "1",
  });
  return NextResponse.json(
    { ...result, parisTime: `${now.date} ${now.time}` },
    { status: result.ok || !result.error ? 200 : 500 }
  );
}
