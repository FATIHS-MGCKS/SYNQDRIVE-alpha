import type { AiEvidenceSensitivity } from '../evidence/ai-evidence.enums';
import { AI_GET_VEHICLE_LOCATION_TOOL } from '../tools/get-vehicle-location/ai-get-vehicle-location.types';
import { AI_GET_VEHICLE_TELEMETRY_STATUS_TOOL } from '../tools/get-vehicle-telemetry-status/ai-get-vehicle-telemetry-status.types';
import { AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL } from '../tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.types';
import { AI_EXPLAIN_OVERDUE_RETURN_TOOL } from '../tools/explain-overdue-return/ai-explain-overdue-return.types';
import { AI_GET_VEHICLE_BOOKING_CONTEXT_TOOL } from '../tools/get-vehicle-booking-context/ai-get-vehicle-booking-context.types';
import type { AiDomainToolDefinition, AiDomainToolName } from './ai-domain-tool-registry.types';

const VEHICLE_ID_FIELD = {
  name: 'vehicleId',
  type: 'string' as const,
  required: true,
  format: 'uuid' as const,
  description: 'Internal vehicle id (UUID) within tenant scope.',
};

const VEHICLE_OUTPUT_FIELDS = [
  {
    name: 'vehicleId',
    type: 'string' as const,
    required: true,
    description: 'Resolved vehicle id.',
  },
  {
    name: 'displayName',
    type: 'string' as const,
    required: true,
    description: 'Human-readable vehicle label.',
  },
  {
    name: 'licensePlate',
    type: 'string' as const,
    required: false,
    description: 'License plate when available.',
  },
];

function def(
  partial: Omit<AiDomainToolDefinition, 'version'> & { version?: string },
): AiDomainToolDefinition {
  return {
    version: '1.0.0',
    ...partial,
  };
}

