CREATE TRIGGER protect_system_owner_update
BEFORE UPDATE ON members
WHEN OLD.system_owner = 1 AND (NEW.system_owner <> 1 OR NEW.role <> 'owner' OR NEW.active <> 1)
BEGIN
  SELECT RAISE(ABORT, 'The system owner cannot be demoted or deactivated');
END;

CREATE TRIGGER protect_system_owner_delete
BEFORE DELETE ON members
WHEN OLD.system_owner = 1
BEGIN
  SELECT RAISE(ABORT, 'The system owner cannot be deleted');
END;
