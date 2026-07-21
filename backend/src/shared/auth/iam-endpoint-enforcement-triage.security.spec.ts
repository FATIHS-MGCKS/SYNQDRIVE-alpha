import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { ChatController } from '@modules/ai/chat/chat.controller';
import { WhatsAppController } from '@modules/whatsapp/whatsapp.controller';
import { IntegrationsController } from '@modules/integrations/integrations.controller';
import { FinesController } from '@modules/fines/fines.controller';
import { DocumentsController } from '@modules/documents/documents.controller';
import { VehiclesController } from '@modules/vehicles/vehicles.controller';
import { PublicInvitesController } from '@modules/users/public-invites.controller';
import { UsersController } from '@modules/users/users.controller';
import { VoiceMcpGatewayController } from '@modules/voice-mcp-gateway/voice-mcp-gateway.controller';
import { WhatsAppWebhookController } from '@modules/whatsapp/whatsapp-webhook.controller';
import { PERMISSION_KEY } from '@shared/decorators/require-permission.decorator';

function controllerGuards(controller: Function): Function[] {
  return (Reflect.getMetadata('__guards__', controller) ?? []) as Function[];
}

function handlerGuards(controller: Function, method: string): Function[] {
  const proto = controller.prototype;
  return (Reflect.getMetadata('__guards__', proto[method]) ?? []) as Function[];
}

function handlerPermission(controller: Function, method: string) {
  const proto = controller.prototype;
  return Reflect.getMetadata(PERMISSION_KEY, proto[method]);
}

describe('IAM endpoint enforcement triage — confirmed guard hardening', () => {
  it('ChatController requires OrgScopingGuard and PermissionsGuard', () => {
    const guards = controllerGuards(ChatController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
    expect(handlerPermission(ChatController, 'sendMessage')).toEqual({
      module: 'ai-assistant',
      level: 'write',
    });
  });

  it('WhatsAppController requires OrgScopingGuard and PermissionsGuard', () => {
    const guards = controllerGuards(WhatsAppController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
    expect(handlerPermission(WhatsAppController, 'connect')).toEqual({
      module: 'data-authorization',
      level: 'manage',
    });
    expect(handlerPermission(WhatsAppController, 'sendMessage')).toEqual({
      module: 'ai-assistant',
      level: 'write',
    });
  });

  it('IntegrationsController protects org integration secrets', () => {
    expect(handlerGuards(IntegrationsController, 'disconnect')).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
    expect(handlerPermission(IntegrationsController, 'disconnect')).toEqual({
      module: 'data-authorization',
      level: 'manage',
    });
  });

  it('FinesController scopes upload/read/update with fines permissions', () => {
    expect(handlerGuards(FinesController, 'uploadFile')).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
    expect(handlerPermission(FinesController, 'uploadFile')).toEqual({
      module: 'fines',
      level: 'write',
    });
    expect(handlerPermission(FinesController, 'findOne')).toEqual({
      module: 'fines',
      level: 'read',
    });
  });

  it('DocumentsController protects download/metadata paths', () => {
    expect(controllerGuards(DocumentsController)).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
    expect(handlerPermission(DocumentsController, 'download')).toEqual({
      module: 'bookings',
      level: 'read',
    });
  });

  it('VehiclesController protects org write paths missing guards before', () => {
    expect(handlerGuards(VehiclesController, 'deleteByOrg')).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
    expect(handlerPermission(VehiclesController, 'deleteByOrg')).toEqual({
      module: 'fleet',
      level: 'manage',
    });
    expect(handlerGuards(VehiclesController, 'registerFromDimo')).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
  });
});

describe('IAM endpoint enforcement triage — expected public/service paths', () => {
  it('PublicInvitesController remains unguarded for validate/accept', () => {
    expect(controllerGuards(PublicInvitesController)).toEqual([]);
  });

  it('UsersController org routes keep OrgScopingGuard on write handlers', () => {
    expect(handlerGuards(UsersController, 'orgCreate')).toEqual(
      expect.arrayContaining([OrgScopingGuard, PermissionsGuard]),
    );
  });

  it('Voice MCP gateway relies on bearer token service-level auth', () => {
    expect(controllerGuards(VoiceMcpGatewayController)).toEqual([]);
  });

  it('WhatsApp webhook controller remains unsigned-route separate from user permissions', () => {
    expect(controllerGuards(WhatsAppWebhookController)).toEqual([]);
  });
});

describe('IAM endpoint enforcement triage — fines tenant scope', () => {
  const prisma = {
    fine: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects cross-tenant fine lookup', async () => {
    const { FinesService } = await import('@modules/fines/fines.service');
    const service = new FinesService(prisma as never, { create: jest.fn() } as never);
    prisma.fine.findFirst.mockResolvedValue(null);

    await expect(service.findById('org-a', 'fine-foreign')).rejects.toThrow('Fine not found');
    expect(prisma.fine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'fine-foreign', organizationId: 'org-a' },
      }),
    );
  });
});