export const AI_DOMAIN_TOOL_DEFINITIONS: readonly AiDomainToolDefinition[] = [
  def({
    name: AI_GET_VEHICLE_LOCATION_TOOL,
    description:
      'Returns the current or last-known GPS location for a vehicle with telemetry freshness semantics.',
    descriptionDe:
      'Liefert die aktuelle oder letzte bekannte GPS-Position eines Fahrzeugs mit Telemetrie-Frische-Semantik.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      fields: [VEHICLE_ID_FIELD],
    },
    outputSchema: {
      type: 'object',
      description: 'Coordinates, freshness, speed, ignition, and grounded availability flags.',
      fields: [
        ...VEHICLE_OUTPUT_FIELDS,
        {
          name: 'latitude',
          type: 'string',
          required: false,
          description: 'WGS84 latitude when authorized.',
        },
        {
          name: 'longitude',
          type: 'string',
          required: false,
          description: 'WGS84 longitude when authorized.',
        },
        {
          name: 'freshness',
          type: 'string',
          required: true,
          description: 'Telemetry freshness bucket.',
        },
        {
          name: 'isLastKnownLocation',
          type: 'boolean',
          required: true,
          description: 'True when snapshot is not live.',
        },
      ],
    },
    allowedRoles: ['MASTER_ADMIN', 'ORG_ADMIN', 'SUB_ADMIN', 'WORKER', 'DRIVER'],
    requiredPermissions: [
      {
        module: 'ai-assistant',
        action: 'read',
        description: 'Fleet AI assistant read access.',
      },
      {
        module: 'fleet',
        action: 'read',
        description: 'Fleet vehicle read access.',
      },
    ],
    dataClassification: 'pii' satisfies AiEvidenceSensitivity,
    timeoutMs: 12_000,
    retryBehavior: 'retryable',
    auditLevel: 'elevated',
    allowedChannels: ['fleet_chat', 'voice', 'whatsapp', 'api', 'internal'],
    cacheRule: {
      policy: 'no_cache',
      ttlMs: null,
      scope: 'none',
      description: 'Live GPS must not be cached across requests.',
    },
    personalData: 'location_coordinates',
    maxInvocationsPerRequest: 3,
    requiresSensitiveDataPermission: true,
  }),
  def({
    name: AI_GET_VEHICLE_TELEMETRY_STATUS_TOOL,
    description:
      'Returns structured telemetry connectivity status, signal-group coverage, and machine-readable explanations.',
    descriptionDe:
      'Liefert strukturierten Telemetrie-Verbindungsstatus, Signalgruppen-Abdeckung und maschinenlesbare Erklärungen.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      fields: [VEHICLE_ID_FIELD],
    },
    outputSchema: {
      type: 'object',
      description: 'Telemetry state, connectivity, signal groups, and explanation block.',
      fields: [
        ...VEHICLE_OUTPUT_FIELDS,
        {
          name: 'telemetryState',
          type: 'string',
          required: true,
          description: 'Canonical telemetry semantics.',
        },
        {
          name: 'explanation',
          type: 'object',
          required: true,
          description: 'Structured explanation for grounded answers.',
        },
      ],
    },
    allowedRoles: ['MASTER_ADMIN', 'ORG_ADMIN', 'SUB_ADMIN', 'WORKER', 'DRIVER'],
    requiredPermissions: [
      {
        module: 'ai-assistant',
        action: 'read',
        description: 'Fleet AI assistant read access.',
      },
      {
        module: 'fleet',
        action: 'read',
        description: 'Fleet vehicle read access.',
      },
    ],
    dataClassification: 'internal',
    timeoutMs: 10_000,
    retryBehavior: 'retryable',
    auditLevel: 'standard',
    allowedChannels: ['fleet_chat', 'voice', 'whatsapp', 'api', 'internal'],
    cacheRule: {
      policy: 'request_short_ttl',
      ttlMs: 5_000,
      scope: 'vehicle',
      description: 'Short TTL within a single request for repeated telemetry reads.',
    },
    personalData: 'none',
    maxInvocationsPerRequest: 5,
    requiresSensitiveDataPermission: false,
  }),
  def({
    name: AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL,
    description:
      'Aggregates vehicle health domains (battery, tires, brakes, DTCs, service, damages, tasks) from domain SoT services.',
    descriptionDe:
      'Aggregiert Fahrzeug-Gesundheitsdomänen (Batterie, Reifen, Bremsen, DTCs, Service, Schäden, Aufgaben) aus kanonischen Domain-Services.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      fields: [VEHICLE_ID_FIELD],
    },
    outputSchema: {
      type: 'object',
      description: 'Per-domain health slices and overall summary facts.',
      fields: [
        ...VEHICLE_OUTPUT_FIELDS,
        {
          name: 'domains',
          type: 'object',
          required: true,
          description: 'Structured health domain slices.',
        },
        {
          name: 'overallStatus',
          type: 'string',
          required: true,
          description: 'Aggregated health status.',
        },
      ],
    },
    allowedRoles: ['MASTER_ADMIN', 'ORG_ADMIN', 'SUB_ADMIN', 'WORKER'],
    requiredPermissions: [
      {
        module: 'ai-assistant',
        action: 'read',
        description: 'Fleet AI assistant read access.',
      },
      {
        module: 'fleet-condition',
        action: 'read',
        description: 'Fleet condition / health read access.',
      },
      {
        module: 'fleet',
        action: 'read',
        description: 'Fleet vehicle read access.',
      },
    ],
    dataClassification: 'internal',
    timeoutMs: 15_000,
    retryBehavior: 'retryable',
    auditLevel: 'elevated',
    allowedChannels: ['fleet_chat', 'voice', 'api', 'internal'],
    cacheRule: {
      policy: 'request_short_ttl',
      ttlMs: 10_000,
      scope: 'vehicle',
      description: 'Health aggregates may be reused briefly within one request.',
    },
    personalData: 'none',
    maxInvocationsPerRequest: 2,
    requiresSensitiveDataPermission: false,
  }),
  def({
    name: AI_EXPLAIN_OVERDUE_RETURN_TOOL,
    description:
      'Deterministic explanation why a vehicle shows overdue return — mirrors booking lifecycle SoT.',
    descriptionDe:
      'Deterministische Erklärung für überfällige Rückgabe — spiegelt Booking-Lifecycle-SoT wider.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      fields: [
        VEHICLE_ID_FIELD,
        {
          name: 'bookingId',
          type: 'string',
          required: false,
          format: 'uuid',
          description: 'Optional booking id; defaults to current ACTIVE booking.',
        },
      ],
    },
    outputSchema: {
      type: 'object',
      description: 'Overdue return reason codes, deadlines, handover/return status, optional location ref.',
      fields: [
        ...VEHICLE_OUTPUT_FIELDS,
        {
          name: 'reasonCodes',
          type: 'string',
          required: true,
          description: 'Machine-readable overdue cause codes.',
        },
        {
          name: 'explanation',
          type: 'string',
          required: true,
          description: 'Grounded German explanation text.',
        },
        {
          name: 'latestKnownLocation',
          type: 'object',
          required: false,
          description: 'Optional GPS ref when location access permits.',
        },
      ],
    },
    allowedRoles: ['MASTER_ADMIN', 'ORG_ADMIN', 'SUB_ADMIN', 'WORKER'],
    requiredPermissions: [
      {
        module: 'ai-assistant',
        action: 'read',
        description: 'Fleet AI assistant read access.',
      },
      {
        module: 'bookings',
        action: 'read',
        description: 'Booking read access.',
      },
      {
        module: 'fleet',
        action: 'read',
        description: 'Fleet vehicle read access.',
      },
    ],
    dataClassification: 'internal',
    timeoutMs: 12_000,
    retryBehavior: 'non_retryable',
    auditLevel: 'elevated',
    allowedChannels: ['fleet_chat', 'voice', 'api', 'internal'],
    cacheRule: {
      policy: 'no_cache',
      ttlMs: null,
      scope: 'none',
      description: 'Overdue state must reflect live booking lifecycle.',
    },
    personalData: 'conditional_customer',
    maxInvocationsPerRequest: 2,
    requiresSensitiveDataPermission: false,
  }),
  def({
    name: AI_GET_VEHICLE_BOOKING_CONTEXT_TOOL,
    description:
      'Structured operational booking and return context for a vehicle (active, upcoming, none).',
    descriptionDe:
      'Strukturierter operativer Buchungs- und Rückgabe-Kontext (aktiv, kommend, keine).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      fields: [VEHICLE_ID_FIELD],
    },
    outputSchema: {
      type: 'object',
      description: 'Context kind, booking snapshots, process steps, deadlines, inconsistency flags.',
      fields: [
        ...VEHICLE_OUTPUT_FIELDS,
        {
          name: 'contextKind',
          type: 'string',
          required: true,
          description: 'active | upcoming | reserved | none.',
        },
        {
          name: 'openProcessSteps',
          type: 'string',
          required: true,
          description: 'Open handover/return/extension steps.',
        },
        {
          name: 'customerDisplayName',
          type: 'string',
          required: false,
          description: 'Included only when customers.read permits.',
        },
      ],
    },
    allowedRoles: ['MASTER_ADMIN', 'ORG_ADMIN', 'SUB_ADMIN', 'WORKER'],
    requiredPermissions: [
      {
        module: 'ai-assistant',
        action: 'read',
        description: 'Fleet AI assistant read access.',
      },
      {
        module: 'bookings',
        action: 'read',
        description: 'Booking read access.',
      },
      {
        module: 'fleet',
        action: 'read',
        description: 'Fleet vehicle read access.',
      },
    ],
    dataClassification: 'pii',
    timeoutMs: 12_000,
    retryBehavior: 'retryable',
    auditLevel: 'elevated',
    allowedChannels: ['fleet_chat', 'voice', 'api', 'internal'],
    cacheRule: {
      policy: 'no_cache',
      ttlMs: null,
      scope: 'none',
      description: 'Booking state must not be cached across requests.',
    },
    personalData: 'conditional_customer',
    maxInvocationsPerRequest: 3,
    requiresSensitiveDataPermission: true,
  }),
];

export const AI_DOMAIN_TOOL_DEFINITION_BY_NAME: Readonly<
  Record<AiDomainToolName, AiDomainToolDefinition>
> = Object.freeze(
  AI_DOMAIN_TOOL_DEFINITIONS.reduce(
    (acc, definition) => {
      acc[definition.name] = definition;
      return acc;
    },
    {} as Record<AiDomainToolName, AiDomainToolDefinition>,
  ),
);

export function isAiDomainToolName(value: string): value is AiDomainToolName {
  return (AI_DOMAIN_TOOL_DEFINITION_BY_NAME as Record<string, AiDomainToolDefinition>)[
    value
  ] != null;
}
