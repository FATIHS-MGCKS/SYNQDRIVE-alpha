-- M3.3-HV-H4-A3.3-O2-R2-H1 — narrow SECURITY DEFINER row-lock authority for SELECT-only issuer identity.

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(p_revision_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_revision_id IS NULL OR length(trim(p_revision_id)) = 0 THEN
    RAISE EXCEPTION 'revision_id required';
  END IF;

  PERFORM 1
  FROM public.battery_hv_charge_session_evidence_revisions
  WHERE id = p_revision_id
  FOR UPDATE;

  PERFORM 1
  FROM public.battery_hv_charge_session_evidence_acks
  WHERE revision_id = p_revision_id
  FOR UPDATE;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1(text) FROM PUBLIC;
