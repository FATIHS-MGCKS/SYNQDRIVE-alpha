import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum PhysicalDeviceIdentityAttestationKind {
  /** R1: provider mirror serial aligned to inventory serial on a selected vehicle. */
  PROVIDER_DIMO_SERIAL_RECONCILIATION = 'PROVIDER_DIMO_SERIAL_RECONCILIATION',
}

export class VerifyPhysicalDeviceIdentityDto {
  @IsEnum(PhysicalDeviceIdentityAttestationKind)
  attestationKind!: PhysicalDeviceIdentityAttestationKind;

  /** Required for PROVIDER_DIMO_SERIAL_RECONCILIATION — existing Vehicle.id (ACTIVE registry). */
  @IsOptional()
  @IsUUID()
  providerReconciliationVehicleId?: string;

  /** Master admin reviewer identity (must match authenticated actor). */
  @IsString()
  @MaxLength(128)
  reviewerUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
