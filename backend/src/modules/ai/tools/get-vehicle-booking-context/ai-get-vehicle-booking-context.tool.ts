import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleBookingContextService } from '@modules/bookings/vehicle-booking-context/vehicle-booking-context.service';
import type { AiExecutionContext } from '../../execution/ai-execution-context.types';
import {
  assertAiBookingAccess,
  assertAiCustomerDataAccess,
  assertAiToolExecutionAllowed,
  resolveAiVehicleAccess,
} from '../../execution/ai-execution-context.access';
import type { AiDomainError, AiDomainQueryOutcome } from '../../evidence/ai-domain-error.types';
import {
  buildAiDomainQueryOutcome,
  createVehicleNotFoundError,
} from '../../evidence/ai-domain-error.factory';
import { createObservedAiEvidence } from '../../evidence/ai-evidence.factory';
import type { AiEvidence } from '../../evidence/ai-evidence.types';
import { buildAiVehicleDisplayName } from '../../vehicle-resolution/ai-vehicle-resolution.hints';
import type { AiVehicleScopeResolver } from '../../execution/ai-execution-context.types';
import type {
  AiGetVehicleBookingContextData,
  AiGetVehicleBookingContextInput,
} from './ai-get-vehicle-booking-context.types';

@Injectable()
export class AiGetVehicleBookingContextTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicleBookingContext: VehicleBookingContextService,
    private readonly vehicleScopeResolver: AiVehicleScopeResolver,
  ) {}

  async execute(
    context: AiExecutionContext | null | undefined,
    input: AiGetVehicleBookingContextInput,
    nowMs: number = Date.now(),
  ): Promise<AiDomainQueryOutcome<AiGetVehicleBookingContextData | null>> {
    const tenantId = context?.organizationId ?? 'unknown';
    const now = new Date(nowMs);

    const toolGate = assertAiToolExecutionAllowed(context);
    if (toolGate !== true) {
      return this.blockedOutcome(tenantId, toolGate);
    }

    const verifiedContext = context as AiExecutionContext;
    const bookingGate = assertAiBookingAccess(verifiedContext);
    if (bookingGate !== true) {
      return this.blockedOutcome(tenantId, bookingGate);
    }

    const vehicleAccess = await resolveAiVehicleAccess(
      verifiedContext,
      { vehicleId: input.vehicleId },
      this.vehicleScopeResolver,
    );
    if ('code' in vehicleAccess) {
      return this.blockedOutcome(tenantId, vehicleAccess);
    }

    const customerGate = assertAiCustomerDataAccess(verifiedContext);
    const includeCustomerDisplayName = customerGate === true;

    const operational = await this.vehicleBookingContext.getVehicleBookingOperationalContext(
      verifiedContext.organizationId,
      vehicleAccess.vehicleId,
      { now, includeCustomerDisplayName },
    );

    if (!operational) {
      return buildAiDomainQueryOutcome({
        tenantId,
        data: null,
        errors: [createVehicleNotFoundError({ entityId: vehicleAccess.vehicleId })],
        evidence: [],
      });
    }

    const vehicleRow = await this.prisma.vehicle.findFirst({
      where: {
        id: vehicleAccess.vehicleId,
        organizationId: verifiedContext.organizationId,
      },
      select: {
        licensePlate: true,
        vehicleName: true,
        make: true,
        model: true,
        year: true,
      },
    });

    const data: AiGetVehicleBookingContextData = {
      ...operational,
      displayName: buildAiVehicleDisplayName({
        vehicleName: vehicleRow?.vehicleName ?? null,
        make: vehicleRow?.make ?? '',
        model: vehicleRow?.model ?? '',
        year: vehicleRow?.year ?? 0,
        licensePlate: vehicleRow?.licensePlate ?? null,
      }),
      licensePlate: vehicleRow?.licensePlate ?? null,
    };

    return buildAiDomainQueryOutcome({
      tenantId,
      data,
      evidence: this.buildEvidence(tenantId, data),
    });
  }

  private buildEvidence(tenantId: string, data: AiGetVehicleBookingContextData): AiEvidence[] {
    return [
      createObservedAiEvidence({
        tenantId,
        entityId: data.vehicleId,
        source: 'bookings_service',
        sourceEntity: { kind: 'vehicle', id: data.vehicleId },
        observedAt: data.calculatedAt,
        freshness: 'not_applicable',
        confidence: 'high',
        availability: 'available',
        reasonCode: 'ok',
        sensitivity: 'internal',
        value: {
          contextKind: data.contextKind,
          runtimeState: data.runtimeState,
          pickupOverdue: data.pickupOverdue,
          returnOverdue: data.returnOverdue,
          reasonCodes: [...data.reasonCodes],
          inconsistencyFlags: [...data.inconsistencyFlags],
          openProcessSteps: [...data.openProcessSteps],
        },
      }),
    ];
  }

  private blockedOutcome(
    tenantId: string,
    error: AiDomainError,
  ): AiDomainQueryOutcome<AiGetVehicleBookingContextData | null> {
    return buildAiDomainQueryOutcome({
      tenantId,
      data: null,
      errors: [error],
    });
  }
}
