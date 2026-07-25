import type { ConfigType } from '@nestjs/config';
import type aiConfig from '@config/ai.config';

/**
 * Whether domain-grounded orchestrator (tools + evidence) is active for an org.
 *
 * Rollout order:
 * 1. `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED=false` → legacy direct-LLM chat for all orgs.
 * 2. Enable globally with `FLEET_CHAT_DOMAIN_GROUNDING_ENABLED=true`.
 * 3. Canary: keep flag true and set `FLEET_CHAT_ORG_ALLOWLIST` to pilot org UUIDs only.
 */
export function isFleetChatDomainGroundingEnabled(
  organizationId: string,
  config: Pick<
    ConfigType<typeof aiConfig>,
    'fleetChatDomainGroundingEnabled' | 'fleetChatOrgAllowlist'
  >,
): boolean {
  if (!config.fleetChatDomainGroundingEnabled) {
    return false;
  }
  if (config.fleetChatOrgAllowlist.length === 0) {
    return true;
  }
  return config.fleetChatOrgAllowlist.includes(organizationId);
}
