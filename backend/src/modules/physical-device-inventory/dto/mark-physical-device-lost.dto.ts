import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Only explicit master-admin loss attestations — never telemetry-derived states. */
export enum PhysicalDeviceLossAttestationKind {
  MASTER_ADMIN_LOSS_CONFIRMATION = 'MASTER_ADMIN_LOSS_CONFIRMATION',
}

export class MarkPhysicalDeviceLostDto {
  @IsEnum(PhysicalDeviceLossAttestationKind)
  lossAttestationKind!: PhysicalDeviceLossAttestationKind;

  @IsString()
  @MaxLength(2000)
  lossEvidenceNotes!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
