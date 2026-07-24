import { api } from '../../lib/api';
import type { DataProcessingWizardForm, DataProcessingWizardSubmitResult } from './data-processing-wizard.types';
import {
  buildConsentPayload,
  buildDpaPayload,
  buildLegalBasisPayload,
  buildLegacyAuthorizationPayload,
  buildProviderGrantPayload,
  buildRegisterCreatePayload,
  buildRetentionPolicyPayload,
  parseDataProcessingApiError,
} from './data-processing-wizard.utils';

export async function submitDataProcessingWizardDraft(
  orgId: string,
  form: DataProcessingWizardForm,
  options?: { requestReview?: boolean },
): Promise<DataProcessingWizardSubmitResult> {
  const registerPayload = buildRegisterCreatePayload(form);
  const activity = await api.dataProcessing.register.create(orgId, registerPayload);
  const processingActivityId = activity.id;

  try {
    if (form.legalBasisType) {
      await api.dataProcessing.legalBasis.create(
        orgId,
        processingActivityId,
        buildLegalBasisPayload(form),
      );
    }

    const retentionPayload = buildRetentionPolicyPayload(form);
    if (retentionPayload) {
      await api.dataProcessing.retention.upsertPolicy(orgId, processingActivityId, retentionPayload);
    }

    const providerPayload = buildProviderGrantPayload(form, processingActivityId);
    if (providerPayload) {
      await api.dataProcessing.providerGrant.create(orgId, providerPayload);
    }

    const dpaPayload = buildDpaPayload(form, processingActivityId);
    if (dpaPayload) {
      await api.dataProcessing.dpa.create(orgId, dpaPayload);
    }

    const legacyPayload = buildLegacyAuthorizationPayload(form);
    if (legacyPayload) {
      await api.dataAuthorizations.create(orgId, legacyPayload);
    }

    const consentPayload = buildConsentPayload(form);
    if (consentPayload) {
      await api.dataProcessing.consent.create(orgId, processingActivityId, consentPayload);
    }

    let reviewSubmitted = false;
    if (options?.requestReview) {
      await api.dataProcessing.review.submitActivity(orgId, processingActivityId);
      reviewSubmitted = true;
    }

    return { processingActivityId, reviewSubmitted };
  } catch (error) {
    const detail = parseDataProcessingApiError(error);
    throw new Error(
      `Processing activity ${processingActivityId} was created, but follow-up steps failed: ${detail}`,
    );
  }
}

export { parseDataProcessingApiError };
