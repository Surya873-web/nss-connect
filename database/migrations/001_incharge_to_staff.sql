-- Run once against an existing NSS Connect database before deploying the staff-role update.
-- Existing Incharge accounts keep their IDs, passwords, and related records.
UPDATE nss_users SET role = 'staff' WHERE role = 'incharge';
