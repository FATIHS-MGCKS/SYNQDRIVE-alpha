-- Rename last auth org hint to explicit user-selected organization (Prompt 8/22)

ALTER TABLE "users"
  RENAME COLUMN "last_auth_organization_id" TO "last_selected_organization_id";
