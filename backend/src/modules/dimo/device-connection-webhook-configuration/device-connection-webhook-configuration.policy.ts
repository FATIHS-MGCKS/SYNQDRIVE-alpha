/** Read-only DIMO trigger registry cache policy (ms). */
export const DEVICE_CONNECTION_TRIGGER_REGISTRY_CACHE_TTL_MS = Number(
  process.env.DEVICE_CONNECTION_TRIGGER_REGISTRY_CACHE_TTL_MS ?? 15 * 60 * 1000,
);

export const DEVICE_CONNECTION_TRIGGER_REGISTRY_SCOPE = 'DIMO_DEVELOPER';

/**
 * Approved ops architecture: unplug via webhook, plug via snapshot recovery.
 * Plug webhook trigger is intentionally NOT_APPLICABLE — not a system fault.
 */
export const DEVICE_CONNECTION_DEFAULT_RECOVERY_POLICY =
  (process.env.DEVICE_CONNECTION_RECOVERY_POLICY as
    | 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT'
    | 'UNPLUG_WEBHOOK_ONLY'
    | 'NONE'
    | undefined) ?? 'UNPLUG_WEBHOOK_PLUG_SNAPSHOT';
