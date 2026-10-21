-- Immutable T0: activated_at cannot change once set on apd_shadow_activation_epochs.

CREATE OR REPLACE FUNCTION apd_shadow_activation_epoch_immutable_t0()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.activated_at IS NOT NULL AND NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'apd_shadow_activation_epochs.activated_at is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS apd_shadow_activation_epochs_immutable_t0 ON apd_shadow_activation_epochs;

CREATE TRIGGER apd_shadow_activation_epochs_immutable_t0
BEFORE UPDATE ON apd_shadow_activation_epochs
FOR EACH ROW
EXECUTE FUNCTION apd_shadow_activation_epoch_immutable_t0();
