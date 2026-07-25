import {
  assessWorkflowSensitivity,
  requiresMakerCheckerForPublish,
  resolveActionOperation,
} from './workflow-maker-checker.constants';

describe('workflow-maker-checker policy', () => {
  it('requires maker-checker for HIGH and CRITICAL publish', () => {
    expect(
      requiresMakerCheckerForPublish(
        assessWorkflowSensitivity([{ type: 'email.send' }]),
      ),
    ).toBe(true);
    expect(
      requiresMakerCheckerForPublish(
        assessWorkflowSensitivity([{ type: 'task.create' }]),
      ),
    ).toBe(false);
    expect(
      requiresMakerCheckerForPublish(
        assessWorkflowSensitivity([{ type: 'ai.suggest_action' }]),
      ),
    ).toBe(true);
  });

  it('maps protected runtime operations', () => {
    expect(resolveActionOperation('voice.call.start')).toBe('WORKFLOW_APPROVE_AI_CALL');
    expect(resolveActionOperation('booking.cancel')).toBe('WORKFLOW_BOOKING_CANCEL');
    expect(resolveActionOperation('whatsapp.ai_message.send')).toBe(
      'WORKFLOW_ACTIVATE_EXTERNAL_AI',
    );
  });
});
