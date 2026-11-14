import { ConfigError } from '@/lib/errors.js';
import type { AppConfig } from '@/types/config.js';

/**
 * Matches the expected `owner/repo` identifier structure: exactly one separator,
 * with no empty or whitespace-only components on either side.
 */
const REPO_FULL_NAME_PATTERN = /^[^\s/]+\/[^\s/]+$/;

/**
 * Resolve the GitHub repo full name (owner/repo) from runtime config.
 * WHY: The CLI relies on a concrete repo to build compare links and PR URLs; we fail fast here.
 * @param appConfig Runtime configuration for the current invocation.
 * @returns Repository slug in the form `owner/repo`.
 */
export function getRepoFullName(appConfig: AppConfig): string {
  const repoFull = appConfig.github.repoFullName;
  if (!repoFull) {
    throw new ConfigError(
      'REPO_FULL_NAME or GITHUB_REPOSITORY is required (owner/repo).',
    );
  }
  if (!REPO_FULL_NAME_PATTERN.test(repoFull)) {
    throw new ConfigError(
      `REPO_FULL_NAME or GITHUB_REPOSITORY must be in owner/repo form (received: "${repoFull}").`,
    );
  }
  return repoFull;
}
