import { Injectable, Logger } from '@nestjs/common';
import { DimoRechargeSegmentsClient } from '@modules/dimo/recharge-segments/dimo-recharge-segments.client';
import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { HvChargeSessionPersistService } from './hv-charge-session-persist.service';
import type { HvChargeSessionPersistResult } from './hv-charge-session.types';

const DEFAULT_LOOKBACK_DAYS = 31;

export interface HvChargeSessionIngestResult {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  results: HvChargeSessionPersistResult[];
}

@Injectable()
export class HvChargeSessionIngestService {
  private readonly logger = new Logger(HvChargeSessionIngestService.name);

  constructor(
    private readonly rechargeClient: DimoRechargeSegmentsClient,
    private readonly persist: HvChargeSessionPersistService,
  ) {}

  async ingestForVehicle(input: {
    organizationId: string;
    vehicleId: string;
    from?: Date;
    to?: Date;
    correlationId?: string | null;
  }): Promise<HvChargeSessionIngestResult | null> {
    const to = input.to ?? new Date();
    const from =
      input.from ??
      new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const fetchResult = await this.rechargeClient.fetchForVehicle(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      from,
      to,
    );

    if (!fetchResult) {
      return null;
    }

    return this.persistSegments({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segments: fetchResult.segments,
      correlationId: input.correlationId,
    });
  }

  async ingestSegmentByFingerprint(input: {
    organizationId: string;
    vehicleId: string;
    segmentFingerprint: string;
    correlationId?: string | null;
  }): Promise<HvChargeSessionPersistResult | null> {
    const to = new Date();
    const from = new Date(to.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const fetchResult = await this.rechargeClient.fetchForVehicle(
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      from,
      to,
    );

    if (!fetchResult) return null;

    const segment = fetchResult.segments.find(
      (row) => row.fingerprint === input.segmentFingerprint,
    );
    if (!segment) {
      this.logger.warn(
        `Recharge segment not found for ingest vehicle=${input.vehicleId} fingerprint=${input.segmentFingerprint}`,
      );
      return null;
    }

    return this.persist.persistRechargeSegment({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      segment,
      correlationId: input.correlationId,
    });
  }

  async persistSegments(input: {
    organizationId: string;
    vehicleId: string;
    segments: NormalizedDimoRechargeSegment[];
    correlationId?: string | null;
  }): Promise<HvChargeSessionIngestResult> {
    const results: HvChargeSessionPersistResult[] = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const segment of input.segments) {
      const result = await this.persist.persistRechargeSegment({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        segment,
        correlationId: input.correlationId,
      });
      results.push(result);
      if (result.created) created += 1;
      else if (result.changed) updated += 1;
      else unchanged += 1;
    }

    return {
      fetched: input.segments.length,
      created,
      updated,
      unchanged,
      results,
    };
  }
}
