import { BadRequestException } from '@nestjs/common';

export function assertFutureExpiresAt(expiresAt?: string | Date | null): void {
  if (!expiresAt) return;
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('expiresAt must be a valid ISO date');
  }
  if (date.getTime() <= Date.now()) {
    throw new BadRequestException('expiresAt must be in the future');
  }
}

export function validateScopeEntityIds(input: {
  scope: string;
  vehicleIds?: string[];
  customerIds?: string[];
  bookingIds?: string[];
}): void {
  const { scope, vehicleIds, customerIds, bookingIds } = input;

  if (
    vehicleIds?.length &&
    scope !== 'VEHICLE' &&
    scope !== 'CONNECTED_VEHICLES'
  ) {
    throw new BadRequestException(
      'vehicleIds are only allowed for VEHICLE or CONNECTED_VEHICLES scope',
    );
  }

  if (customerIds?.length && scope !== 'CUSTOMER') {
    throw new BadRequestException(
      'customerIds are only allowed for CUSTOMER scope',
    );
  }

  if (bookingIds?.length && scope !== 'BOOKING') {
    throw new BadRequestException(
      'bookingIds are only allowed for BOOKING scope',
    );
  }

  if (scope === 'VEHICLE' && (!vehicleIds || vehicleIds.length === 0)) {
    throw new BadRequestException('vehicleIds are required for VEHICLE scope');
  }

  if (scope === 'CUSTOMER' && (!customerIds || customerIds.length === 0)) {
    throw new BadRequestException(
      'customerIds are required for CUSTOMER scope',
    );
  }

  if (scope === 'BOOKING' && (!bookingIds || bookingIds.length === 0)) {
    throw new BadRequestException('bookingIds are required for BOOKING scope');
  }
}
