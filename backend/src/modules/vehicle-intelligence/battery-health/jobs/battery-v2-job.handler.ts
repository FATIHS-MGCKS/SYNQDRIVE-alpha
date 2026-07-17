import type { BatteryV2JobPayload, BatteryV2JobType } from './battery-v2-job.types';

/** Contract for Battery V2 job consumers — one implementation per job type. */
export interface BatteryV2JobHandler<T extends BatteryV2JobType = BatteryV2JobType> {
  readonly jobType: T;
  handle(payload: BatteryV2JobPayload<T>): Promise<void>;
}

export const BATTERY_V2_JOB_HANDLER = Symbol('BATTERY_V2_JOB_HANDLER');
