import { execSync } from 'node:child_process';
import * as path from 'node:path';
import {
  EXP021_FROZEN_M7A_RESEARCH_SHA,
  EXP021_FROZEN_M7A_USED_DEPENDENCY_PATHS,
} from '../exp021-frozen-m7a-used-dependencies';
import { EXP021_FROZEN_M7A_RESEARCH_SHA as RESEARCH_SHA_MANIFEST } from '../exp021-frozen-m7a.manifest';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');

describe('EXP021 frozen M7A — used dependency freeze binding', () => {
  it('pins research SHA and keeps all M7A-used paths identical to freeze commit', () => {
    expect(EXP021_FROZEN_M7A_RESEARCH_SHA).toBe(RESEARCH_SHA_MANIFEST);
    for (const rel of EXP021_FROZEN_M7A_USED_DEPENDENCY_PATHS) {
      const diff = execSync(`git diff ${EXP021_FROZEN_M7A_RESEARCH_SHA} HEAD -- ${rel}`, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      expect(diff.trim()).toBe('');
    }
  });
});
