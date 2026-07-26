-- Phase 2A.7: Immutable audit logs (activity_logs + billing_audit_logs)
-- Append-only enforcement at the database layer — no UPDATE or DELETE.

CREATE OR REPLACE FUNCTION audit_deny_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23506';
END;
$$;

DROP TRIGGER IF EXISTS activity_logs_append_only ON "activity_logs";
CREATE TRIGGER activity_logs_append_only
  BEFORE UPDATE OR DELETE ON "activity_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_deny_row_mutation();

DROP TRIGGER IF EXISTS billing_audit_logs_append_only ON "billing_audit_logs";
CREATE TRIGGER billing_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "billing_audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_deny_row_mutation();
