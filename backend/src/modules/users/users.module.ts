import { Module, forwardRef } from '@nestjs/common';
import { UsersController } from './users.controller';
import { OrganizationInvitesController } from './organization-invites.controller';
import { OrganizationRolesController } from './organization-roles.controller';
import { PublicInvitesController } from './public-invites.controller';
import { UsersService } from './users.service';
import { OrganizationInviteService } from './organization-invite.service';
import { OrganizationRoleService } from './organization-role.service';
import { UserAccessAuditService } from './user-access-audit.service';
import { TransactionalMailService } from './transactional-mail.service';
import { InviteRateLimitService } from './invite-rate-limit.service';
import { InviteEmailOutboxRepository } from './invite-email-outbox.repository';
import { InviteEmailDeliveryService } from './invite-email-delivery.service';
import { InviteEmailSchedulerService } from './invite-email-scheduler.service';
import { InviteAcceptService } from './invite-accept.service';
import { IamAuditOutboxRepository } from './iam-audit-outbox.repository';
import { IamAuditOutboxProcessorService } from './iam-audit-outbox.processor';
import { IamAuditOutboxSchedulerService } from './iam-audit-outbox.scheduler.service';
import { IamAuditOutboxMetricsService } from './iam-audit-outbox.metrics';
import { IamAuditService } from './iam-audit.service';
import { IamMembershipLifecycleService } from './iam-membership-lifecycle.service';
import { IamMembershipLifecycleNotificationService } from './iam-membership-lifecycle-notification.service';
import { IamAccessReviewService } from './iam-access-review.service';
import { IamAccessReviewSnapshotService } from './iam-access-review-snapshot.service';
import { IamTeamService } from './iam-team.service';
import { IamAccessReviewController } from './iam-access-review.controller';
import { IamTeamController } from './iam-team.controller';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';

@Module({
  imports: [forwardRef(() => IamMfaModule)],
  controllers: [
    UsersController,
    OrganizationInvitesController,
    OrganizationRolesController,
    PublicInvitesController,
    IamAccessReviewController,
    IamTeamController,
  ],
  providers: [
    UsersService,
    OrganizationInviteService,
    OrganizationRoleService,
    UserAccessAuditService,
    TransactionalMailService,
    InviteRateLimitService,
    InviteEmailOutboxRepository,
    InviteEmailDeliveryService,
    InviteEmailSchedulerService,
    InviteAcceptService,
    IamAuditOutboxRepository,
    IamAuditOutboxProcessorService,
    IamAuditOutboxSchedulerService,
    IamAuditOutboxMetricsService,
    IamAuditService,
    IamMembershipLifecycleService,
    IamMembershipLifecycleNotificationService,
    IamAccessReviewService,
    IamAccessReviewSnapshotService,
    IamTeamService,
  ],
  exports: [
    UsersService,
    OrganizationInviteService,
    OrganizationRoleService,
    UserAccessAuditService,
    IamAuditService,
    IamMembershipLifecycleService,
    IamAuditOutboxRepository,
    IamAuditOutboxProcessorService,
    IamAuditOutboxMetricsService,
  ],
})
export class UsersModule {}
