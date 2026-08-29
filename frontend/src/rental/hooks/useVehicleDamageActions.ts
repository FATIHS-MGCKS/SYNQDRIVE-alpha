import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '../../i18n/LanguageContext';
import { api } from '../../lib/api';
import type {
  CreateVehicleDamageInput,
  DamageLocationView,
  DamageLiabilityStatus,
  DamageResponse,
  MarkDamageRepairedInput,
  PlaceDamageOnVehicleInput,
} from '../lib/damage.types';
import { formatApiError, readFileAsDataUrl } from '../lib/damage-image.utils';
import type { VehicleExteriorViewKey } from '../../lib/api';
import {
  canCreateRepairTaskForDamage,
  type CreateRepairTaskInput,
} from '../lib/damage-repair-task';
import {
  resolveDamageHostError,
  resolveDamageLocationViewLabel,
  resolveDamageToastError,
  resolveDamageToastSuccess,
  type VehicleDamageHostErrorKey,
  type VehicleDamageToastSuccessKey,
} from '../lib/rental-vehicle-damages-i18n';

export type DamageMutationAction =
  | 'create'
  | 'place'
  | 'addPhoto'
  | 'markRepaired'
  | 'markInRepair'
  | 'archive'
  | 'createTask'
  | 'updateLiability'
  | 'prepareDeposit'
  | 'prepareCharge';

interface UseVehicleDamageActionsOptions {
  vehicleId: string | undefined;
  orgId: string | undefined;
  reload: () => Promise<void>;
}

