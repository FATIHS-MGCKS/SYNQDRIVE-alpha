import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

/**
 * ADAC integration client — structural shell only.
 * The ADAC partnership/API scope is not yet confirmed. This service provides
 * the integration surface so that real API calls can be wired in later.
 */

export interface AdacAssistanceRequest {
  vehiclePlate: string;
  vehicleVin?: string;
  locationLat: number;
  locationLng: number;
  issueDescription: string;
  contactName: string;
  contactPhone: string;
}

export interface AdacAssistanceResponse {
  externalReference: string;
  status: 'submitted' | 'assigned' | 'en_route' | 'resolved';
  estimatedArrivalMinutes?: number;
}

@Injectable()
export class AdacService {
  private readonly logger = new Logger(AdacService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(orgId: string): Promise<boolean> {
    const assignment = await this.prisma.tenantServicePartnerAssignment.findFirst({
      where: {
        organizationId: orgId,
        partner: { provider: 'ADAC' },
        status: 'ACTIVE',
      },
    });
    return !!assignment;
  }

  async requestAssistance(
    _orgId: string,
    _request: AdacAssistanceRequest,
  ): Promise<AdacAssistanceResponse> {
    this.logger.warn('ADAC assistance API not yet connected — shell only');
    return {
      externalReference: `ADAC-SHELL-${Date.now()}`,
      status: 'submitted',
    };
  }

  async getAssistanceStatus(
    _orgId: string,
    _externalRef: string,
  ): Promise<{ status: string } | null> {
    this.logger.debug('ADAC status check: API not connected');
    return null;
  }
}
