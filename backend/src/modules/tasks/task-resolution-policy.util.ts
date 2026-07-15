import { BadRequestException } from '@nestjs/common';
import { TaskType } from '@prisma/client';
import { getTaskTypeChecklistTemplate } from './task-templates';

export function getAllowedResolutionCodesForType(type: TaskType): string[] {
  return getTaskTypeChecklistTemplate(type)?.metadata.resolutionCodes ?? [];
}

export function taskTypeRequiresResolutionCode(type: TaskType): boolean {
  return getAllowedResolutionCodesForType(type).length > 0;
}

export function assertValidManualResolutionCode(type: TaskType, code?: string | null): void {
  const allowed = getAllowedResolutionCodesForType(type);
  if (allowed.length === 0) return;

  const trimmed = code?.trim();
  if (!trimmed) {
    throw new BadRequestException(`A resolution code is required to complete a ${type} task`);
  }
  if (!allowed.includes(trimmed)) {
    throw new BadRequestException(`Invalid resolution code "${trimmed}" for task type ${type}`);
  }
}
