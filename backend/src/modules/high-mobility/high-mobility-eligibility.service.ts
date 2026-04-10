import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { HighMobilityAuthService } from './high-mobility-auth.service';
import type {
  CheckEligibilityDto,
  EligibilityResultDto,
  HmEligibilityStatus,
  HmDeliveryMode,
} from './dto/high-mobility.dto';

/**
 * HM Eligibility API spec (from docs.high-mobility.com):
 *   POST /v1/eligibility
 *   Body: { vin: string, brand: "bmw" | "mercedes-benz" | ... }  (brand = lowercase HM enum)
 *   Response: {
 *     vin, eligible: boolean,
 *     data_delivery: ("pull" | "push")[],
 *     connectivity_status: "activated" | "deactivated" | "unknown",
 *     primary_user_assigned: boolean
 *   }
 */
@Injectable()
export class HighMobilityEligibilityService {
  private readonly logger = new Logger(HighMobilityEligibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: HighMobilityAuthService,
    private readonly configService: ConfigService,
  ) {}

  private get baseUrl(): string {
    return (this.configService.get('highMobility') as any).apiBaseUrl;
  }
  private get timeout(): number {
    return (this.configService.get('highMobility') as any).requestTimeoutMs ?? 15000;
  }

  async checkEligibility(dto: CheckEligibilityDto): Promise<EligibilityResultDto> {
    const { vin, brand } = dto;
    const now = new Date();

    if (!this.authService.isConfigured()) {
      this.logger.warn(`HM not configured — returning stub for VIN ${vin}`);
      return this.stubResult(vin, brand, now, 'HM credentials not configured');
    }

    const headers = await this.authService.authHeaders();
    if (!headers) {
      return this.stubResult(vin, brand, now, 'Failed to obtain HM access token', 'ERROR');
    }

    const hmBrand = this.normalizeToHmBrand(brand);
    let raw: Record<string, unknown> | null = null;
    let eligibilityStatus: HmEligibilityStatus = 'UNKNOWN';
    let deliveryMode: HmDeliveryMode | null = null;
    let capabilities: Record<string, unknown> | null = null;

    try {
      const res = await axios.post(
        `${this.baseUrl}/eligibility`,
        { vin, brand: hmBrand },
        { headers, timeout: this.timeout },
      );

      raw = res.data as Record<string, unknown>;
      this.logger.log(`HM eligibility result for ${vin}: eligible=${raw?.eligible}, delivery=${JSON.stringify(raw?.data_delivery)}`);

      // HM returns: { eligible: boolean, data_delivery: ["pull","push"], connectivity_status: "...", primary_user_assigned: bool }
      eligibilityStatus = (raw?.eligible === true) ? 'ELIGIBLE' : 'INELIGIBLE';
      deliveryMode = this.normalizeDeliveryMode(raw);
      capabilities = {
        connectivity_status: raw?.connectivity_status ?? null,
        primary_user_assigned: raw?.primary_user_assigned ?? null,
        data_delivery: raw?.data_delivery ?? null,
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const body = err?.response?.data as Record<string, any> | undefined;
      raw = { error: err?.message, status, responseBody: body };

      if (status === 422 && body) {
        // Parse HM-specific 422 error types
        const errors: Array<{ source?: string; title?: string }> = body?.errors ?? [];
        const vinError = errors.find(e => e.source === 'vin');
        const brandError = errors.find(e => e.source === 'brand');

        if (vinError) {
          // "vin is unknown" = vehicle not found in HM → INELIGIBLE (not an error)
          this.logger.log(`HM eligibility: VIN ${vin} unknown in provider — INELIGIBLE`);
          eligibilityStatus = 'INELIGIBLE';
          raw = { ...raw, reason: 'vin_unknown', errors };
        } else if (brandError) {
          // "brand not enabled for application" = config issue
          this.logger.warn(`HM eligibility: brand "${hmBrand}" not enabled for this HM app — ERROR`);
          eligibilityStatus = 'ERROR';
          raw = { ...raw, reason: 'brand_not_enabled', errors };
        } else {
          this.logger.error(`HM eligibility 422 for ${vin}: ${JSON.stringify(body)}`);
          eligibilityStatus = 'ERROR';
        }
      } else {
        this.logger.error(`HM eligibility failed for ${vin} [${status}]: ${err?.message}`);
        eligibilityStatus = 'ERROR';
      }
    }

    await this.persistEligibilityResult(vin, eligibilityStatus, deliveryMode, raw, now);

    return {
      vin,
      brand,
      eligibilityStatus,
      deliveryMode,
      capabilities,
      checkedAt: now.toISOString(),
      rawResponse: raw,
    };
  }

  async getLastEligibility(vin: string): Promise<EligibilityResultDto | null> {
    const record = await this.prisma.highMobilityVehicle.findFirst({
      where: { vin, isActive: true },
      orderBy: { eligibilityCheckedAt: 'desc' },
    });
    if (!record || !record.eligibilityCheckedAt) return null;

    return {
      vin: record.vin,
      brand: record.brand,
      eligibilityStatus: record.eligibilityStatus as HmEligibilityStatus,
      deliveryMode: (record.eligibilityDeliveryMode as HmDeliveryMode) ?? null,
      capabilities: (record.providerPayloadJson as any)?.eligibility?.capabilities ?? null,
      checkedAt: record.eligibilityCheckedAt.toISOString(),
      rawResponse: (record.providerPayloadJson as any)?.eligibility ?? null,
    };
  }

  // ── Brand normalization ────────────────────────────────────────────────────

  /**
   * Convert display brand names to HM API enum values (lowercase).
   * HM supported brands: bmw, citroen, ds, mercedes-benz, mini, opel, peugeot,
   * vauxhall, jeep, fiat, alfaromeo, ford, renault, dacia, toyota, lexus, porsche,
   * maserati, kia, tesla, volvo-cars, skoda, audi, volkswagen, seat, cupra, polestar, nissan, sandbox
   */
  normalizeToHmBrand(brand: string): string {
    const b = brand.toLowerCase().trim();
    const MAP: Record<string, string> = {
      'bmw': 'bmw',
      'mercedes-benz': 'mercedes-benz',
      'mercedes': 'mercedes-benz',
      'mini': 'mini',
      'audi': 'audi',
      'volkswagen': 'volkswagen',
      'vw': 'volkswagen',
      'porsche': 'porsche',
      'skoda': 'skoda',
      'seat': 'seat',
      'cupra': 'cupra',
      'opel': 'opel',
      'vauxhall': 'vauxhall',
      'peugeot': 'peugeot',
      'citroen': 'citroen',
      'citroën': 'citroen',
      'ds': 'ds',
      'fiat': 'fiat',
      'alfa romeo': 'alfaromeo',
      'alfaromeo': 'alfaromeo',
      'jeep': 'jeep',
      'ford': 'ford',
      'renault': 'renault',
      'dacia': 'dacia',
      'toyota': 'toyota',
      'lexus': 'lexus',
      'tesla': 'tesla',
      'volvo': 'volvo-cars',
      'volvo-cars': 'volvo-cars',
      'kia': 'kia',
      'maserati': 'maserati',
      'nissan': 'nissan',
      'polestar': 'polestar',
      'sandbox': 'sandbox',
    };
    return MAP[b] ?? b;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private normalizeDeliveryMode(raw: Record<string, unknown> | null): HmDeliveryMode | null {
    if (!raw) return null;
    const deliveries = raw?.data_delivery as string[] | undefined;
    if (!deliveries || deliveries.length === 0) return null;
    const hasPull = deliveries.includes('pull');
    const hasPush = deliveries.includes('push');
    if (hasPull && hasPush) return 'BOTH';
    if (hasPull) return 'PULL';
    if (hasPush) return 'PUSH';
    return null;
  }

  private stubResult(
    vin: string, brand: string, now: Date, reason: string,
    status: HmEligibilityStatus = 'UNKNOWN',
  ): EligibilityResultDto {
    return {
      vin, brand,
      eligibilityStatus: status,
      deliveryMode: null,
      capabilities: null,
      checkedAt: now.toISOString(),
      rawResponse: { stub: true, reason },
    };
  }

  private async persistEligibilityResult(
    vin: string,
    eligibilityStatus: HmEligibilityStatus,
    deliveryMode: HmDeliveryMode | null,
    raw: Record<string, unknown> | null,
    checkedAt: Date,
  ): Promise<void> {
    try {
      const records = await this.prisma.highMobilityVehicle.findMany({ where: { vin, isActive: true } });
      for (const record of records) {
        const existing = (record.providerPayloadJson as Record<string, unknown>) ?? {};
        await this.prisma.highMobilityVehicle.update({
          where: { id: record.id },
          data: {
            eligibilityStatus: eligibilityStatus as any,
            eligibilityDeliveryMode: deliveryMode as any,
            eligibilityCheckedAt: checkedAt,
            providerPayloadJson: { ...existing, eligibility: raw } as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to persist eligibility for ${vin}: ${err?.message}`);
    }
  }
}
