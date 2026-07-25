import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowDefinitionLifecycleStatus } from '@prisma/client';
import { WorkflowDefinitionLifecycleService } from './workflow-definition-lifecycle.service';
import { WORKFLOW_LIFECYCLE_ERROR_CODES } from './workflow-lifecycle.errors';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const DEF_ID = 'def-1';
const DRAFT_ID = 'ver-draft';
const PUBLISHED_ID = 'ver-pub';
const ACTIVE_ID = 'ver-active';

const validCreateDto = {
  name: 'Maintenance workflow',
  category: 'maintenance',
  trigger: { type: 'manual.test' },
  actions: [{ type: 'task.create', config: { title: 'Inspect vehicle' } }],
};

function makeDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: DEF_ID,
    organizationId: ORG,
    name: 'Maintenance workflow',
    description: null,
    category: 'maintenance',
    slug: null,
    lifecycleStatus: WorkflowDefinitionLifecycleStatus.ACTIVE,
    draftVersionId: DRAFT_ID,
    publishedVersionId: null,
    activeVersionId: null,
    versionCounter: 1,
    lockVersion: 1,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDraftVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    organizationId: ORG,
    workflowDefinitionId: DEF_ID,
    versionNumber: 1,
    status: 'DRAFT',
    contentHash: 'hash-draft',
    definitionSnapshot: null,
    publishedAt: null,
    activatedAt: null,
    disabledAt: null,
    archivedAt: null,
    trigger: {
      triggerType: 'manual.test',
      config: {},
    },
    scope: {
      scopeType: 'ORGANIZATION',
      bindings: [],
    },
    conditionGroups: [{ conditions: [] }],
    actions: [
      {
        actionType: 'task.create',
        config: { title: 'Inspect vehicle' },
        requiresApproval: false,
      },
    ],
    ...overrides,
  };
}

function makePublishedVersion(overrides: Record<string, unknown> = {}) {
  return {
    ...makeDraftVersion({
      id: PUBLISHED_ID,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      definitionSnapshot: {
        trigger: { type: 'manual.test', config: {} },
        scope: { type: 'organization' },
        conditions: [],
        actions: [{ type: 'task.create', config: { title: 'Inspect vehicle' } }],
      },
    }),
    ...overrides,
  };
}

