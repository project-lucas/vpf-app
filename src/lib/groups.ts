import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import type { GroupStaffMember, GroupWithStaff } from "./types";

/** Libellé du groupe fantôme des joueurs sans groupe (ne devrait pas exister). */
export const NO_GROUP_LABEL = "Sans groupe";

/**
 * Les groupes et leur staff, dans l'ordre d'affichage. La RLS rend tous les
 * groupes à tout le staff : un coach voit l'organisation du club, mais ne lit
 * que les joueurs des groupes où il est (cf. `is_coach_of`, 0040).
 *
 * Les prénoms du staff passent par le service_role : la RLS de `profiles` ne
 * donne pas à un coach le profil de ses collègues, et un groupe sans ses noms
 * ne dit rien. La liste des groupes, elle, reste sous RLS (staff seulement).
 */
export async function getGroupsWithStaff(supabase: SupabaseClient): Promise<GroupWithStaff[]> {
  const [{ data: groups }, { data: staffRows }] = await Promise.all([
    supabase.from("groups").select("*").order("position").order("created_at"),
    // id + prénom seulement : c'est tout ce qu'un groupe a besoin de dire de
    // son staff, et c'est ce qui part vers le navigateur d'un coach
    createAdminClient()
      .from("group_staff")
      .select("group_id, role, profile:profiles!group_staff_profile_id_fkey(id, first_name)"),
  ]);

  const staffByGroup = new Map<string, GroupStaffMember[]>();
  for (const row of staffRows ?? []) {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    if (!profile) continue;
    const list = staffByGroup.get(row.group_id) ?? [];
    list.push({
      id: profile.id as string,
      first_name: profile.first_name as string,
      staff_role: (row.role as "technique" | "physique" | null) ?? null,
    });
    staffByGroup.set(row.group_id, list);
  }

  return (groups ?? []).map((g) => ({
    ...g,
    staff: (staffByGroup.get(g.id) ?? []).sort((a, b) =>
      a.first_name.localeCompare(b.first_name, "fr")
    ),
  }));
}

/** Les groupes dont cet utilisateur fait partie du staff. */
export function groupsOfStaff(groups: GroupWithStaff[], userId: string): GroupWithStaff[] {
  return groups.filter((g) => g.staff.some((s) => s.id === userId));
}

/** « Lucas, Maxime » — les prénoms du staff d'un groupe. */
export function staffFirstNames(group: GroupWithStaff): string {
  return group.staff.map((s) => s.first_name).join(", ");
}
