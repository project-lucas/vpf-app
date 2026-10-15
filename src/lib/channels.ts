/**
 * Les fils d'un joueur (0048) — comme des groupes WhatsApp, un par RÔLE :
 *
 *   global     joueur + parents + tout le staff
 *   technique  joueur + le coach technique de son groupe (+ admins)
 *   physique   joueur + le coach physique de son groupe (+ admins)
 *   referent   joueur + son coach référent (+ admins)
 *   parents    parents + tout le staff du joueur — sans le joueur
 *   legacy     ancien fil privé d'un admin (avant 0048), lecture seule
 *
 * Un fil appartient au rôle, pas à la personne : un nouveau coach technique
 * reprend le fil et son historique. La RLS (`can_read_channel`) est seule juge
 * de l'audience ; ce fichier ne fait que nommer, ranger et filtrer.
 *
 * Identifiant d'un fil côté application : le rôle (`technique`…), ou
 * `legacy:<id du porteur>` pour une archive. C'est ce qui passe dans `?canal=`.
 */
export const CHANNEL_KINDS = ["global", "technique", "physique", "referent", "parents", "legacy"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export interface ChannelRef {
  kind: ChannelKind;
  /** porteur d'un fil `legacy` ; null pour les fils par rôle */
  ownerId: string | null;
}

export const GLOBAL: ChannelRef = { kind: "global", ownerId: null };

/** Ordre d'affichage des fils, comme une liste de discussions fixe. */
export const CHANNEL_ORDER: Record<ChannelKind, number> = {
  global: 0,
  referent: 1,
  technique: 2,
  physique: 3,
  parents: 4,
  legacy: 5,
};

export const CHANNEL_NAMES: Record<ChannelKind, string> = {
  global: "Global",
  technique: "Technique",
  physique: "Physique",
  referent: "Référent",
  parents: "Parents",
  legacy: "Ancien fil",
};

/** Qui est dans le fil, en une ligne (sous le nom, comme WhatsApp). */
export const CHANNEL_MEMBERS: Record<ChannelKind, string> = {
  global: "Joueur, parents et staff",
  technique: "Le joueur et son coach technique",
  physique: "Le joueur et son coach physique",
  referent: "Le joueur et son référent",
  parents: "Les parents et le staff, sans le joueur",
  legacy: "Archive en lecture seule",
};

export function channelId(ref: ChannelRef): string {
  return ref.kind === "legacy" ? `legacy:${ref.ownerId ?? ""}` : ref.kind;
}

/** `?canal=` → fil. Les anciennes valeurs (`staff`, un id d'admin) retombent sur Global. */
export function parseChannelId(value: string | null | undefined): ChannelRef {
  if (!value) return GLOBAL;
  if (value.startsWith("legacy:")) {
    const ownerId = value.slice("legacy:".length);
    return ownerId ? { kind: "legacy", ownerId } : GLOBAL;
  }
  return (CHANNEL_KINDS as readonly string[]).includes(value) && value !== "legacy"
    ? { kind: value as ChannelKind, ownerId: null }
    : GLOBAL;
}

/** Le fil d'une ligne `conversation_messages` / `conversation_reads`. */
export function refOfRow(row: { channel?: string | null; channel_admin_id?: string | null }): ChannelRef {
  const kind = ((CHANNEL_KINDS as readonly string[]).includes(row.channel ?? "")
    ? row.channel
    : "global") as ChannelKind;
  return kind === "legacy" ? { kind, ownerId: row.channel_admin_id ?? null } : { kind, ownerId: null };
}

/** Restreint une requête PostgREST à un fil. */
export function onChannel<Q>(query: Q, ref: ChannelRef): Q {
  type Filterable = { eq: (column: string, value: string) => Filterable };
  const q = (query as unknown as Filterable).eq("channel", ref.kind);
  return (ref.kind === "legacy" && ref.ownerId ? q.eq("channel_admin_id", ref.ownerId) : q) as unknown as Q;
}

/** Nom affiché : « Technique · Karim », « Référent · Lucas », « Global ». */
export function channelLabel(kind: ChannelKind, holderName: string | null): string {
  return holderName ? `${CHANNEL_NAMES[kind]} · ${holderName}` : CHANNEL_NAMES[kind];
}
