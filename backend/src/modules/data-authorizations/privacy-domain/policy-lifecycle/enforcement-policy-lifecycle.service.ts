import { Injectable } from '@nestjs/common';
import {
  Prisma,
  PrivacyPolicyLifecycleEventType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PolicyLifecycleEventsService } from './policy-lifecycle-events.service';
import { PolicyNotFoundException } from './policy-lifecycle.exceptions';
import {
  PolicyActivationInput,
  PolicyLifecycleService,
  PolicyTransitionInput,
} from './policy-lifecycle.service';

type EnforcementPolicyRecord = Prisma.EnforcementPolicyGetPayload<{
  include: {
    vehicles: true;
    customers: true;
    bookings: true;
    stations: true;
  };
}>;

const SCOPE_INCLUDE = {
  vehicles: true,
  customers: true,
  bookings: true,
  stations: true,
} as const;

@Injectable()
export class EnforcementPolicyLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: PolicyLifecycleService,
    private readonly events: PolicyLifecycleEventsService,
  ) {}

  async submitForReview(orgId: string, id: string, actorUserId: string): Promise<EnforcementPolicyRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.IN_REVIEW,
      input: { actorUserId },
      loadCurrent: (tx, policyId) =>
        tx.enforcementPolicy.findFirst({
          where: { id: policyId, organizationId: orgId },
          include: SCOPE_INCLUDE,
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.enforcementPolicy.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: SCOPE_INCLUDE,
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordEnforcementPolicyEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
        }),
    });
  }

  async approve(orgId: string, id: string, approverUserId: string): Promise<EnforcementPolicyRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.APPROVED,
      input: { actorUserId: approverUserId },
      loadCurrent: (tx, policyId) =>
        tx.enforcementPolicy.findFirst({
          where: { id: policyId, organizationId: orgId },
          include: SCOPE_INCLUDE,
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.enforcementPolicy.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: SCOPE_INCLUDE,
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordEnforcementPolicyEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
        }),
    });
  }

  async schedule(orgId: string, id: string, validFrom: Date, input: PolicyTransitionInput = {}): Promise<EnforcementPolicyRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.SCHEDULED,
      input: { ...input, validFrom },
      loadCurrent: (tx, policyId) =>
        tx.enforcementPolicy.findFirst({
          where: { id: policyId, organizationId: orgId },
          include: SCOPE_INCLUDE,
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.enforcementPolicy.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: SCOPE_INCLUDE,
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordEnforcementPolicyEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          validFrom: event.input?.validFrom,
        }),
    });
  }

  async activate(orgId: string, id: string, input: PolicyActivationInput = {}): Promise<EnforcementPolicyRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.activateVersion({
      entityKind: 'ENFORCEMENT_POLICY',
      orgId,
      record,
      input,
      loadCurrent: (tx, policyId) =>
        tx.enforcementPolicy.findFirst({
          where: { id: policyId, organizationId: orgId },
          include: SCOPE_INCLUDE,
        }),
      findActivePeers: (tx, current) =>
        tx.enforcementPolicy.findMany({
          where: {
            organizationId: orgId,
            policyFamilyId: current.policyFamilyId,
            status: PrivacyPolicyLifecycleStatus.ACTIVE,
          },
          include: SCOPE_INCLUDE,
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.enforcementPolicy.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: SCOPE_INCLUDE,
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordEnforcementPolicyEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorUserId: event.input?.actorUserId,
          reason: event.input?.reason,
          supersededById: event.input?.supersededById,
          validFrom: event.input?.validFrom,
        }),
    });
  }

  async suspend(orgId: string, id: string, reason: string, input: PolicyTransitionInput = {}): Promise<EnforcementPolicyRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.SUSPENDED,
      input: { ...input, reason },
      loadCurrent: (tx, policyId) =>
        tx.enforcementPolicy.findFirst({
          where: { id: policyId, organizationId: orgId },
          include: SCOPE_INCLUDE,
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.enforcementPolicy.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch },
          include: SCOPE_INCLUDE,
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordEnforcementPolicyEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          reason: event.input?.reason,
        }),
    });
  }

  async revoke(orgId: string, id: string, reason: string, input: PolicyTransitionInput = {}): Promise<EnforcementPolicyRecord> {
    const record = await this.findOrThrow(orgId, id);
    return this.lifecycle.transitionVersion({
      orgId,
      record,
      toStatus: PrivacyPolicyLifecycleStatus.REVOKED,
      input: { ...input, reason },
      loadCurrent: (tx, policyId) =>
        tx.enforcementPolicy.findFirst({
          where: { id: policyId, organizationId: orgId },
          include: SCOPE_INCLUDE,
        }),
      applyTransition: (tx, current, toStatus, patch) =>
        tx.enforcementPolicy.update({
          where: { id: current.id },
          data: { status: toStatus, ...patch, isCurrentVersion: false },
          include: SCOPE_INCLUDE,
        }),
      recordEvent: (tx, current, event) =>
        this.events.recordEnforcementPolicyEvent(tx, current.id, {
          organizationId: orgId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          reason: event.input?.reason,
        }),
    });
  }

  async findOrThrow(orgId: string, id: string): Promise<EnforcementPolicyRecord> {
    const row = await this.prisma.enforcementPolicy.findFirst({
      where: { id, organizationId: orgId },
      include: SCOPE_INCLUDE,
    });
    if (!row) {
      throw new PolicyNotFoundException('EnforcementPolicy');
    }
    return row;
  }
}
