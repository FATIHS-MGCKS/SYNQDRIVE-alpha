import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskPriority, TaskSource, TaskType } from '@prisma/client';
import { TasksService } from '../../tasks/tasks.service';
import { checklistForType } from '../../tasks/task-templates';
import { ServiceComplianceService } from './service-compliance.service';
import type { ComplianceTaskSignalDto } from './service-compliance.types';

function priorityFromSignalSeverity(severity: 'WARNING' | 'CRITICAL'): TaskPriority {
  return severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH';
}

const SOURCE_BY_CATEGORY: Record<string, { source: string; sourceType: TaskSource }> = {
  Maintenance: { source: 'INSIGHT_SERVICE', sourceType: 'ALERT' },
  'TÜV': { source: 'INSIGHT_COMPLIANCE', sourceType: 'ALERT' },
  BOKraft: { source: 'INSIGHT_COMPLIANCE', sourceType: 'ALERT' },
};

@Injectable()
export class ComplianceTaskMaterializeService {
  constructor(
    private readonly serviceCompliance: ServiceComplianceService,
    private readonly tasks: TasksService,
  ) {}

  async materializeSignal(
    organizationId: string,
    vehicleId: string,
    signalKey: string,
  ) {
    const status = await this.serviceCompliance.buildServiceInfoStatus(vehicleId);
    const signal = status.taskSignals.find((s) => s.signalKey === signalKey || s.dedupeKey === signalKey);
    if (!signal) {
      throw new NotFoundException('Compliance task signal not found or no longer active');
    }
    return this.upsertFromSignal(organizationId, vehicleId, signal);
  }

  async upsertFromSignal(
    organizationId: string,
    vehicleId: string,
    signal: ComplianceTaskSignalDto,
  ) {
    const src = SOURCE_BY_CATEGORY[signal.category] ?? {
      source: 'INSIGHT_SERVICE',
      sourceType: 'ALERT' as TaskSource,
    };
    const priority = priorityFromSignalSeverity(signal.severity);

    return this.tasks.upsertByDedup(organizationId, signal.dedupeKey, {
      title: signal.title,
      description: signal.message,
      category: signal.category,
      type: signal.taskType as TaskType,
      sourceType: src.sourceType,
      priority,
      vehicleId,
      source: src.source,
      dueDate: signal.dueDate ? new Date(signal.dueDate) : null,
      blocksVehicleAvailability: signal.blocksRental,
      metadata: {
        generatedKey: signal.dedupeKey,
        insightType: signal.insightType,
        insightSeverity: signal.severity,
        suggestionOnly: signal.suggestionOnly,
        complianceSignalKind: signal.kind,
      },
      checklist: checklistForType(signal.taskType as TaskType),
    });
  }
}
