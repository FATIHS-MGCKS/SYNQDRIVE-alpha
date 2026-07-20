import { describe, expect, it } from 'vitest';
import type { ApiServiceCase } from '../../../lib/api';
import {
  buildServiceCaseAuditTimeline,
  extractServiceCaseHealthFindings,
} from './fleet-health-service-case-detail';
import { resolveServiceCasePermissions } from './fleet-health-service-case-permissions';

function serviceCase(overrides: Partial<ApiServiceCase> = {}): ApiServiceCase {
  return {
    id: 'sc-1',
    organizationId: 'org-1',
    vehicleId: 'v1',
    vendorId: 'vendor-1',
    title: 'Bremsen prüfen',
    description: 'Health-Hinweis Bremsen',
    category: 'BRAKES',
    status: 'OPEN',
    priority: 'HIGH',
    source: 'HEALTH',
    openedAt: '2026-07-19T10:00:00.000Z',
    scheduledAt: '2026-07-21T09:00:00.000Z',
    expectedReadyAt: '2026-07-22T17:00:00.000Z',
    completedAt: null,
    cancelledAt: null,
    estimatedCostCents: 25000,
    actualCostCents: null,
    downtimeStart: null,
    downtimeEnd: null,
    blocksRental: true,
    completionNotes: null,
    documentId: null,
    metadata: {
      healthModule: 'brakes',
      healthState: 'warning',
      healthReason: 'Bremsbelag niedrig',
    },
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: '2026-07-19T10:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
    taskCount: 1,
    tasks: [
      {
        id: 't1',
        title: 'Bremsen prüfen',
        status: 'OPEN',
        type: 'BRAKE_CHECK',
        dueDate: null,
      },
    ],
    comments: [
      {
        id: 'c1',
        userId: 'u1',
        body: 'Partner informiert',
        createdAt: '2026-07-20T07:00:00.000Z',
      },
    ],
    attachments: [
      {
        id: 'a1',
        fileUrl: '/uploads/case.pdf',
        fileName: 'angebot.pdf',
        mimeType: 'application/pdf',
        size: 1000,
        uploadedByUserId: 'u1',
        createdAt: '2026-07-20T06:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('fleet-health-service-case-detail', () => {
  it('extracts stored health findings without recomputing health', () => {
    const findings = extractServiceCaseHealthFindings(serviceCase());
    expect(findings).toHaveLength(1);
    expect(findings[0]?.label).toBe('Bremsen');
    expect(findings[0]?.detail).toContain('warning');
    expect(findings[0]?.detail).toContain('Bremsbelag niedrig');
  });

  it('builds audit timeline from lifecycle, comments and attachments', () => {
    const timeline = buildServiceCaseAuditTimeline(serviceCase());
    expect(timeline.some((item) => item.title === 'Fall eröffnet')).toBe(true);
    expect(timeline.some((item) => item.title === 'Kommentar')).toBe(true);
    expect(timeline.some((item) => item.title.startsWith('Dokument hochgeladen'))).toBe(true);
  });

  it('labels task-link audit comments in timeline', () => {
    const timeline = buildServiceCaseAuditTimeline(
      serviceCase({
        comments: [
          {
            id: 'c-link',
            userId: 'u1',
            body: '[task-link] Aufgabe „Bremsen prüfen“ verknüpft (t1)',
            createdAt: '2026-07-20T09:00:00.000Z',
          },
        ],
      }),
    );
    expect(timeline.some((item) => item.title === 'Aufgabe verknüpft')).toBe(true);
  });
});

describe('fleet-health-service-case-permissions', () => {
  it('grants write actions only with vendor-management write/manage', () => {
    const readOnly = resolveServiceCasePermissions({
      membershipRole: 'WORKER',
      hasPermission: (module, level) => module === 'vendor-management' && level === 'read',
    });
    expect(readOnly.canRead).toBe(true);
    expect(readOnly.canUpdate).toBe(false);
    expect(readOnly.canComment).toBe(false);
    expect(readOnly.canComplete).toBe(false);
  });

  it('allows manage costs only with manage permission', () => {
    const writer = resolveServiceCasePermissions({
      membershipRole: 'WORKER',
      hasPermission: (module, level) =>
        module === 'vendor-management' && (level === 'read' || level === 'write'),
    });
    expect(writer.canUpdate).toBe(true);
    expect(writer.canManageCosts).toBe(false);
  });
});
