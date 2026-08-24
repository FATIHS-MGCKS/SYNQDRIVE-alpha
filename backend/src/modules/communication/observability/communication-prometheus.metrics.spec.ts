import { CommunicationEventType } from '@prisma/client';
import { CommunicationNormalizationErrorCode } from '../normalization/communication-normalization.errors';
import {
  normalizeCommunicationAiOperation,
  normalizeCommunicationEventType,
  normalizeProjectionErrorCode,
  recordCommunicationAiOperation,
  recordCommunicationProjection,
} from './communication-prometheus.metrics';

describe('communication-prometheus.metrics (C13.2)', () => {
  function createMetricsMock() {
    return {
      communicationProjectionTotal: { inc: jest.fn() },
      communicationProjectionFailuresTotal: { inc: jest.fn() },
      communicationProjectionLagSeconds: { observe: jest.fn() },
      communicationAiOperationTotal: { inc: jest.fn() },
      communicationAiOperationDurationSeconds: { observe: jest.fn() },
    };
  }

  it('bounds projection event_type labels to CommunicationEventType', () => {
    expect(normalizeCommunicationEventType(CommunicationEventType.MESSAGE_RECEIVED)).toBe(
      CommunicationEventType.MESSAGE_RECEIVED,
    );
    expect(normalizeCommunicationEventType('arbitrary_event_type')).toBe('UNKNOWN_EVENT_TYPE');
  });

  it('bounds projection error_code labels to known codes', () => {
    expect(
      normalizeProjectionErrorCode(CommunicationNormalizationErrorCode.PROJECTION_FAILURE),
    ).toBe(CommunicationNormalizationErrorCode.PROJECTION_FAILURE);
    expect(normalizeProjectionErrorCode('raw exception message')).toBe('PROJECTION_FAILURE');
    expect(normalizeProjectionErrorCode(undefined)).toBe('PROJECTION_FAILURE');
  });

  it('bounds AI operation labels to canonical values', () => {
    expect(normalizeCommunicationAiOperation('intent_detect')).toBe('intent_detect');
    expect(normalizeCommunicationAiOperation('CUSTOM/ARBITRARY')).toBe('unknown');
  });

  it('records projection failures with bounded labels only', () => {
    const metrics = createMetricsMock();
    recordCommunicationProjection(metrics as never, {
      channel: 'WHATSAPP',
      eventType: 'not_a_real_event',
      result: 'failed',
      errorCode: 'sensitive provider payload detail',
    });

    expect(metrics.communicationProjectionFailuresTotal.inc).toHaveBeenCalledWith({
      channel: 'whatsapp',
      event_type: 'UNKNOWN_EVENT_TYPE',
      error_code: 'PROJECTION_FAILURE',
    });
  });

  it('records AI operations with bounded operation label', () => {
    const metrics = createMetricsMock();
    recordCommunicationAiOperation(metrics as never, {
      operation: 'totally/custom/op',
      result: 'failed',
    });

    expect(metrics.communicationAiOperationTotal.inc).toHaveBeenCalledWith({
      operation: 'unknown',
      result: 'failed',
    });
  });
});
