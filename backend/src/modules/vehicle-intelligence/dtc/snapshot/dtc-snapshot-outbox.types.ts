import type { VehicleHealthAdapterSource } from '@modules/notifications/adapters/notification-adapter.types';
import type { BrakeDtcProducerContext } from '../../brakes/brake-dtc-evidence.producer';

export type DtcSnapshotOutboxPayload =
  | {
      kind: 'vehicle_health';
      organizationId: string;
      auditRef: string;
      sources: VehicleHealthAdapterSource[];
    }
  | {
      kind: 'downstream_episode';
      vehicleId: string;
      dtcCode: string;
      episodeKind: 'upsert' | 'clear';
      eventId?: string;
      producerContext: BrakeDtcProducerContext;
    };
