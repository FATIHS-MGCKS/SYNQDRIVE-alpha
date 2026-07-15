import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
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
  const [mutating, setMutating] = useState(false);
  const [mutatingAction, setMutatingAction] = useState<DamageMutationAction | null>(null);
  const mutationSeq = useRef(0);

  const runMutation = useCallback(
    async <T>(
      action: DamageMutationAction,
      fn: () => Promise<T>,
      successMessage: string,
      successDescription?: string,
    ): Promise<T> => {
      if (!vehicleId) {
        const err = new Error('No vehicle selected.');
        toast.error('Action failed', { description: err.message });
        throw err;
      }
      const seq = ++mutationSeq.current;
      setMutating(true);
      setMutatingAction(action);
      try {
        const result = await fn();
        if (seq !== mutationSeq.current) return result;
        await reload();
        toast.success(successMessage, successDescription ? { description: successDescription } : undefined);
        return result;
      } catch (error) {
        const message = formatApiError(error);
        toast.error('Action failed', { description: message });
        throw error;
      } finally {
        if (seq === mutationSeq.current) {
          setMutating(false);
          setMutatingAction(null);
        }
      }
    },
    [vehicleId, reload],
  );

  const createDamage = useCallback(
    (input: CreateVehicleDamageInput) =>
      runMutation(
        'create',
        () => api.vehicleIntelligence.createVehicleDamage(vehicleId!, input),
        'Damage recorded',
        'Open the detail drawer to add photos or refine placement.',
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
        'Damage positioned',
        `${input.locationView} view · ${input.locationX.toFixed(0)}%, ${input.locationY.toFixed(0)}%`,
      ),
    [vehicleId, runMutation],
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
        'Photo added',
        'Evidence gallery updated.',
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
        'Marked in repair',
      ),
    [vehicleId, runMutation],
  );

  const markRepaired = useCallback(
    (damageId: string, input: MarkDamageRepairedInput = {}) =>
      runMutation(
        'markRepaired',
        () => api.vehicleIntelligence.markDamageRepaired(vehicleId!, damageId, input),
        'Damage marked repaired',
        'Moved to repaired history.',
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
        'Damage archived',
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
        'Liability updated',
        'Operator decision saved — no automatic billing applied.',
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
        'Deposit hold prepared',
        'Amount recorded on damage only — deposit workflow not charged automatically.',
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
        'Customer charge prepared',
        'Amount recorded on damage only — no invoice generated automatically.',
      ),
    [vehicleId, runMutation],
  );

  const createRepairTask = useCallback(
    async (damage: DamageResponse, input: CreateRepairTaskInput = {}) => {
      if (!orgId) {
        toast.error('Action failed', { description: 'Organization context missing.' });
        throw new Error('No org');
      }
      if (!canCreateRepairTaskForDamage(damage)) {
        const message = damage.taskId
          ? 'This damage already has a linked repair task.'
          : 'This damage cannot receive a repair task.';
        toast.error('Task not created', { description: message });
        throw new Error(message);
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
        'Repair task created',
        'Linked to this damage record.',
      );
    },
    [orgId, vehicleId, runMutation],
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
