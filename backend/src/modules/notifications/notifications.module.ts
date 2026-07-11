import { Module } from '@nestjs/common';

/**
 * Notification domain module (contract layer only — Prompt 5).
 * No persistence, no dashboard API cutover, no delivery dispatch yet.
 */
@Module({
  providers: [],
  exports: [],
})
export class NotificationsModule {}
