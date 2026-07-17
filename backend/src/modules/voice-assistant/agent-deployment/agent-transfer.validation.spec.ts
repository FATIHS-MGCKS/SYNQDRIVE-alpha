import { BadRequestException } from '@nestjs/common';
import { buildCanonicalAgentConfigFromAssistant } from './agent-config.builder';
import {
  assertOrgBoundTransferTarget,
  assertTransferLoopProtection,
  collectInboundLoopNumbers,
} from './agent-transfer.validation';

const ORG_ID = 'org-transfer-1';

function makePrisma() {
  return {
    voiceAssistant: {
      findUnique: jest.fn(),
    },
    station: {
      findFirst: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
    },
    organizationRole: {
      findFirst: jest.fn(),
    },
    voicePhoneNumber: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
}

describe('agent-transfer.validation', () => {
  it('rejects foreign organization staff user targets', async () => {
    const prisma = makePrisma();
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      assertOrgBoundTransferTarget(prisma, ORG_ID, {
        type: 'STAFF_USER',
        userId: 'foreign-user',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks transfer loop to inbound assistant number', () => {
    expect(() =>
      assertTransferLoopProtection({
        transfer: {
          rules: [
            {
              ruleId: 'loop',
              condition: 'test',
              target: { type: 'PHONE', phoneE164: '+491701234567' },
            },
          ],
          loopProtectionEnabled: true,
        },
        resolvedTargets: [
          {
            ruleId: 'loop',
            destinationKey: 'PHONE:+491701234567',
            maskedDestination: '+491***67',
            e164: '+491701234567',
          },
        ],
        inboundNumbers: new Set(['+491701234567']),
      }),
    ).toThrow(BadRequestException);
  });

  it('collects inbound numbers from assistant and phone inventory', async () => {
    const prisma = makePrisma();
    prisma.voiceAssistant.findUnique.mockResolvedValue({
      phoneNumber: '+491701111111',
    });
    prisma.voicePhoneNumber.findMany.mockResolvedValue([
      { protectedE164: '+491703333333', maskedPhoneNumber: null },
    ]);

    const numbers = await collectInboundLoopNumbers(prisma, ORG_ID);
    expect(numbers.has('+491701111111')).toBe(true);
    expect(numbers.has('+491703333333')).toBe(true);
    expect(numbers.has('+491702222222')).toBe(false);
  });

  it('accepts org-bound escalation phone from assistant defaults', async () => {
    const prisma = makePrisma();
    const assistant = {
      organizationId: ORG_ID,
      escalationPhone: '+491234567890',
      name: 'Assistant',
      language: 'de',
      escalateOnRequest: true,
      escalateOnLowConf: false,
      escalateOnSensitive: false,
    } as any;
    const config = buildCanonicalAgentConfigFromAssistant(assistant);

    prisma.voiceAssistant.findUnique.mockResolvedValue({
      escalationPhone: '+491234567890',
      phoneNumber: null,
    });
    prisma.station.findFirst.mockResolvedValue(null);
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    prisma.voicePhoneNumber.findFirst.mockResolvedValue(null);

    await assertOrgBoundTransferTarget(prisma, ORG_ID, {
      type: 'PHONE',
      phoneE164: '+491234567890',
    });

    expect(config.transfer?.rules.length).toBe(1);
  });
});
