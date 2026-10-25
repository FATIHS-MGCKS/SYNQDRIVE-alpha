CREATE UNIQUE INDEX "tire_wear_v3_prior_shadow_setup_model_fp_uq"
    ON "tire_wear_v3_prior_shadow_v1"("tire_setup_id", "model_version", "input_fingerprint");
