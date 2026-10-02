/**
 * SynqDrive DIMO integration uses a single platform-global Developer License.
 * Represented explicitly — not tenant-scoped connection identity.
 */
export const DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE = 'SYNQDRIVE_DIMO_DEVELOPER_LICENSE_GLOBAL';

/** HM fleet records may be org-scoped or master-global; normalize NULL org as platform-global HM scope. */
export function hmConnectionScopeForOrganization(organizationId: string): string {
  return `ORG:${organizationId}`;
}

/**
 * Internal mirror surrogate when hmVehicleReference is absent.
 * NOT physical identity, NOT provider identity — typed for audit only.
 */
export const HM_MIRROR_SURROGATE_PREFIX = 'HM_MIRROR_SURROGATE:';
