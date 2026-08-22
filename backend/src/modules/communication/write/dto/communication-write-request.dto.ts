import { Injectable } from '@nestjs/common';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class CommunicationAssignmentDto {
  @ValidateIf((o: CommunicationAssignmentDto) => o.assignedUserId !== null)
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;
}
