import { Injectable } from '@nestjs/common';
import { VoiceControlPlaneProvider } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ElevenLabsInvalidConfigurationError,
  ElevenLabsTenantIsolationViolationError,
} from './elevenlabs-provider.errors';
import { maskExternalId } from './elevenlabs-provider.redaction';
import type { TenantAgentRef, TenantPhoneRef } from './elevenlabs-provider.types';

@Injectable()
export class ElevenLabsProviderTenantResolver {
  constructor(private readonly prisma: PrismaService) {}

  async assertDeploymentInOrg(organizationId: string, deploymentId: string): Promise<void> {
    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: {
        id: deploymentId,
        organizationId,
        archivedAt: null,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
      },
      select: { id: true },
    });

    if (!deployment) {
      throw new ElevenLabsTenantIsolationViolationError(
        'Voice agent deployment not found for organization.',
      );
    }
  }

  async resolveAgentRef(
    organizationId: string,
    deploymentId: string,
  ): Promise<TenantAgentRef> {
    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: {
        id: deploymentId,
        organizationId,
        archivedAt: null,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
      },
      include: {
        voiceAssistant: {
          select: {
            elevenLabsAgentId: true,
          },
        },
      },
    });

    if (!deployment) {
      throw new ElevenLabsTenantIsolationViolationError(
        'Voice agent deployment not found for organization.',
      );
    }

    const externalAgentId =
      deployment.protectedExternalRef?.trim() ||
      deployment.voiceAssistant.elevenLabsAgentId?.trim() ||
      null;

    if (!externalAgentId) {
      throw new ElevenLabsInvalidConfigurationError(
        'ElevenLabs agent external reference is missing for deployment.',
      );
    }

    return {
      organizationId,
      deploymentId: deployment.id,
      externalAgentId,
      maskedExternalRef:
        deployment.maskedExternalRef ?? maskExternalId(externalAgentId, 'agent'),
    };
  }

  async assertPhoneInOrg(organizationId: string, phoneNumberId: string): Promise<void> {
    const phone = await this.prisma.voicePhoneNumber.findFirst({
      where: {
        id: phoneNumberId,
        organizationId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!phone) {
      throw new ElevenLabsTenantIsolationViolationError(
        'Voice phone number not found for organization.',
      );
    }
  }

  async resolvePhoneRef(
    organizationId: string,
    phoneNumberId: string,
  ): Promise<TenantPhoneRef> {
    const phone = await this.prisma.voicePhoneNumber.findFirst({
      where: {
        id: phoneNumberId,
        organizationId,
        archivedAt: null,
      },
      include: {
        voiceAssistant: {
          select: {
            elevenLabsPhoneNumberId: true,
          },
        },
      },
    });

    if (!phone) {
      throw new ElevenLabsTenantIsolationViolationError(
        'Voice phone number not found for organization.',
      );
    }

    const externalPhoneId =
      phone.protectedExternalRef?.trim() ||
      phone.voiceAssistant?.elevenLabsPhoneNumberId?.trim() ||
      null;

    if (!externalPhoneId) {
      throw new ElevenLabsInvalidConfigurationError(
        'ElevenLabs phone number external reference is missing.',
      );
    }

    return {
      organizationId,
      phoneNumberId: phone.id,
      externalPhoneId,
      maskedExternalRef: maskExternalId(externalPhoneId, 'phone'),
      maskedPhoneNumber: phone.maskedPhoneNumber,
    };
  }

  async listOrganizationPhoneExternalIds(organizationId: string): Promise<Set<string>> {
    const rows = await this.prisma.voicePhoneNumber.findMany({
      where: { organizationId, archivedAt: null },
      include: {
        voiceAssistant: {
          select: { elevenLabsPhoneNumberId: true },
        },
      },
    });

    const refs = new Set<string>();
    for (const row of rows) {
      const external =
        row.protectedExternalRef?.trim() ||
        row.voiceAssistant?.elevenLabsPhoneNumberId?.trim();
      if (external) {
        refs.add(external);
      }
    }
    return refs;
  }
}
