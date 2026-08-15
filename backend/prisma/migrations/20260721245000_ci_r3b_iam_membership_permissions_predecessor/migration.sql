-- CI-R3B historical predecessor repair: organization_memberships.permissions
-- after: 20260721240000_iam_last_selected_organization
-- before: 20260721250000_iam_versioned_role_assignments

ALTER TABLE "organization_memberships" ADD COLUMN "permissions" JSONB;
