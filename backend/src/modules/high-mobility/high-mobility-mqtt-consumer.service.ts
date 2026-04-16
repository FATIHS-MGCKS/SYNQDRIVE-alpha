import { Injectable } from '@nestjs/common';
import { HighMobilityHealthAppMqttConsumerService } from './high-mobility-health-app-mqtt-consumer.service';

/**
 * HighMobilityMqttConsumerService
 *
 * @deprecated Delegates to HighMobilityHealthAppMqttConsumerService.
 * Kept for backward compatibility with any existing injection points.
 * Migrate all usages to the typed per-app consumers.
 */
@Injectable()
export class HighMobilityMqttConsumerService {
  constructor(private readonly healthConsumer: HighMobilityHealthAppMqttConsumerService) {}

  getConnectionState() { return this.healthConsumer.getConnectionState(); }
  testConnection() { return this.healthConsumer.testConnection(); }
}
