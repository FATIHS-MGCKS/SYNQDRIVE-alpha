/**
 * Builds a Prisma where clause scoped to a specific organization.
 * Ensures multi-tenant data isolation at the query level.
 */
export function withTenantScope<T extends Record<string, any>>(
  organizationId: string,
  where: T = {} as T,
): T & { organizationId: string } {
  return { ...where, organizationId };
}
