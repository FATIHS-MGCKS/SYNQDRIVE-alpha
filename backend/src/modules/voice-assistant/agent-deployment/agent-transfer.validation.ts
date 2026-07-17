import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '@shared/database/prisma.service';
import { digestCanonicalValue } from '@modules/twilio/provisioning/twilio-provisioning.masking';
import { isNativeTelephonyEnabled } from '../provisioning/elevenlabs-twilio-import.config';
import type {
  AgentTransferConfig,
  AgentTransferRule,
  AgentTransferTarget,
  CanonicalAgentConfig,
} from './agent-config.types';
import { isWithinBusinessHours } from './agent-business-hours.util';

export type ResolvedTransferTarget = {
  ruleId: string;
  destinationKey: string;
  maskedDestination: string;
  e164: string | null;
};

function normalizeE164(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`;
}

function maskDestination(value: string): string {
  if (value.length <= 6) return '***';
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

export async function resolveTransferTargetPhone(
  prisma: PrismaService,
  organizationId: string,
  target: AgentTransferTarget,
): Promise<string | null> {
  switch (target.type) {
    case 'PHONE':
      return normalizeE164(target.phoneE164);
    case 'STAFF_USER': {
      if (!target.userId?.trim()) return null;
      const membership = await prisma.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: target.userId,
          status: 'ACTIVE',
        },
        include: {
          user: { select: { phone: true, mobile: true } },
        },
      });
      if (!membership) return null;
      return normalizeE164(membership.user.mobile || membership.user.phone);
    }
    case 'STAFF_GROUP': {
      if (!target.organizationRoleId?.trim()) return null;
      const role = await prisma.organizationRole.findFirst({
        where: {
          id: target.organizationRoleId,
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!role) return null;
      const member = await prisma.organizationMembership.findFirst({
        where: {
          organizationId,
          organizationRoleId: role.id,
          status: 'ACTIVE',
        },
        include: {
          user: { select: { phone: true, mobile: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!member) return null;
      return normalizeE164(member.user.mobile || member.user.phone);
    }
    case 'STATION': {
      const stationId = target.stationId?.trim();
      if (!stationId) return null;
      const station = await prisma.station.findFirst({
        where: { id: stationId, organizationId, archivedAt: null },
        select: { phone: true },
      });
      return normalizeE164(station?.phone);
    }
    default:
      return null;
  }
}

export async function assertOrgBoundTransferTarget(
  prisma: PrismaService,
  organizationId: string,
  target: AgentTransferTarget,
): Promise<void> {
  switch (target.type) {
    case 'PHONE': {
      const e164 = normalizeE164(target.phoneE164);
      if (!e164) {
        throw new BadRequestException('Transfer phone target requires a valid E.164 number.');
      }
      const allowed = await isOrgBoundPhoneNumber(prisma, organizationId, e164);
      if (!allowed) {
        throw new BadRequestException('Transfer phone target is not bound to this organization.');
      }
      return;
    }
    case 'STAFF_USER': {
      const membership = await prisma.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: target.userId ?? '',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!membership) {
        throw new BadRequestException('Transfer staff user is not an active member of this organization.');
      }
      return;
    }
    case 'STAFF_GROUP': {
      const role = await prisma.organizationRole.findFirst({
        where: {
          id: target.organizationRoleId ?? '',
          organizationId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!role) {
        throw new BadRequestException('Transfer staff group is not valid for this organization.');
      }
      return;
    }
    case 'STATION': {
      const station = await prisma.station.findFirst({
        where: {
          id: target.stationId ?? '',
          organizationId,
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!station) {
        throw new BadRequestException('Transfer station is not valid for this organization.');
      }
      return;
    }
    default:
      throw new BadRequestException('Unsupported transfer target type.');
  }
}

async function isOrgBoundPhoneNumber(
  prisma: PrismaService,
  organizationId: string,
  e164: string,
): Promise<boolean> {
  const digest = digestCanonicalValue(e164);
  const assistant = await prisma.voiceAssistant.findUnique({
    where: { organizationId },
    select: { escalationPhone: true, phoneNumber: true },
  });
  if (
    normalizeE164(assistant?.escalationPhone) === e164 ||
    normalizeE164(assistant?.phoneNumber) === e164
  ) {
    return true;
  }

  const station = await prisma.station.findFirst({
    where: { organizationId, phone: e164, archivedAt: null },
    select: { id: true },
  });
  if (station) return true;

  const member = await prisma.organizationMembership.findFirst({
    where: {
      organizationId,
      status: 'ACTIVE',
      user: {
        OR: [{ phone: e164 }, { mobile: e164 }],
      },
    },
    select: { id: true },
  });
  if (member) return true;

  const controlPlanePhone = await prisma.voicePhoneNumber.findFirst({
    where: { organizationId, e164Digest: digest, archivedAt: null },
    select: { id: true },
  });
  return Boolean(controlPlanePhone);
}

export async function collectInboundLoopNumbers(
  prisma: PrismaService,
  organizationId: string,
): Promise<Set<string>> {
  const numbers = new Set<string>();
  const assistant = await prisma.voiceAssistant.findUnique({
    where: { organizationId },
    select: { phoneNumber: true },
  });
  const assistantPhone = normalizeE164(assistant?.phoneNumber);
  if (assistantPhone) numbers.add(assistantPhone);

  const phones = await prisma.voicePhoneNumber.findMany({
    where: { organizationId, archivedAt: null },
    select: { protectedE164: true, maskedPhoneNumber: true },
  });
  for (const phone of phones) {
    const normalized = normalizeE164(phone.protectedE164 || phone.maskedPhoneNumber);
    if (normalized) numbers.add(normalized);
  }
  return numbers;
}

export function assertTransferLoopProtection(params: {
  transfer: AgentTransferConfig | null | undefined;
  resolvedTargets: ResolvedTransferTarget[];
  inboundNumbers: Set<string>;
}): void {
  const transfer = params.transfer;
  if (!transfer?.rules?.length) {
    return;
  }

  const maxHops = transfer.maxTransferHops ?? 2;
  if (maxHops < 1 || maxHops > 5) {
    throw new BadRequestException('Transfer hop limit must be between 1 and 5.');
  }

  const destinationKeys = new Set<string>();
  for (const resolved of params.resolvedTargets) {
    if (destinationKeys.has(resolved.destinationKey)) {
      throw new BadRequestException('Duplicate transfer destinations are not allowed.');
    }
    destinationKeys.add(resolved.destinationKey);

    if (resolved.e164 && params.inboundNumbers.has(resolved.e164)) {
      throw new BadRequestException(
        'Transfer loop protection blocked forwarding to the assistant inbound number.',
      );
    }
  }
}

export async function validateTransferConfig(
  prisma: PrismaService,
  organizationId: string,
  config: CanonicalAgentConfig,
): Promise<ResolvedTransferTarget[]> {
  const transfer = config.transfer;
  if (!transfer?.rules?.length) {
    return [];
  }

  const enabledRules = transfer.rules.filter((rule) => rule.enabled !== false);
  const resolved: ResolvedTransferTarget[] = [];

  for (const rule of enabledRules) {
    await validateTransferRule(prisma, organizationId, config, rule);
    const e164 = await resolveTransferTargetPhone(prisma, organizationId, rule.target);
    const destinationKey = [
      rule.target.type,
      rule.target.phoneE164,
      rule.target.userId,
      rule.target.organizationRoleId,
      rule.target.stationId,
    ]
      .filter(Boolean)
      .join(':');

    resolved.push({
      ruleId: rule.ruleId,
      destinationKey,
      maskedDestination: e164 ? maskDestination(e164) : destinationKey,
      e164,
    });
  }

  if (transfer.loopProtectionEnabled !== false) {
    const inboundNumbers = await collectInboundLoopNumbers(prisma, organizationId);
    assertTransferLoopProtection({ transfer, resolvedTargets: resolved, inboundNumbers });
  }

  return resolved;
}

async function validateTransferRule(
  prisma: PrismaService,
  organizationId: string,
  config: CanonicalAgentConfig,
  rule: AgentTransferRule,
): Promise<void> {
  if (!rule.ruleId?.trim() || !rule.condition?.trim()) {
    throw new BadRequestException('Each transfer rule requires an id and condition.');
  }

  if (rule.maxWaitSeconds != null && (rule.maxWaitSeconds < 5 || rule.maxWaitSeconds > 600)) {
    throw new BadRequestException('Transfer max wait must be between 5 and 600 seconds.');
  }

  if (rule.transferType === 'blind' && !isNativeTelephonyEnabled()) {
    throw new BadRequestException(
      'Blind transfer requires native ElevenLabs Twilio telephony to be enabled.',
    );
  }

  if (rule.transferType === 'blind' && rule.warmTransferMessage?.trim()) {
    throw new BadRequestException('Warm transfer messages are not supported for blind transfers.');
  }

  if (rule.routingStationId?.trim()) {
    const station = await prisma.station.findFirst({
      where: {
        id: rule.routingStationId,
        organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!station) {
      throw new BadRequestException('Transfer routing station is not valid for this organization.');
    }
  }

  if (rule.respectBusinessHours && !isWithinBusinessHours(config.businessHours)) {
    // Validation-time check is informational only; runtime will evaluate per call.
  }

  await assertOrgBoundTransferTarget(prisma, organizationId, rule.target);

  if (rule.target.type !== 'PHONE') {
    const resolved = await resolveTransferTargetPhone(prisma, organizationId, rule.target);
    if (!resolved) {
      throw new BadRequestException(
        'Transfer target does not resolve to a callable number for this organization.',
      );
    }
  }
}

export function hasMandatoryEscalation(config: CanonicalAgentConfig): boolean {
  const fallback = config.fallback;
  return Boolean(
    fallback?.escalateOnRequest ||
      fallback?.escalateOnLowConfidence ||
      fallback?.escalateOnSensitive,
  );
}

export function hasResolvableTransferTarget(resolved: ResolvedTransferTarget[]): boolean {
  return resolved.some((row) => Boolean(row.e164));
}
