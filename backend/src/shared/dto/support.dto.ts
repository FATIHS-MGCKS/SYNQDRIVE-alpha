import {
  IsString, IsOptional, IsEmail, IsEnum, MaxLength, MinLength,
} from 'class-validator';

export enum TicketPriorityDto {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketStatusDto {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  WAITING = 'WAITING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsEnum(TicketPriorityDto)
  priority?: TicketPriorityDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}

export class AdminCreateSupportTicketDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsEmail()
  reporterEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reporterName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsEnum(TicketPriorityDto)
  priority?: TicketPriorityDto;
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriorityDto)
  priority?: TicketPriorityDto;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsEnum(TicketStatusDto)
  status?: TicketStatusDto;
}

export class AddSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;
}

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatusDto)
  status: TicketStatusDto;
}
