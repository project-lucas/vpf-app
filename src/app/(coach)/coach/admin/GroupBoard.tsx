"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Settings2, Trash2, UserMinus, X } from "lucide-react";
import { createGroup, deleteGroup, renameGroup, setGroupStaff } from "@/app/actions/groups";
import { archivePlayer } from "@/app/actions/admin";
import { OfferMark } from "@/components/coach/HomeCells";
import { formatPercent } from "@/lib/discipline";
import { LOW_DISCIPLINE_THRESHOLD } from "@/lib/constants";
import type { PlayerAvailability, PlayerOffer } from "@/lib/types";

export interface BoardPlayer {
  id: string;
  firstName: string;
  lastName: string;
  offer: PlayerOffer;
  availability: PlayerAvailability;
  discipline: number | null;
}

export interface BoardStaff {
  id: string;
  name: string;
  isAdmin: boolean;
  /** ce que rend ce membre du staff : « 7 joueurs · bilans 0/7 · actif il y a 3 j » */
  summary: string;
  /** ce qui l'attend : « 2 fils sans réponse », « 1 douleur »… */
  alerts: string[];
}

export interface BoardGroup {
  id: string;
  name: string;
  staffIds: string[];
  /** coachs référents de joueurs du groupe sans en être le staff */
  referentIds: string[];
  players: BoardPlayer[];
}

type Result = { ok: true } | { ok: false; error: string };
type Run = (action: () => Promise<Result>, after?: () => void) => void;

/**
 * Le cœur de l'onglet Admin : une colonne par groupe, côte à côte, sans
 * défilement de page. Chaque colonne montre son staff (et le travail de
 * chacun), puis ses joueurs ; un joueur qui quitte le club se retire en TROIS
 * clics (icône → « Retirer du club ? » → « Confirmer le départ ») — c'est un
 * archivage : il ne peut plus se connecter, son historique reste, la fiche
 * coach permet de le réactiver. La dernière colonne crée le groupe suivant.
 */
