/**
 * VO5C-P2B4-0 — Legacy platform-wide prune CLI is permanently disabled.
 *
 * Historical twin of `PlatformAdminService.pruneMasterData()` (removed).
 * Recovery-grade replacement is not implemented. No environment override.
 *
 * npm run prisma:prune exits before any database access.
 */

const PLATFORM_PRUNE_DISABLED_CODE = 'PLATFORM_PRUNE_DISABLED';

function failClosed(): void {
  const payload = {
    code: PLATFORM_PRUNE_DISABLED_CODE,
    message:
      'Legacy platform-wide prune is disabled pending independent execution authority and recovery controls.',
    action: 'CONTACT_PLATFORM_SECURITY_OPERATOR',
  };
  console.error(JSON.stringify(payload));
  process.exit(1);
}

failClosed();
