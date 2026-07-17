import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateVoiceAssistantDto, ListVoiceConversationsQueryDto } from './voice-assistant.dto';
import {
  AssignPhoneNumberDto,
  InitiateTwilioOutboundCallDto,
  UpdateTelephonySettingsDto,
} from './voice-assistant-telephony.dto';

async function validateDto<T extends object>(cls: new () => T, payload: object) {
  const dto = plainToInstance(cls, payload);
  return validate(dto);
}

describe('Voice assistant DTO characterization', () => {
  describe('UpdateVoiceAssistantDto', () => {
    it('accepts valid escalation phone numbers', async () => {
      const errors = await validateDto(UpdateVoiceAssistantDto, {
        escalationPhone: '+49 170 1234567',
      });
      expect(errors.length).toBe(0);
    });

    it('rejects invalid escalation phone format', async () => {
      const errors = await validateDto(UpdateVoiceAssistantDto, {
        escalationPhone: 'not-a-phone',
      });
      expect(errors.some((e) => e.property === 'escalationPhone')).toBe(true);
    });

    it('rejects non-uuid escalationUserId', async () => {
      const errors = await validateDto(UpdateVoiceAssistantDto, {
        escalationUserId: 'not-a-uuid',
      });
      expect(errors.some((e) => e.property === 'escalationUserId')).toBe(true);
    });

    it('rejects language values exceeding max length', async () => {
      const errors = await validateDto(UpdateVoiceAssistantDto, {
        language: 'a'.repeat(17),
      });
      expect(errors.some((e) => e.property === 'language')).toBe(true);
    });

    it('rejects voiceId values exceeding max length', async () => {
      const errors = await validateDto(UpdateVoiceAssistantDto, {
        voiceId: 'v'.repeat(121),
      });
      expect(errors.some((e) => e.property === 'voiceId')).toBe(true);
    });
  });

  describe('AssignPhoneNumberDto', () => {
    it('requires non-empty phoneNumberId', async () => {
      const errors = await validateDto(AssignPhoneNumberDto, { phoneNumberId: '' });
      expect(errors.some((e) => e.property === 'phoneNumberId')).toBe(true);
    });

    it('accepts elevenlabs or twilio provider', async () => {
      const errors = await validateDto(AssignPhoneNumberDto, {
        phoneNumberId: 'pn-1',
        provider: 'twilio',
      });
      expect(errors.length).toBe(0);
    });

    it('rejects unknown provider values', async () => {
      const errors = await validateDto(AssignPhoneNumberDto, {
        phoneNumberId: 'pn-1',
        provider: 'vonage',
      });
      expect(errors.some((e) => e.property === 'provider')).toBe(true);
    });
  });

  describe('InitiateTwilioOutboundCallDto', () => {
    it('rejects destination shorter than minimum length', async () => {
      const errors = await validateDto(InitiateTwilioOutboundCallDto, { to: '12' });
      expect(errors.some((e) => e.property === 'to')).toBe(true);
    });

    it('accepts plausible E.164 destination', async () => {
      const errors = await validateDto(InitiateTwilioOutboundCallDto, {
        to: '+491701234567',
      });
      expect(errors.length).toBe(0);
    });
  });

  describe('UpdateTelephonySettingsDto', () => {
    it('accepts boolean telephony flags', async () => {
      const errors = await validateDto(UpdateTelephonySettingsDto, {
        telephonyEnabled: true,
        inboundEnabled: false,
        outboundEnabled: true,
      });
      expect(errors.length).toBe(0);
    });
  });

  describe('ListVoiceConversationsQueryDto', () => {
    it('coerces escalatedOnly query string to boolean', async () => {
      const dto = plainToInstance(ListVoiceConversationsQueryDto, { escalatedOnly: 'true' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.escalatedOnly).toBe(true);
    });

    it('rejects limit above maximum', async () => {
      const errors = await validateDto(ListVoiceConversationsQueryDto, { limit: 500 });
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });
});