export function GroupBoard({ groups, staff }: { groups: BoardGroup[]; staff: BoardStaff[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [newName, setNewName] = useState("");

  const run: Run = (action, after) => {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
      else after?.();
    });
  };

  const nextName = `Groupe ${String.fromCharCode(65 + groups.length)}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error && (
        <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>
      )}
      <div className="grid min-h-0 flex-1 gap-4 lg:auto-cols-[minmax(300px,1fr)] lg:grid-flow-col lg:overflow-x-auto lg:pb-1">
        {groups.map((g) => (
          <GroupColumn key={g.id} group={g} staff={staff} disabled={pending} run={run} />
        ))}

        {/* créer le groupe suivant */}
        <form
          className="flex flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed border-sand p-5 text-center lg:w-[240px]"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newName.trim() || nextName;
            run(() => createGroup(name), () => setNewName(""));
          }}
        >
          <span className="shadow-soft flex h-11 w-11 items-center justify-center rounded-full bg-white text-accent">
            <Plus size={20} />
          </span>
          <p className="text-[13px] font-bold text-navy-800">Nouveau groupe</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 40))}
            placeholder={nextName}
            aria-label="Nom du nouveau groupe"
            className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-center text-[13px] focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-navy-800 py-2 text-[13px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            Créer {newName.trim() || nextName}
          </button>
        </form>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function GroupColumn({
  group,
  staff,
  disabled,
  run,
}: {
  group: BoardGroup;
  staff: BoardStaff[];
  disabled: boolean;
  run: Run;
}) {
  const [name, setName] = useState(group.name);
  const [editStaff, setEditStaff] = useState(false);
  const members = staff.filter((s) => group.staffIds.includes(s.id));
  // un coach référent d'un joueur du groupe reste visible, même hors staff
  const referents = staff.filter(
    (s) => group.referentIds.includes(s.id) && !group.staffIds.includes(s.id),
  );
  const shown = [...members, ...referents];
  const count = group.players.length;
  const perf = group.players.filter((p) => p.offer === "perf").length;

  return (
    <section className="shadow-soft flex min-h-0 flex-col rounded-[20px] bg-white">
      {/* tête : nom modifiable, chiffres */}
      <header className="flex items-center gap-2 border-b border-sand px-4 py-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const clean = name.trim();
            if (clean && clean !== group.name) run(() => renameGroup(group.id, clean));
            else setName(group.name);
          }}
          maxLength={40}
          aria-label="Nom du groupe"
          className="font-display min-w-0 flex-1 rounded-md bg-transparent px-1 text-[20px] font-extrabold uppercase tracking-wide text-navy-900 hover:bg-cream focus:bg-cream focus:outline-none"
        />
        <span className="shrink-0 text-[11.5px] font-semibold text-navy-400">
          {count} joueur{count > 1 ? "s" : ""}
          {count > 0 ? ` · ${perf} P · ${count - perf} F` : ""}
        </span>
        {count === 0 && (
          <button
            type="button"
            onClick={() => run(() => deleteGroup(group.id))}
            disabled={disabled}
            aria-label={`Supprimer ${group.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-navy-300 hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 size={15} />
          </button>
        )}
      </header>

      {/* staff */}
      <div className="border-b border-sand px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-navy-400">
            Staff · {members.length}
          </p>
          <button
            type="button"
            onClick={() => setEditStaff((v) => !v)}
            aria-expanded={editStaff}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-navy-400 hover:bg-cream hover:text-navy-800"
          >
            <Settings2 size={13} /> {editStaff ? "Terminer" : "Modifier"}
          </button>
        </div>

        {editStaff ? (
          <div className="flex flex-wrap gap-1.5">
            {staff.map((s) => {
              const member = group.staffIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={member}
                  onClick={() => run(() => setGroupStaff(group.id, s.id, !member))}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
                    member
                      ? "bg-navy-800 text-white hover:bg-navy-700"
                      : "text-navy-500 ring-1 ring-inset ring-sand hover:bg-cream"
                  }`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-[12.5px] text-navy-400">Personne : « Modifier » pour y mettre un coach.</p>
        ) : (
          <ul className="space-y-1">
            {shown.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/coach/club/${s.id}`}
                  className="flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-cream"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[10.5px] font-extrabold text-white">
                    {initials(s.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-navy-900">
                      <span className="truncate">{s.name}</span>
                      {s.isAdmin && (
                        <span className="rounded bg-navy-800 px-1 text-[9.5px] font-extrabold uppercase text-white">
                          Admin
                        </span>
                      )}
                      {!group.staffIds.includes(s.id) && (
                        <span
                          className="rounded px-1 text-[9.5px] font-extrabold uppercase text-navy-500 ring-1 ring-inset ring-sand"
                          title="Coach référent de joueurs du groupe, pas dans son staff"
                        >
                          Référent
                        </span>
                      )}
                      {s.alerts.length > 0 && (
                        <span className="ml-auto rounded-full bg-danger-soft px-1.5 text-[11px] font-extrabold text-danger">
                          {s.alerts.length}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] text-navy-400">{s.summary}</span>
                    {s.alerts.length > 0 && (
                      <span
                        className="block truncate text-[11.5px] font-semibold text-danger"
                        title={s.alerts.join(" · ")}
                      >
                        {s.alerts.join(" · ")}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* joueurs : la colonne défile, pas la page */}
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
        <p className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-navy-400">
          Joueurs · {count}
        </p>
        {count === 0 ? (
          <p className="pb-3 text-[12.5px] text-navy-400">
            Aucun joueur. Un joueur change de groupe depuis sa fiche.
          </p>
        ) : (
          <ul className="-mx-1.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-3">
            {group.players.map((p) => (
              <PlayerLine key={p.id} player={p} disabled={disabled} run={run} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Le libellé du bouton à chaque étape du retrait (étape 1 = l'icône). */
const STEP_LABEL: Record<number, string> = {
  1: "Retirer du club ?",
  2: "Confirmer le départ",
};

function PlayerLine({ player: p, disabled, run }: { player: BoardPlayer; disabled: boolean; run: Run }) {
  // 0 = repos ; 1 et 2 = confirmations après le premier clic sur l'icône
  const [step, setStep] = useState(0);
  const name = `${p.firstName} ${p.lastName}`.trim();

  // sans suite pendant 6 s, la confirmation retombe
  useEffect(() => {
    if (step === 0) return;
    const t = setTimeout(() => setStep(0), 6000);
    return () => clearTimeout(t);
  }, [step]);

  const low = p.discipline !== null && p.discipline < LOW_DISCIPLINE_THRESHOLD;

  return (
    <li
      className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 ${
        step > 0 ? "bg-danger-soft/60" : "hover:bg-cream"
      }`}
    >
      <Link href={`/coach/joueurs/${p.id}`} className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[13px] font-semibold text-navy-900">{name}</span>
        <OfferMark offer={p.offer} />
        {p.availability !== "available" && (
          <span className="text-[11px] font-bold text-warning">
            {p.availability === "injured" ? "Blessé" : "Vacances"}
          </span>
        )}
      </Link>
      {step === 0 ? (
        <>
          <span className={`text-[11.5px] tabular-nums ${low ? "font-bold text-danger" : "text-navy-400"}`}>
            {formatPercent(p.discipline)}
          </span>
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={disabled}
            aria-label={`Retirer ${name} du club`}
            title="Retirer du club"
            className="flex h-7 w-7 items-center justify-center rounded-md text-navy-300 hover:bg-danger-soft hover:text-danger"
          >
            <UserMinus size={14} />
          </button>
        </>
      ) : (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (step === 1) setStep(2);
              else run(() => archivePlayer(p.id), () => setStep(0));
            }}
            aria-label={step === 2 ? `Confirmer le départ de ${name}` : `Retirer ${name} du club ?`}
            className={`rounded-md px-2 py-1 text-[11.5px] font-extrabold ${
              step === 2 ? "bg-danger text-white" : "text-danger ring-1 ring-inset ring-danger/40"
            }`}
          >
            {STEP_LABEL[step]}
          </button>
          <button
            type="button"
            onClick={() => setStep(0)}
            aria-label="Annuler"
            className="flex h-6 w-6 items-center justify-center rounded-md text-navy-400 hover:bg-white"
          >
            <X size={13} />
          </button>
        </span>
      )}
    </li>
  );
}
