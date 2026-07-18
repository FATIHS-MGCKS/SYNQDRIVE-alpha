import { useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type { VoiceRemainingMinutes } from '../../../lib/api';

type RemainingMinutesSnapshot = {
  orgId: string;
  loading: boolean;
  minutes: VoiceRemainingMinutes | null;
  error: string | null;
};

const LOADING_SNAPSHOT = (orgId: string): RemainingMinutesSnapshot => ({
  orgId,
  loading: true,
  minutes: null,
  error: null,
});

export function useVoiceRemainingMinutes(orgId: string) {
  const [snapshot, setSnapshot] = useState<RemainingMinutesSnapshot>(() => LOADING_SNAPSHOT(orgId));

  useEffect(() => {
    let cancelled = false;
    void api.voiceAssistant.billing
      .remainingMinutes(orgId)
      .then(data => {
        if (!cancelled) {
          setSnapshot({ orgId, loading: false, minutes: data, error: null });
        }
      })
      .catch(err => {
        if (!cancelled) {
          setSnapshot({ orgId, loading: false, minutes: null, error: getErrorMessage(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (snapshot.orgId !== orgId) {
    return LOADING_SNAPSHOT(orgId);
  }

  return snapshot;
}
