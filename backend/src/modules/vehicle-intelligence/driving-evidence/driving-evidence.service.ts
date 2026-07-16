import { BadRequestException, Injectable } from '@nestjs/common';
import {
  canAloneSupportMisuseCase,
  validateDrivingEvidenceContract,
} from './driving-evidence.contract';
import { DrivingEvidenceRepository } from './driving-evidence.repository';
import type { CreateDrivingEvidenceInput } from './driving-evidence.types';

@Injectable()
export class DrivingEvidenceService {
  constructor(private readonly repository: DrivingEvidenceRepository) {}

  validate(input: CreateDrivingEvidenceInput) {
    return validateDrivingEvidenceContract(input);
  }

  canAloneSupportMisuseCase(sourceType: CreateDrivingEvidenceInput['sourceType']) {
    return canAloneSupportMisuseCase(sourceType);
  }

  findByTrip(organizationId: string, tripId: string) {
    return this.repository.findByTrip(organizationId, tripId);
  }

  findByVehicle(
    organizationId: string,
    vehicleId: string,
    options?: { from?: Date; to?: Date },
  ) {
    return this.repository.findByVehicle(organizationId, vehicleId, options);
  }

  async record(input: CreateDrivingEvidenceInput) {
    const validation = validateDrivingEvidenceContract(input);
    if (!validation.ok) {
      throw new BadRequestException(validation.issues);
    }
    return this.repository.createImmutable(input);
  }
}