function makePrisma() {
  const tx = {
    workflowDefinition: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    workflowVersion: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    workflowRevision: { create: jest.fn() },
    workflowTrigger: { create: jest.fn(), deleteMany: jest.fn() },
    workflowScope: { create: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
    workflowScopeBinding: { createMany: jest.fn(), deleteMany: jest.fn() },
    workflowConditionGroup: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    workflowCondition: { create: jest.fn(), deleteMany: jest.fn() },
    workflowAction: { create: jest.fn(), deleteMany: jest.fn() },
  };

  return {
    workflowDefinition: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    workflowVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    workflowRevision: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

describe('WorkflowDefinitionLifecycleService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: WorkflowDefinitionLifecycleService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.__tx.workflowConditionGroup.findMany.mockResolvedValue([]);
    prisma.__tx.workflowScope.findMany.mockResolvedValue([]);
    svc = new WorkflowDefinitionLifecycleService(prisma as never);
  });

  it('creates definition with initial draft', async () => {
    const definition = makeDefinition();
    const draft = makeDraftVersion();

    prisma.__tx.workflowDefinition.create.mockResolvedValue(definition);
    prisma.__tx.workflowVersion.create.mockResolvedValue(draft);
    prisma.__tx.workflowDefinition.update.mockResolvedValue({
      ...definition,
      draftVersionId: DRAFT_ID,
    });
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-1' });

    prisma.workflowDefinition.findFirst.mockResolvedValue({
      ...definition,
      draftVersionId: DRAFT_ID,
      draftVersion: draft,
      publishedVersion: null,
      activeVersion: null,
      versions: [draft],
    });

    const result = await svc.createDefinition(ORG, validCreateDto, { id: 'user-1' });

    expect(prisma.__tx.workflowDefinition.create).toHaveBeenCalled();
    expect(prisma.__tx.workflowVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DRAFT', versionNumber: 1 }),
      }),
    );
    expect(prisma.__tx.workflowRevision.create).toHaveBeenCalled();
    expect(result.lifecycle.draftVersionId).toBe(DRAFT_ID);
  });

  it('updates draft with optimistic lock', async () => {
    const definition = makeDefinition({ lockVersion: 2 });
    const draft = makeDraftVersion();

    prisma.workflowDefinition.findFirst.mockResolvedValue({
      ...definition,
      draftVersion: draft,
    });
    prisma.__tx.workflowDefinition.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-2' });
    prisma.workflowDefinition.findFirst.mockResolvedValueOnce({
      ...definition,
      draftVersion: draft,
    });
    prisma.workflowDefinition.findFirst.mockResolvedValueOnce({
      ...definition,
      lockVersion: 3,
      draftVersion: draft,
      publishedVersion: null,
      activeVersion: null,
      versions: [draft],
    });

    await svc.updateDraft(
      ORG,
      DEF_ID,
      {
        expectedLockVersion: 2,
        actions: [{ type: 'task.create', config: { title: 'Updated task' } }],
      },
      { id: 'user-1' },
    );

    expect(prisma.__tx.workflowDefinition.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lockVersion: 2 }),
      }),
    );
    expect(prisma.__tx.workflowRevision.create).toHaveBeenCalled();
  });

  it('rejects draft update on lock conflict', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue(
      makeDefinition({ lockVersion: 3, draftVersion: makeDraftVersion() }),
    );

    await expect(
      svc.updateDraft(ORG, DEF_ID, { expectedLockVersion: 2, actions: [] }),
    ).rejects.toMatchObject({
      response: { code: WORKFLOW_LIFECYCLE_ERROR_CODES.LOCK_CONFLICT },
    });
  });

  it('publishes draft after validation', async () => {
    const definition = makeDefinition();
    const draft = makeDraftVersion();

    prisma.workflowDefinition.findFirst
      .mockResolvedValueOnce({ ...definition, draftVersion: draft })
      .mockResolvedValueOnce(definition);
    prisma.__tx.workflowVersion.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.workflowDefinition.update.mockResolvedValue({
      ...definition,
      publishedVersionId: DRAFT_ID,
      draftVersionId: null,
    });
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-pub' });

    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...draft,
      status: 'PUBLISHED',
      workflowDefinitionId: DEF_ID,
      trigger: draft.trigger,
      scope: draft.scope,
      conditionGroups: draft.conditionGroups,
      actions: draft.actions,
    });

    const result = await svc.publishDraft(ORG, DEF_ID, {}, { id: 'user-1' });

    expect(prisma.__tx.workflowVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'DRAFT' }),
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      }),
    );
    expect(result.immutable).toBe(true);
  });

  it('blocks publishing invalid action types', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue({
      ...makeDefinition(),
      draftVersion: makeDraftVersion({
        actions: [{ actionType: 'ai_execute', config: {}, requiresApproval: false }],
      }),
    });

    await expect(
      svc.publishDraft(ORG, DEF_ID, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects editing when no draft exists (published immutable)', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue({
      ...makeDefinition({ draftVersionId: null, publishedVersionId: PUBLISHED_ID }),
      draftVersion: null,
    });

    await expect(
      svc.updateDraft(ORG, DEF_ID, { expectedLockVersion: 1, actions: [] }),
    ).rejects.toMatchObject({
      response: { code: WORKFLOW_LIFECYCLE_ERROR_CODES.NO_DRAFT },
    });
  });

  it('activates published version atomically', async () => {
    const definition = makeDefinition({
      publishedVersionId: PUBLISHED_ID,
      activeVersionId: null,
    });
    const published = makePublishedVersion();

    prisma.workflowDefinition.findFirst
      .mockResolvedValueOnce(definition)
      .mockResolvedValueOnce({
        ...definition,
        activeVersionId: PUBLISHED_ID,
        activeVersion: { ...published, status: 'ACTIVE' },
      });
    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...published,
      workflowDefinitionId: DEF_ID,
      trigger: published.trigger,
      scope: published.scope,
      conditionGroups: published.conditionGroups,
      actions: published.actions,
    });
    prisma.__tx.workflowVersion.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.workflowDefinition.update.mockResolvedValue({
      ...definition,
      activeVersionId: PUBLISHED_ID,
    });
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-act' });

    const result = await svc.activateVersion(
      ORG,
      DEF_ID,
      { versionId: PUBLISHED_ID },
      { id: 'user-1' },
    );

    expect(prisma.__tx.workflowVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED' }),
        data: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
    expect(result.lifecycle.activeVersionId).toBe(PUBLISHED_ID);
  });

  it('atomically swaps active version when activating a newer publish', async () => {
    const definition = makeDefinition({
      activeVersionId: ACTIVE_ID,
      publishedVersionId: PUBLISHED_ID,
      versionCounter: 2,
    });
    const oldActive = makePublishedVersion({ id: ACTIVE_ID, versionNumber: 1, status: 'ACTIVE' });
    const newPublished = makePublishedVersion({ id: PUBLISHED_ID, versionNumber: 2 });

    prisma.workflowDefinition.findFirst
      .mockResolvedValueOnce(definition)
      .mockResolvedValueOnce({
        ...definition,
        activeVersionId: PUBLISHED_ID,
      });
    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...newPublished,
      workflowDefinitionId: DEF_ID,
      trigger: newPublished.trigger,
      scope: newPublished.scope,
      conditionGroups: newPublished.conditionGroups,
      actions: newPublished.actions,
    });
    prisma.__tx.workflowVersion.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.workflowDefinition.update.mockResolvedValue(definition);
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-swap' });

    await svc.activateVersion(ORG, DEF_ID, { versionId: PUBLISHED_ID });

    expect(prisma.__tx.workflowVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: ACTIVE_ID, status: 'ACTIVE' }),
        data: expect.objectContaining({ status: 'DISABLED' }),
      }),
    );
    expect(prisma.__tx.workflowRevision.create).toHaveBeenCalledTimes(2);
    void oldActive;
  });

  it('creates new draft from active version', async () => {
    const definition = makeDefinition({
      draftVersionId: null,
      activeVersionId: ACTIVE_ID,
      versionCounter: 1,
    });
    const active = makePublishedVersion({ id: ACTIVE_ID, status: 'ACTIVE' });

    prisma.workflowDefinition.findFirst
      .mockResolvedValueOnce(definition)
      .mockResolvedValueOnce({
        ...definition,
        draftVersionId: 'ver-draft-2',
        versionCounter: 2,
        lifecycle: {
          draftVersionId: 'ver-draft-2',
          publishedVersionId: null,
          activeVersionId: ACTIVE_ID,
          lockVersion: 2,
        },
      });
    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...active,
      workflowDefinitionId: DEF_ID,
      trigger: active.trigger,
      scope: active.scope,
      conditionGroups: active.conditionGroups,
      actions: active.actions,
    });
    prisma.__tx.workflowVersion.create.mockResolvedValue({
      id: 'ver-draft-2',
      versionNumber: 2,
      status: 'DRAFT',
    });
    prisma.__tx.workflowVersion.findFirst = jest.fn().mockResolvedValue({
      ...active,
      trigger: active.trigger,
      scope: active.scope,
      conditionGroups: active.conditionGroups,
      actions: active.actions,
    });
    prisma.__tx.workflowDefinition.update.mockResolvedValue(definition);
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-new-draft' });

    const result = await svc.createNewDraft(ORG, DEF_ID, {});

    expect(prisma.__tx.workflowVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ versionNumber: 2, status: 'DRAFT' }),
      }),
    );
    expect((result as unknown as { versionCounter: number }).versionCounter).toBe(2);
  });

  it('deactivates active version without stopping runs', async () => {
    const definition = makeDefinition({ activeVersionId: ACTIVE_ID });

    prisma.workflowDefinition.findFirst
      .mockResolvedValueOnce(definition)
      .mockResolvedValueOnce({ ...definition, activeVersionId: null });
    prisma.__tx.workflowVersion.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.workflowDefinition.update.mockResolvedValue({
      ...definition,
      activeVersionId: null,
    });
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-deact' });

    const result = await svc.deactivate(ORG, DEF_ID, { changeReason: 'Maintenance window' });

    expect(prisma.__tx.workflowVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'DISABLED' }),
      }),
    );
    expect(result.lifecycle.activeVersionId).toBeNull();
  });

  it('archives definition and blocks new versions', async () => {
    const definition = makeDefinition({ activeVersionId: ACTIVE_ID });

    prisma.workflowDefinition.findFirst
      .mockResolvedValueOnce(definition)
      .mockResolvedValueOnce({
        ...definition,
        lifecycleStatus: WorkflowDefinitionLifecycleStatus.ARCHIVED,
        activeVersionId: null,
        draftVersionId: null,
        lifecycle: {
          draftVersionId: null,
          publishedVersionId: null,
          activeVersionId: null,
          lockVersion: 2,
        },
      });
    prisma.__tx.workflowVersion.updateMany.mockResolvedValue({ count: 1 });
    prisma.__tx.workflowDefinition.update.mockResolvedValue(definition);
    prisma.__tx.workflowRevision.create.mockResolvedValue({ id: 'rev-arch' });

    const result = await svc.archive(ORG, DEF_ID, { changeReason: 'Retired' });

    expect(prisma.__tx.workflowDefinition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: WorkflowDefinitionLifecycleStatus.ARCHIVED,
          draftVersionId: null,
          activeVersionId: null,
        }),
      }),
    );
    expect(
      (result as unknown as { lifecycleStatus: WorkflowDefinitionLifecycleStatus }).lifecycleStatus,
    ).toBe(WorkflowDefinitionLifecycleStatus.ARCHIVED);
  });

  it('rejects cross-tenant access', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue(null);

    await expect(svc.getDefinition(OTHER_ORG, DEF_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('detects concurrent publish via updateMany count', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue({
      ...makeDefinition(),
      draftVersion: makeDraftVersion(),
    });
    prisma.__tx.workflowVersion.updateMany.mockResolvedValue({ count: 0 });

    await expect(svc.publishDraft(ORG, DEF_ID, {})).rejects.toMatchObject({
      response: { code: WORKFLOW_LIFECYCLE_ERROR_CODES.CONCURRENT_LIFECYCLE },
    });
  });

  it('rejects activation of non-published version', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue(makeDefinition());
    prisma.workflowVersion.findFirst.mockResolvedValue({
      ...makeDraftVersion(),
      workflowDefinitionId: DEF_ID,
    });

    await expect(
      svc.activateVersion(ORG, DEF_ID, { versionId: DRAFT_ID }),
    ).rejects.toMatchObject({
      response: { code: WORKFLOW_LIFECYCLE_ERROR_CODES.NOT_PUBLISHED },
    });
  });

  it('rejects second draft when one already exists', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue(makeDefinition());

    await expect(svc.createNewDraft(ORG, DEF_ID, {})).rejects.toMatchObject({
      response: { code: WORKFLOW_LIFECYCLE_ERROR_CODES.DRAFT_EXISTS },
    });
  });

  it('rejects archive mutations on archived definitions', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue(
      makeDefinition({ lifecycleStatus: WorkflowDefinitionLifecycleStatus.ARCHIVED }),
    );

    await expect(
      svc.updateMetadata(ORG, DEF_ID, { name: 'Renamed' }),
    ).rejects.toMatchObject({
      response: { code: WORKFLOW_LIFECYCLE_ERROR_CODES.ARCHIVED },
    });
  });

  it('rejects deactivate when nothing is active', async () => {
    prisma.workflowDefinition.findFirst.mockResolvedValue(
      makeDefinition({ activeVersionId: null }),
    );

    await expect(svc.deactivate(ORG, DEF_ID, {})).rejects.toMatchObject({
      response: { code: WORKFLOW_LIFECYCLE_ERROR_CODES.NOT_ACTIVE },
    });
  });
});

describe('validateWorkflowForPublish (lifecycle integration)', () => {
  it('blocks unknown action at publish time', async () => {
    const { validateWorkflowForPublish } = await import('./workflow-publish.validator');
    expect(() =>
      validateWorkflowForPublish({
        name: 'Bad',
        category: 'maintenance',
        trigger: { type: 'manual.test' },
        actions: [{ type: 'totally.unknown.action', config: {} }],
      }),
    ).toThrow(BadRequestException);
  });
});
