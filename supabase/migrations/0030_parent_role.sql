-- VPF — Rôle « parent » (1/2)
--
-- Un parent est lié à UN joueur (son enfant) et consulte son suivi en lecture
-- seule : planning et pointages, stats, hygiène de vie (offre formation) — et
-- participe au fil de discussion joueur ↔ coach.
--
-- Cette migration ne fait qu'étendre l'enum user_role : une valeur d'enum
-- ajoutée ne peut pas être UTILISÉE dans la même transaction (chaque fichier
-- de migration en est une). Tables, helpers et policies suivent en 0031.
-- ---------------------------------------------------------------------------

alter type public.user_role add value if not exists 'parent';
