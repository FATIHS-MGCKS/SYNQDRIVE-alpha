/**
 * Fail-closed Git source reads for PR gate base/head snapshots.
 */

export class GitSourceReadFailureError extends Error {
  constructor(repoPath, ref, cause) {
    super(`GIT_SOURCE_READ_FAILURE: ${ref}:${repoPath}`);
    this.name = 'GitSourceReadFailureError';
    this.code = 'GIT_SOURCE_READ_FAILURE';
    this.repoPath = repoPath;
    this.ref = ref;
    this.cause = cause;
  }
}

/**
 * Read a repository path at a ref.
 * Expected absence must be represented by a null repoPath before calling.
 * @param {(repo: string, args: string[]) => string} gitExec
 */
export function readSourceAtRef(gitExec, repo, ref, repoPath, { mustExist = true } = {}) {
  if (!repoPath) {
    return null;
  }
  try {
    return gitExec(repo, ['show', `${ref}:${repoPath}`]);
  } catch (error) {
    if (mustExist) {
      throw new GitSourceReadFailureError(repoPath, ref, error);
    }
    return null;
  }
}

export function resolveSourceExpectations(unit) {
  switch (unit.type) {
    case 'rename':
      return { baseMustExist: true, headMustExist: true };
    case 'copy':
      return { baseMustExist: false, headMustExist: true };
    case 'delete':
      return { baseMustExist: true, headMustExist: false };
    case 'modify':
      return {
        baseMustExist: unit.baseRelPath != null,
        headMustExist: unit.headRelPath != null,
      };
    default:
      return { baseMustExist: false, headMustExist: false };
  }
}
