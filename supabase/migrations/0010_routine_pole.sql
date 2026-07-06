-- Troisième pôle de séances : les routines (avant-match, étirements…).
-- Isolé dans sa propre migration : une valeur d'enum ajoutée ne peut pas être
-- utilisée dans la même transaction (le runner exécute un fichier = une
-- transaction).
alter type public.session_pole add value if not exists 'routine';
