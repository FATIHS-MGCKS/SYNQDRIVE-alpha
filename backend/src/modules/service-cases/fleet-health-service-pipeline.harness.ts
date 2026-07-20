import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceOverdueTaskService } from '@modules/vehicle-intelligence/service-compliance/service-overdue-task.service';
import { TechnicalObservationsService } from '@modules/technical-observations/technical-observations.service';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import { TasksService } from '@modules/tasks/tasks.service';
import { TaskLinkedObjectResolverService } from '@modules/tasks/task-linked-object-resolver.service';
import { VendorsService } from '@modules/vendors/vendors.service';
import { ServiceCasesService } from './service-cases.service';
import { createFleetHealthServiceTestStore, type FleetHealthServiceTestStore } from './fleet-health-service-test-store';

export interface FleetHealthServicePipelineHarness {
  store: FleetHealthServiceTestStore;
  tasks: TasksService;
  serviceCases: ServiceCasesService;
  observations: TechnicalObservationsService;
  vendors: VendorsService;
}

export function createFleetHealthServicePipelineHarness(): FleetHealthServicePipelineHarness {
  const store = createFleetHealthServiceTestStore();
  const prisma = store.prisma as unknown as PrismaService;

  const activityLog = { log: jest.fn() } as unknown as ActivityLogService;
  const linkedObjectResolver = {
    resolveForTask: jest.fn().mockResolvedValue([]),
  } as unknown as TaskLinkedObjectResolverService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const damages = { create: jest.fn() } as unknown as DamagesService;

  const tasks = new TasksService(prisma, activityLog, linkedObjectResolver);
  const serviceOverdueTasks = {
    linkServiceCase: jest.fn().mockResolvedValue(undefined),
    onServiceCaseCompleted: jest.fn().mockResolvedValue(undefined),
  } as unknown as ServiceOverdueTaskService;
  const serviceCases = new ServiceCasesService(prisma, serviceOverdueTasks);
  const observations = new TechnicalObservationsService(prisma, tasks, serviceCases, damages);
  const vendors = new VendorsService(prisma, audit, serviceCases);

  return { store, tasks, serviceCases, observations, vendors };
}
