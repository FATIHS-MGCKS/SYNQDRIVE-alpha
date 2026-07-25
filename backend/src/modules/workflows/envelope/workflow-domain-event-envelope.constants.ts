/** Envelope wire-format schema version (distinct from per-event `eventVersion`). */
export const WORKFLOW_DOMAIN_EVENT_ENVELOPE_SCHEMA_VERSION = '1.0.0' as const;

/** Maximum serialized payload size (bytes) — keeps queue/DB rows bounded. */
export const WORKFLOW_EVENT_MAX_PAYLOAD_BYTES = 64 * 1024;

/** Maximum serialized metadata size (bytes). */
export const WORKFLOW_EVENT_MAX_METADATA_BYTES = 8 * 1024;

/** UTC timestamp format for wire serialization. */
export const WORKFLOW_EVENT_TIMESTAMP_FORMAT = 'iso-utc' as const;
