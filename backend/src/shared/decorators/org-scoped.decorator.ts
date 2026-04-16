import { UseGuards, applyDecorators } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';

/**
 * Convenience decorator that applies OrgScopingGuard to any controller or handler
 * that has :orgId in the route path.
 *
 * Usage:
 *   @OrgScoped()
 *   @Controller('organizations/:orgId/something')
 *   export class SomethingController { ... }
 */
export const OrgScoped = () => applyDecorators(UseGuards(OrgScopingGuard));
