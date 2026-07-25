import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorkflowDefinitionLifecycleService } from './workflow-definition-lifecycle.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import {
  ActivateWorkflowVersionDto,
  CreateWorkflowDefinitionDto,
  CreateWorkflowDraftDto,
  LifecycleChangeReasonDto,
  PublishWorkflowVersionDto,
  UpdateWorkflowDefinitionMetadataDto,
  UpdateWorkflowDraftDto,
} from './dto/workflow-lifecycle.dto';

const WORKFLOW_LIFECYCLE_ROLES = ['ORG_ADMIN', 'SUB_ADMIN', 'MASTER_ADMIN'] as const;

@Controller('organizations/:orgId/workflow-definitions')
@UseGuards(OrgScopingGuard, RolesGuard)
export class WorkflowDefinitionsController {
  constructor(
    private readonly lifecycle: WorkflowDefinitionLifecycleService,
  ) {}

  @Get()
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  list(@Param('orgId') orgId: string) {
    return this.lifecycle.listDefinitions(orgId);
  }

  @Post()
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateWorkflowDefinitionDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.createDefinition(orgId, dto, req.user);
  }

  @Get(':definitionId')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  get(@Param('orgId') orgId: string, @Param('definitionId') definitionId: string) {
    return this.lifecycle.getDefinition(orgId, definitionId);
  }

  @Patch(':definitionId')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  updateMetadata(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: UpdateWorkflowDefinitionMetadataDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.updateMetadata(orgId, definitionId, dto, req.user);
  }

  @Patch(':definitionId/draft')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  updateDraft(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: UpdateWorkflowDraftDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.updateDraft(orgId, definitionId, dto, req.user);
  }

  @Post(':definitionId/publish')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  publish(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: PublishWorkflowVersionDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.publishDraft(orgId, definitionId, dto, req.user);
  }

  @Post(':definitionId/activate')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  activate(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: ActivateWorkflowVersionDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.activateVersion(orgId, definitionId, dto, req.user);
  }

  @Post(':definitionId/deactivate')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  deactivate(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: LifecycleChangeReasonDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.deactivate(orgId, definitionId, dto, req.user);
  }

  @Post(':definitionId/archive')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  archive(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: LifecycleChangeReasonDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.archive(orgId, definitionId, dto, req.user);
  }

  @Post(':definitionId/draft')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  createDraft(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Body() dto: CreateWorkflowDraftDto,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.lifecycle.createNewDraft(orgId, definitionId, dto, req.user);
  }

  @Get(':definitionId/versions')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  listVersions(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
  ) {
    return this.lifecycle.listVersions(orgId, definitionId);
  }

  @Get(':definitionId/versions/:versionId')
  @Roles(...WORKFLOW_LIFECYCLE_ROLES)
  getVersion(
    @Param('orgId') orgId: string,
    @Param('definitionId') definitionId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.lifecycle.getVersion(orgId, definitionId, versionId);
  }
}
