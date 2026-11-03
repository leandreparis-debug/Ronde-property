-- Étape 6 bis · migration 13 : l'application se connecte avec un rôle dédié et exécute ses
-- opérations système en `service_role` (withSystem). Le journal d'audit est écrit par
-- `private.audit`, révoqué pour anon et authenticated (migration 4) : le service doit pouvoir
-- l'appeler explicitement.

grant execute on function private.audit(text, text, uuid, jsonb, uuid) to service_role;
