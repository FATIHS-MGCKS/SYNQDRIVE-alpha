import type { PrismaClient } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { MasterAdminAuditOutboxProcessorService } from '@modules/activity-log/master-admin-audit-outbox.processor';
import { MasterAdminAuditDeliveryService } from '@modules/activity-log/master-admin-audit-delivery.service';
import { MasterAdminAuditOutboxRepository } from '@modules/activity-log/master-admin-audit-outbox.repository';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';
import { PasswordResetService } from '@modules/auth/password-reset.service';
import { PasswordResetRateLimitService } from '@modules/auth/password-reset-rate-limit.service';
import { IamAuditOutboxMetricsService } from '@modules/users/iam-audit-outbox.metrics';
import { IamAuditOutboxProcessorService } from '@modules/users/iam-audit-outbox.processor';
import { IamAuditOutboxRepository } from '@modules/users/iam-audit-outbox.repository';
import { IamAuditService } from '@modules/users/iam-audit.service';
import { IamMembershipLifecycleService } from '@modules/users/iam-membership-lifecycle.service';
import { IamMembershipLifecycleNotificationService } from '@modules/users/iam-membership-lifecycle-notification.service';
import { InviteEmailDeliveryService } from '@modules/users/invite-email-delivery.service';
import { InviteEmailOutboxRepository } from '@modules/users/invite-email-outbox.repository';
import { InviteRateLimitService } from '@modules/users/invite-rate-limit.service';
import { OrganizationInviteService } from '@modules/users/organization-invite.service';
import { OrganizationRoleService } from '@modules/users/organization-role.service';
import { OrganizationRoleVersionService } from '@modules/users/organization-role-version.service';
import { TransactionalMailService } from '@modules/users/transactional-mail.service';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { UsersService } from '@modules/users/users.service';
import { MasterGlobalIdentityService } from '../master-global-identity.service';
import { MasterCredentialSetupDeliveryService } from '../master-credential-setup-delivery.service';
import { InviteAcceptService } from '../invite-accept.service';
import { createUsrP2PgIamStack } from './usr-p2-pg-iam-stack.helper';

export type UsrP3a3IdentityPgStack = {
  prisma: PrismaClient;
  authority: ReturnType<typeof createUsrP2PgIamStack>['authority'];
  globalIdentity: MasterGlobalIdentityService;
  auditDelivery: MasterAdminAuditDeliveryService;
  maProcessor: MasterAdminAuditOutboxProcessorService;
  usersService: UsersService;
  inviteService: OrganizationInviteService;
  passwordReset: PasswordResetService;
  inviteDelivery: InviteEmailDeliveryService;
  inviteOutbox: InviteEmailOutboxRepository;
  iamAudit: IamAuditService;
  userAudit: UserAccessAuditService;
  noopMail: TransactionalMailService;
  inviteAccept: InviteAcceptService;
  lifecycle: IamMembershipLifecycleService;
};

/** Real canonical IAM + identity stack; only external mail transport is mocked. */
export function createUsrP3a3IdentityPgStack(
  prisma: PrismaClient,
  jwtSecret = 'usr-p3a3-pg-secret',
): UsrP3a3IdentityPgStack {
  const noopMail = {
    sendOrganizationInvite: jest.fn().mockResolvedValue({ sent: true, fallback: false }),
    sendPasswordReset: jest.fn().mockResolvedValue({ sent: true, fallback: false }),
    sendPasswordResetCompleted: jest.fn().mockResolvedValue({ sent: true, fallback: false }),
    sendGeneric: jest.fn().mockResolvedValue({ sent: true, fallback: false }),
  } as unknown as TransactionalMailService;

  const auditService = new AuditService(prisma as never);
  const userAudit = new UserAccessAuditService(auditService);

  const iamOutboxRepo = new IamAuditOutboxRepository(prisma as never);
  const iamMetrics = new IamAuditOutboxMetricsService();
  const iamOutboxProcessor = new IamAuditOutboxProcessorService(
    prisma as never,
    iamOutboxRepo,
    userAudit,
    iamMetrics,
  );
  const iamAudit = new IamAuditService(iamOutboxRepo, iamOutboxProcessor);

  const p2Stack = createUsrP2PgIamStack(prisma, jwtSecret);
  const { sessionPolicy, authority } = p2Stack;

  const passwordPolicy = new PasswordPolicyService();
  const passwordReset = new PasswordResetService(
    prisma as never,
    passwordPolicy,
    new PasswordResetRateLimitService(prisma as never),
    noopMail,
    sessionPolicy,
    userAudit,
  );

  const lifecycle = new IamMembershipLifecycleService(
    prisma as never,
    iamAudit,
    new IamMembershipLifecycleNotificationService(prisma as never),
    sessionPolicy,
  );

  const usersService = new UsersService(
    prisma as never,
    iamAudit,
    lifecycle,
    passwordReset,
    sessionPolicy,
  );

  const roleService = new OrganizationRoleService(
    prisma as never,
    userAudit,
    new OrganizationRoleVersionService(prisma as never),
  );

  const inviteOutbox = new InviteEmailOutboxRepository(prisma as never);
  const inviteDelivery = new InviteEmailDeliveryService(prisma as never, inviteOutbox, noopMail);
  const inviteService = new OrganizationInviteService(
    prisma as never,
    roleService,
    iamAudit,
    new InviteRateLimitService(prisma as never),
    inviteDelivery,
    inviteOutbox,
  );

  const maOutboxRepo = new MasterAdminAuditOutboxRepository(prisma as never);
  const maProcessor = new MasterAdminAuditOutboxProcessorService(prisma as never, maOutboxRepo);
  const auditDelivery = new MasterAdminAuditDeliveryService(prisma as never, maOutboxRepo, maProcessor);

  const credentialSetupDelivery = new MasterCredentialSetupDeliveryService(
    prisma as never,
    passwordReset,
  );

  const globalIdentity = new MasterGlobalIdentityService(
    prisma as never,
    usersService,
    inviteService,
    iamAudit,
    auditDelivery,
    passwordReset,
    credentialSetupDelivery,
  );

  const inviteAccept = new InviteAcceptService(
    prisma as never,
    lifecycle,
    iamAudit,
    passwordPolicy,
    authority,
  );

  return {
    prisma,
    authority,
    globalIdentity,
    auditDelivery,
    maProcessor,
    usersService,
    inviteService,
    passwordReset,
    inviteDelivery,
    inviteOutbox,
    iamAudit,
    userAudit,
    noopMail,
    inviteAccept,
    lifecycle,
  };
}