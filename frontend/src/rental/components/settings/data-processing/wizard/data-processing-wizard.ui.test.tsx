import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY_DATA_PROCESSING_WIZARD_FORM } from '../../../../lib/data-processing-wizard.types';
import { buildDataProcessingPermissions } from '../../../../lib/data-processing-permissions';
import {
  DataProcessingWizardStepProcedure,
  DataProcessingWizardStepPurposeLegal,
  DataProcessingWizardStepRiskReview,
} from './DataProcessingWizardSteps';
import { DataProcessingWizardDialog } from './DataProcessingWizardDialog';

vi.mock('../../../../../components/patterns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../components/patterns')>();
  return {
    ...actual,
    FormDialog: ({
      open,
      children,
      footer,
      title,
      description,
    }: {
      open: boolean;
      children: React.ReactNode;
      footer?: React.ReactNode;
      title?: React.ReactNode;
      description?: React.ReactNode;
    }) =>
      open ? (
        <div data-testid="dp-wizard-dialog">
          <div>{title}</div>
          <div>{description}</div>
          {children}
          {footer}
        </div>
      ) : null,
    ConfirmDialog: () => null,
  };
});

vi.mock('../../../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      if (params) return `${key}:${Object.values(params).join(',')}`;
      return key;
    },
  }),
}));

vi.mock('../../../../lib/data-processing-wizard.api', () => ({
  submitDataProcessingWizardDraft: vi.fn(),
  parseDataProcessingApiError: (error: Error) => error.message,
}));

const permissions = buildDataProcessingPermissions((module, level) => {
  if (module === 'data-authorization' && level === 'read') return true;
  if (module === 'data-authorization' && level === 'write') return true;
  if (module === 'data-authorization' && level === 'manage') return true;
  return false;
});

describe('DataProcessingWizard steps', () => {
  it('renders procedure type step with permission-gated options', () => {
    const html = renderToStaticMarkup(
      <DataProcessingWizardStepProcedure
        form={EMPTY_DATA_PROCESSING_WIZARD_FORM}
        errors={{}}
        onChange={() => {}}
        permissions={permissions}
      />,
    );
    expect(html).toContain('data-testid="dp-wizard-step-1"');
    expect(html).toContain('dataProcessing.wizard.procedure.internal');
    expect(html).toContain('dataProcessing.wizard.procedure.provider');
  });

  it('renders purpose step without auto-filled destination defaults', () => {
    const html = renderToStaticMarkup(
      <DataProcessingWizardStepPurposeLegal
        form={{ ...EMPTY_DATA_PROCESSING_WIZARD_FORM, title: 'Test', activityCode: 'PA-1' }}
        errors={{ title: 'dataProcessing.wizard.errors.title' }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('data-testid="dp-wizard-step-2"');
    expect(html).toContain('dataProcessing.wizard.errors.title');
    expect(html).not.toContain('SynqDrive Platform');
  });

  it('renders review step actions hint without optimistic success', () => {
    const html = renderToStaticMarkup(
      <DataProcessingWizardStepRiskReview
        form={EMPTY_DATA_PROCESSING_WIZARD_FORM}
        errors={{}}
        onChange={() => {}}
        canRequestReview
        submitError="Server rejected review"
      />,
    );
    expect(html).toContain('data-testid="dp-wizard-step-7"');
    expect(html).toContain('Server rejected review');
    expect(html).not.toContain('dataProcessing.wizard.success');
  });
});

describe('DataProcessingWizardDialog', () => {
  it('renders stepper and footer navigation', () => {
    const html = renderToStaticMarkup(
      <DataProcessingWizardDialog
        open
        onOpenChange={() => {}}
        orgId="org-1"
        permissions={permissions}
        onSuccess={async () => {}}
      />,
    );
    expect(html).toContain('data-testid="dp-wizard-stepper"');
    expect(html).toContain('dataProcessing.wizard.next');
    expect(html).toContain('dataProcessing.wizard.cancel');
  });
});
