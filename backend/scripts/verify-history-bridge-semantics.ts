/**
 * Fail-closed exact semantic verification for pending schema-history bridge objects.
 */
import { PrismaClient } from '@prisma/client';
import {
  verifyDriveTypeExactSemantics,
  verifyShortCodeExactSemantics,
} from './history-bridge-canonical-semantics';

async function main() {
  const target = process.argv[2] ?? 'all';
  const prisma = new PrismaClient();
  if (target === 'short_code' || target === 'all') {
    await verifyShortCodeExactSemantics(prisma);
    console.log('short_code exact semantic parity OK');
  }
  if (target === 'drive_type' || target === 'all') {
    await verifyDriveTypeExactSemantics(prisma);
    console.log('drive_type exact semantic parity OK');
  }
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { verifyDriveTypeExactSemantics, verifyShortCodeExactSemantics } from './history-bridge-canonical-semantics';
