-- M3.3-HV-H4-A3.3-O2-R2 — SECURITY DEFINER invalidation (restricted app role may UPDATE parents without attestation DELETE privilege).

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_revision_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.battery_hv_charge_session_evidence_integrity_attestations
  WHERE revision_id = OLD.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_ack_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.battery_hv_charge_session_evidence_integrity_attestations
  WHERE durability_ack_id = OLD.id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_revision_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.m3_3_hv_h4_a3_invalidate_attestations_for_ack_v1() FROM PUBLIC;
