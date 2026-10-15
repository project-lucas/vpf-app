"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { MoreHorizontal, Plus, Settings2, Trash2, UserMinus, X } from "lucide-react";
import { createGroup, deleteGroup, moveStaffToGroup, renameGroup, setGroupStaff } from "@/app/actions/groups";
import { archivePlayer, deleteCoach } from "@/app/actions/admin";
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
 * défilement de page. Chaque colonne montre son staff (un nom par ligne, un
 * menu pour le déplacer, le retirer du groupe ou supprimer son compte), puis
 * ses joueurs ; un joueur qui quitte le club se retire en TROIS
 * clics (icône → « Retirer du club ? » → « Confirmer le départ ») — c'est un
 * archivage : il ne peut plus se connecter, son historique reste, la fiche
 * coach permet de le réactiver. « Nouveau groupe » vit dans la tête du dernier
 * groupe.
 */
export function GroupBoard({
  groups,
  staff,
  meId,
}: {
  groups: BoardGroup[];
  staff: BoardStaff[];
  /** l'admin connecté : il ne peut pas supprimer son propre compte */
  meId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
      <div className="grid min-h-0 flex-1 gap-4 sm:auto-cols-[minmax(300px,1fr)] sm:grid-flow-col sm:overflow-x-auto sm:pb-1">
        {groups.map((g, i) => (
          <GroupColumn
            key={g.id}
            group={g}
            groups={groups}
            staff={staff}
            meId={meId}
            disabled={pending}
            run={run}
            // créer le groupe suivant : dans la tête du dernier groupe
            headerAction={
              i === groups.length - 1 ? (
                <NewGroupButton
                  nextName={nextName}
                  disabled={pending}
                  onCreate={(name, done) => run(() => createGroup(name), done)}
                />
              ) : null
            }
          />
        ))}
        {groups.length === 0 && (
          <div className="flex items-center justify-center rounded-[20px] border-2 border-dashed border-sand p-5">
            <NewGroupButton
              nextName={nextName}
              disabled={pending}
              onCreate={(name, done) => run(() => createGroup(name), done)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** « + Nouveau groupe » dans la tête de colonne ; se déplie en champ + Créer. */
function NewGroupButton({
  nextName,
  disabled,
  onCreate,
}: {
  nextName: string;
  disabled: boolean;
  onCreate: (name: string, done: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sand px-2 py-1 text-[11.5px] font-bold text-navy-600 hover:bg-cream hover:text-navy-900"
      >
        <Plus size={13} className="text-accent" /> Nouveau groupe
      </button>
    );
  }

  return (
    <form
      className="flex shrink-0 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate(value.trim() || nextName, () => {
          setValue("");
          setOpen(false);
        });
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 40))}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={nextName}
        aria-label="Nom du nouveau groupe"
        className="w-24 rounded-lg border border-sand bg-white px-2 py-1 text-[12px] focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-lg bg-navy-800 px-2 py-1 text-[11.5px] font-bold text-white hover:bg-navy-700 disabled:opacity-40"
      >
        Créer
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Annuler"
        className="flex h-6 w-6 items-center justify-center rounded-md text-navy-400 hover:bg-cream"
      >
        <X size={13} />
      </button>
    </form>
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
  groups,
  staff,
  meId,
  disabled,
  run,
  headerAction,
}: {
  group: BoardGroup;
  groups: BoardGroup[];
  staff: BoardStaff[];
  meId: string;
  disabled: boolean;
  run: Run;
  headerAction?: ReactNode;
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
        {headerAction}
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
          <ul className="space-y-0.5">
            {shown.map((m) => (
              <StaffLine
                key={m.id}
                member={m}
                group={group}
                groups={groups}
                isStaff={group.staffIds.includes(m.id)}
                isMe={m.id === meId}
                disabled={disabled}
                run={run}
              />
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

/**
 * Un membre du staff dans la colonne d'un groupe : son nom, et un menu ⋯ —
 * déplacer vers un autre groupe, retirer de ce groupe, supprimer le compte.
 * La suppression se confirme en TROIS clics (« Supprimer le compte » →
 * « Supprimer ? » → « Confirmer ») : elle est définitive, ses joueurs passent
 * à l'admin qui supprime, et ses fils privés avec les joueurs sont effacés.
 */
function StaffLine({
  member: m,
  group,
  groups,
  isStaff,
  isMe,
  disabled,
  run,
}: {
  member: BoardStaff;
  group: BoardGroup;
  groups: BoardGroup[];
  isStaff: boolean;
  isMe: boolean;
  disabled: boolean;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  // 0 = repos ; 1 et 2 = confirmations de la suppression du compte
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step === 0) return;
    const t = setTimeout(() => setStep(0), 6000);
    return () => clearTimeout(t);
  }, [step]);

  const others = groups.filter((g) => g.id !== group.id && !g.staffIds.includes(m.id));
  const firstName = m.name.split(" ")[0] ?? m.name;

  return (
    <li className={`rounded-lg ${open ? "bg-cream" : ""}`}>
      <div className="flex items-center gap-2 px-1.5 py-1">
        <Link href={`/coach/club/${m.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[10.5px] font-extrabold text-white">
            {initials(m.name)}
          </span>
          <span className="truncate text-[13px] font-bold text-navy-900">{m.name}</span>
          {m.isAdmin && (
            <span className="rounded bg-navy-800 px-1 text-[9.5px] font-extrabold uppercase text-white">Admin</span>
          )}
          {!isStaff && (
            <span
              className="rounded px-1 text-[9.5px] font-extrabold uppercase text-navy-500 ring-1 ring-inset ring-sand"
              title="Coach référent de joueurs du groupe, pas dans son staff"
            >
              Référent
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setStep(0);
          }}
          aria-expanded={open}
          aria-label={`Actions pour ${m.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-navy-400 hover:bg-white hover:text-navy-900"
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap items-center gap-1.5 px-1.5 pb-2">
          {others.map((g) => (
            <button
              key={g.id}
              type="button"
              disabled={disabled}
              onClick={() =>
                run(() => moveStaffToGroup(m.id, isStaff ? group.id : null, g.id), () => setOpen(false))
              }
              className="rounded-md bg-white px-2 py-1 text-[11.5px] font-bold text-navy-800 ring-1 ring-inset ring-sand hover:text-accent"
            >
              {isStaff ? "Déplacer vers" : "Ajouter à"} {g.name}
            </button>
          ))}
          {!isStaff && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => run(() => setGroupStaff(group.id, m.id, true), () => setOpen(false))}
              className="rounded-md bg-white px-2 py-1 text-[11.5px] font-bold text-navy-800 ring-1 ring-inset ring-sand hover:text-accent"
            >
              Ajouter au staff de {group.name}
            </button>
          )}
          {isStaff && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => run(() => setGroupStaff(group.id, m.id, false), () => setOpen(false))}
              className="rounded-md bg-white px-2 py-1 text-[11.5px] font-bold text-navy-600 ring-1 ring-inset ring-sand hover:text-navy-900"
            >
              Retirer de {group.name}
            </button>
          )}
          {!isMe &&
            (step === 0 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setStep(1)}
                className="rounded-md px-2 py-1 text-[11.5px] font-bold text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger-soft"
              >
                Supprimer le compte
              </button>
            ) : (
              <span className="flex w-full flex-wrap items-center gap-1.5 rounded-md bg-danger-soft/70 px-2 py-1.5">
                <span className="text-[11.5px] font-semibold text-danger">
                  {step === 1
                    ? `Supprimer le compte de ${firstName} ? C'est définitif.`
                    : `Ses joueurs passent à toi, ses fils privés avec les joueurs sont effacés.`}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (step === 1) setStep(2);
                    else run(() => deleteCoach(m.id), () => setStep(0));
                  }}
                  className={`rounded-md px-2 py-1 text-[11.5px] font-extrabold ${
                    step === 2 ? "bg-danger text-white" : "text-danger ring-1 ring-inset ring-danger/40"
                  }`}
                >
                  {step === 1 ? "Supprimer ?" : "Confirmer la suppression"}
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
            ))}
        </div>
      )}
    </li>
  );
}
