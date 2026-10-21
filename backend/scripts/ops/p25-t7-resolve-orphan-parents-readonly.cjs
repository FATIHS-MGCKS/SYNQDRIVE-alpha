#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

const ORPHANS = [
  {
    shadowId: '8e99057e-5e30-42c6-be54-78c915882f21',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    bindingKey: 'DIMO:device:70140ef81550b3c4e7cbdc26a7f4f8a5',
    parentStateVersion: 1,
  },
  {
    shadowId: '36768f8c-a615-478c-b543-602d7b65f36b',
    vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
    parentStateVersion: 1,
  },
  {
    shadowId: '05abdd1f-ef7f-4d86-87cc-d0cedfd10469',
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    parentStateVersion: 1,
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const out = [];
    for (const o of ORPHANS) {
      let bindingKey = o.bindingKey;
      if (!bindingKey) {
        const shadow = await prisma.deviceConnectionPhysicalStateShadowObservation.findUnique({
          where: { id: o.shadowId },
        });
        bindingKey = shadow?.bindingKey ?? null;
      }
      let parentEvidence = null;
      if (bindingKey) {
        const parent = await prisma.deviceConnectionPhysicalStateTransition.findFirst({
          where: {
            vehicleId: o.vehicleId,
            bindingKey,
            appliedStateVersion: o.parentStateVersion,
          },
        });
        if (parent) {
          parentEvidence = {
            effectiveState: parent.effectiveState,
            evidenceObservedAt: parent.evidenceObservedAt.toISOString(),
            evidenceSource: parent.evidenceSource,
            evidenceReferenceId: parent.evidenceReferenceId,
            stateVersion: o.parentStateVersion,
          };
        }
      }
      out.push({ ...o, bindingKey, parentEvidence });
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
