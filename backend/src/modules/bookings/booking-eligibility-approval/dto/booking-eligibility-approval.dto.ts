import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBookingEligibilityApprovalDto {
  @IsString()
  @MinLength(3)
  exceptionReason!: string;

  @IsOptional()
  @IsIn(['CONFIRMED', 'ACTIVE'])
  targetBookingStatus?: 'CONFIRMED' | 'ACTIVE';
}

export class DecideBookingEligibilityApprovalDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsString()
  @MinLength(3)
  decisionReason!: string;
}

export class BookingEligibilityApprovalQueryDto {
  @IsOptional()
  @IsUUID('4')
  eligibilityApprovalId?: string;
}
