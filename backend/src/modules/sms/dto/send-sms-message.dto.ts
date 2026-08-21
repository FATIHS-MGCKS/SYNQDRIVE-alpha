import { CommunicationActorType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendSmsMessageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  recipientPhone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1600)
  body!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  businessOperationId!: string;

  @IsOptional()
  @IsEnum(CommunicationActorType)
  actorType?: CommunicationActorType;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsBoolean()
  sandbox?: boolean;
}
