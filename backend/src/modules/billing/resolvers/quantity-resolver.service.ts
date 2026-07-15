import { Injectable } from '@nestjs/common';
import { ResolvedQuantity } from '../domain/billing-resolver.types';
import { BillableVehiclesService } from '../billable-vehicles.service';

@Injectable()
export class QuantityResolverService {
  constructor(private readonly billableVehicles: BillableVehiclesService) {}

  async resolveQuantity(organizationId: string, asOf: Date = new Date()): Promise<ResolvedQuantity> {
    const result =
      await this.billableVehicles.getBillableConnectedVehiclesForOrganization(organizationId);

    return {
      organizationId,
      asOf,
      connectedVehicleCount: result.connectedVehicleCount,
      billableVehicleCount: result.billableVehicleCount,
      billableVehicleIds: result.billableVehicles.map((v) => v.id),
      excludedVehicleIds: result.excludedVehicles.map((v) => v.id),
    };
  }
}