export function useVehicleDamageActions({
  vehicleId,
  orgId,
  reload,
}: UseVehicleDamageActionsOptions) {
  const { t } = useLanguage();
  const [mutating, setMutating] = useState(false);
  const [mutatingAction, setMutatingAction] = useState<DamageMutationAction | null>(null);
  const mutationSeq = useRef(0);

  const runMutation = useCallback(
    async <T>(
      action: DamageMutationAction,
      fn: () => Promise<T>,
      successKey: VehicleDamageToastSuccessKey,
      successDescriptionKey?: VehicleDamageToastSuccessKey,
      successDescriptionVars?: Record<string, string | number>,
    ): Promise<T> => {
      if (!vehicleId) {
        const message = resolveDamageHostError('vehicleDamages.hostError.noVehicle', null, t);
        toast.error(resolveDamageToastError('tasks.detail.toast.actionFailed', t), {
          description: message ?? undefined,
        });
        throw new Error('No vehicle selected.');
      }
      const seq = ++mutationSeq.current;
      setMutating(true);
      setMutatingAction(action);
      try {
        const result = await fn();
        if (seq !== mutationSeq.current) return result;
        await reload();
        toast.success(resolveDamageToastSuccess(successKey, t), successDescriptionKey
          ? {
              description: resolveDamageToastSuccess(
                successDescriptionKey,
                t,
                successDescriptionVars,
              ),
            }
          : undefined);
        return result;
      } catch (error) {
        const message = formatApiError(error);
        toast.error(resolveDamageToastError('tasks.detail.toast.actionFailed', t), {
          description: message,
        });
        throw error;
      } finally {
        if (seq === mutationSeq.current) {
          setMutating(false);
          setMutatingAction(null);
        }
      }
    },
    [vehicleId, reload, t],
  );

  const createDamage = useCallback(
    (input: CreateVehicleDamageInput) =>
      runMutation(
        'create',
        () => api.vehicleIntelligence.createVehicleDamage(vehicleId!, input),
        'vehicleDamages.toast.damageRecorded',
        'vehicleDamages.toast.damageRecordedDescription',
      ),
    [vehicleId, runMutation],
  );

  const placeDamage = useCallback(
    (damageId: string, input: PlaceDamageOnVehicleInput) =>
      runMutation(
        'place',
        async () => {
          await api.vehicleIntelligence.placeVehicleDamage(vehicleId!, damageId, input);
        },
        'vehicleDamages.toast.damagePositioned',
        'vehicleDamages.toast.damagePositionedDescription',
        {
          view: resolveDamageLocationViewLabel(t, input.locationView),
          x: input.locationX.toFixed(0),
          y: input.locationY.toFixed(0),
        },
      ),
    [vehicleId, runMutation, t],
  );

  const placeDamageOnCanvas = useCallback(
    (damageId: string, x: number, y: number, view: VehicleExteriorViewKey) =>
      placeDamage(damageId, {
        locationView: view as DamageLocationView,
        locationX: Math.round(x * 10) / 10,
        locationY: Math.round(y * 10) / 10,
      }),
    [placeDamage],
  );

  const addPhoto = useCallback(
    async (damageId: string, file: File, caption?: string) => {
      const imageData = await readFileAsDataUrl(file);
      return runMutation(
        'addPhoto',
        () =>
          api.vehicleIntelligence.addDamageImage(vehicleId!, damageId, {
            imageData,
            caption,
          }),
        'vehicleDamages.toast.photoAdded',
        'vehicleDamages.toast.photoAddedDescription',
      );
    },
    [vehicleId, runMutation],
  );

  const markInRepair = useCallback(
    (damageId: string) =>
      runMutation(
        'markInRepair',
        () =>
          api.vehicleIntelligence.updateVehicleDamage(vehicleId!, damageId, {
            status: 'IN_REPAIR',
            repairStartedAt: new Date().toISOString(),
          }),
        'vehicleDamages.toast.markedInRepair',
      ),
    [vehicleId, runMutation],
  );

  const markRepaired = useCallback(
    (damageId: string, input: MarkDamageRepairedInput = {}) =>
      runMutation(
        'markRepaired',
        () => api.vehicleIntelligence.markDamageRepaired(vehicleId!, damageId, input),
        'vehicleDamages.toast.markedRepaired',
        'vehicleDamages.toast.markedRepairedDescription',
      ),
    [vehicleId, runMutation],
  );

  const archiveDamage = useCallback(
    (damageId: string) =>
      runMutation(
        'archive',
        () =>
          api.vehicleIntelligence.updateVehicleDamage(vehicleId!, damageId, {
            status: 'ARCHIVED',
          }),
        'vehicleDamages.toast.archived',
      ),
    [vehicleId, runMutation],
  );

  const updateLiability = useCallback(
    (damageId: string, input: { liabilityStatus: DamageLiabilityStatus; liabilityNote?: string }) =>
      runMutation(
        'updateLiability',
        () =>
          api.vehicleIntelligence.updateVehicleDamage(vehicleId!, damageId, {
            liabilityStatus: input.liabilityStatus,
            liabilityNote: input.liabilityNote ?? null,
          }),
        'vehicleDamages.toast.liabilityUpdated',
        'vehicleDamages.toast.liabilityUpdatedDescription',
      ),
    [vehicleId, runMutation],
  );

  const prepareDepositHold = useCallback(
    (damageId: string, depositHoldCents: number) =>
      runMutation(
        'prepareDeposit',
        () =>
          api.vehicleIntelligence.updateVehicleDamage(vehicleId!, damageId, {
            depositHoldCents,
          }),
        'vehicleDamages.toast.depositPrepared',
        'vehicleDamages.toast.depositPreparedDescription',
      ),
    [vehicleId, runMutation],
  );

  const prepareCustomerCharge = useCallback(
    (damageId: string, chargedToCustomerCents: number) =>
      runMutation(
        'prepareCharge',
        () =>
          api.vehicleIntelligence.updateVehicleDamage(vehicleId!, damageId, {
            chargedToCustomerCents,
          }),
        'vehicleDamages.toast.chargePrepared',
        'vehicleDamages.toast.chargePreparedDescription',
      ),
    [vehicleId, runMutation],
  );

  const createRepairTask = useCallback(
    async (damage: DamageResponse, input: CreateRepairTaskInput = {}) => {
      if (!orgId) {
        const message = resolveDamageHostError('vehicleDamages.hostError.orgMissing', null, t);
        toast.error(resolveDamageToastError('tasks.detail.toast.actionFailed', t), {
          description: message ?? undefined,
        });
        throw new Error('No org');
      }
      if (!canCreateRepairTaskForDamage(damage)) {
        const hostKey: VehicleDamageHostErrorKey = damage.taskId
          ? 'vehicleDamages.hostError.taskAlreadyLinked'
          : 'vehicleDamages.hostError.taskNotEligible';
        const message = resolveDamageHostError(hostKey, null, t);
        toast.error(resolveDamageToastError('vehicleDamages.toast.taskNotCreated', t), {
          description: message ?? undefined,
        });
        throw new Error(message ?? 'Task not created');
      }
      return runMutation(
        'createTask',
        async () => {
          const result = await api.vehicleIntelligence.createDamageRepairTask(vehicleId!, damage.id, {
            dueDate: input.dueDate,
            vendorId: input.vendorId,
            note: input.note,
          });
          return { id: result.taskId, damage: result.damage };
        },
        'vehicleDamages.toast.repairTaskCreated',
        'vehicleDamages.toast.repairTaskCreatedDescription',
      );
    },
    [orgId, vehicleId, runMutation, t],
  );

  return {
    mutating,
    mutatingAction,
    createDamage,
    placeDamage,
    placeDamageOnCanvas,
    addPhoto,
    markInRepair,
    markRepaired,
    archiveDamage,
    updateLiability,
    prepareDepositHold,
    prepareCustomerCharge,
    createRepairTask,
  };
}
