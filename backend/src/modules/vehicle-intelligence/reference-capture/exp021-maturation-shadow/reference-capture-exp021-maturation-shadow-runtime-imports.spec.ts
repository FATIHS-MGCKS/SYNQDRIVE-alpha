import * as fs from 'fs';
import * as path from 'path';

describe('EXP-021 maturation shadow runtime import boundaries (PR-M1)', () => {
  const shadowDir = path.join(__dirname);
  const persistenceFiles = [
    'reference-capture-exp021-maturation-shadow.repository.ts',
    'reference-capture-exp021-maturation-shadow.types.ts',
  ];

  for (const file of persistenceFiles) {
    it(`${file} does not import provider acquisition or BullMQ`, () => {
      const source = fs.readFileSync(path.join(shadowDir, file), 'utf8');
      expect(source).not.toMatch(/@nestjs\/bullmq/);
      expect(source).not.toMatch(/reference-capture-acquisition/);
      expect(source).not.toMatch(/dimo/i);
      expect(source).not.toMatch(/graphql/i);
    });
  }
});
