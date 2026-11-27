-- Session-bound MFA step-up grants (USR-P2E-E2). Legacy rows keep null binding and fail closed at validation.
ALTER TABLE "user_mfa_step_up_grants" ADD COLUMN "token_family" TEXT;
ALTER TABLE "user_mfa_step_up_grants" ADD COLUMN "organization_id" TEXT;
ALTER TABLE "user_mfa_step_up_grants" ADD COLUMN "membership_id" TEXT;
ALTER TABLE "user_mfa_step_up_grants" ADD COLUMN "session_version" INTEGER;
ALTER TABLE "user_mfa_step_up_grants" ADD COLUMN "security_version" INTEGER;
ALTER TABLE "user_mfa_step_up_grants" ADD COLUMN "membership_version" INTEGER;

CREATE INDEX "user_mfa_step_up_grants_user_id_token_family_idx"
  ON "user_mfa_step_up_grants"("user_id", "token_family");