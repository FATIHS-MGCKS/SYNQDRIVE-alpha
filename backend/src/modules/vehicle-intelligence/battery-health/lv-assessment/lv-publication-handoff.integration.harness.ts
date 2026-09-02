import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { mergePublicationHandoffPatchIntoSummary } from './lv-publication-handoff.mutation';

export function createRowLockedAssessmentPrisma(input: {
  organizationId: string;
  vehicleId: string;
  assessments: Map<string, Record<string, unknown>>;
  assessmentIdForLock?: string;
}) {
  let mutex: Promise<void> = Promise.resolve();

  const withMutex = async <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = mutex;
    let release!: () => void;
    mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const lockAssessmentId = input.assessmentIdForLock;

  type HarnessPrisma = {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    batteryAssessment: {
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    batteryPublication: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findFirstOrThrow: jest.Mock;
    };
    mutateHandoff: (
      assessmentId: string,
      patch: Parameters<typeof mergePublicationHandoffPatchIntoSummary>[1],
    ) => void;
  };

  const prisma: HarnessPrisma = {
    $transaction: jest.fn(async (fn: (tx: HarnessPrisma) => Promise<unknown>) =>
      withMutex(() => fn(prisma)),
    ),
    $queryRaw: jest.fn(async () => {
      const summary = lockAssessmentId
        ? input.assessments.get(lockAssessmentId) ?? {}
        : {};
      return [{ input_summary: summary }];
    }),
    batteryAssessment: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const summary = input.assessments.get(where.id);
        if (!summary) return null;
        return {
          id: where.id,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          inputSummary: summary,
        };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { inputSummary: Prisma.InputJsonValue };
        }) => {
          input.assessments.set(where.id, data.inputSummary as Record<string, unknown>);
          return { count: 1 };
        },
      ),
      findMany: jest.fn(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in
            .map((id) => {
              const summary = input.assessments.get(id);
              if (!summary) return null;
              return { id, inputSummary: summary };
            })
            .filter((row): row is { id: string; inputSummary: Record<string, unknown> } =>
              row != null,
            ),
      ),
    },
    batteryPublication: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(),
      update: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
    mutateHandoff: (
      assessmentId: string,
      patch: Parameters<typeof mergePublicationHandoffPatchIntoSummary>[1],
    ) => {
      const current = input.assessments.get(assessmentId) ?? {};
      input.assessments.set(
        assessmentId,
        mergePublicationHandoffPatchIntoSummary(current, patch) as Record<string, unknown>,
      );
    },
  };

  return prisma as unknown as PrismaService & {
    mutateHandoff: (
      assessmentId: string,
      patch: Parameters<typeof mergePublicationHandoffPatchIntoSummary>[1],
    ) => void;
  };
}

export function createConcurrentJobProducer() {
  const liveJobs = new Map<string, string>();
  let enqueueMutex: Promise<void> = Promise.resolve();

  const withEnqueueMutex = async <T>(fn: () => Promise<T>): Promise<T> => {
    const previous = enqueueMutex;
    let release!: () => void;
    enqueueMutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  return {
    liveJobs,
    jobProducer: {
      enqueue: jest.fn(async (_type: string, payload: { idempotencyKey: string }) =>
        withEnqueueMutex(async () => {
          const existing = liveJobs.get(payload.idempotencyKey);
          if (existing) return existing;
          const jobId = `bull-${payload.idempotencyKey}`;
          liveJobs.set(payload.idempotencyKey, jobId);
          return jobId;
        }),
      ),
      hasLiveJob: jest.fn(async (idempotencyKey: string) =>
        liveJobs.has(idempotencyKey),
      ),
    },
  };
}
