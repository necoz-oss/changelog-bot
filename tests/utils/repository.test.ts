import { describe, test, expect } from '@jest/globals';
import { EXIT_USAGE } from '@/constants/errors.js';
import { loadAppConfig } from '@/lib/app-config.js';
import { ConfigError } from '@/lib/errors.js';
import { getRepoFullName } from '@/utils/repository.js';

describe('utils/repository.getRepoFullName', () => {
  test('returns REPO_FULL_NAME when set', () => {
    const config = loadAppConfig({ REPO_FULL_NAME: 'owner/repo' });

    const name = getRepoFullName(config);

    expect(name).toBe('owner/repo');
  });

  test('falls back to GITHUB_REPOSITORY when REPO_FULL_NAME is missing', () => {
    const config = loadAppConfig({ GITHUB_REPOSITORY: 'acme/tools' });

    const name = getRepoFullName(config);

    expect(name).toBe('acme/tools');
  });

  test('throws usage error when neither env is set or invalid', () => {
    expect(() => getRepoFullName(loadAppConfig({}))).toThrow(ConfigError);

    try {
      getRepoFullName(loadAppConfig({}));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).exitCode).toBe(EXIT_USAGE);
    }
  });

  test('throws usage error when value does not include a slash', () => {
    expect(() =>
      getRepoFullName(loadAppConfig({ REPO_FULL_NAME: 'invalid' })),
    ).toThrow(ConfigError);

    try {
      getRepoFullName(loadAppConfig({ REPO_FULL_NAME: 'invalid' }));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).exitCode).toBe(EXIT_USAGE);
    }
  });

  test.each([
    ['missing owner', '/repo'],
    ['missing repository', 'owner/'],
    ['additional separator', 'owner/repo/extra'],
    ['whitespace-only owner', '   /repo'],
    ['whitespace-only repository', 'owner/   '],
    ['whitespace-only value', '   '],
    ['whitespace inside owner', 'ow ner/repo'],
    ['whitespace inside repository', 'owner/re po'],
  ])('throws usage error when value is malformed (%s)', (_label, value) => {
    expect(() =>
      getRepoFullName(loadAppConfig({ REPO_FULL_NAME: value })),
    ).toThrow(ConfigError);

    try {
      getRepoFullName(loadAppConfig({ REPO_FULL_NAME: value }));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).exitCode).toBe(EXIT_USAGE);
    }
  });

  test('falls back to GITHUB_REPOSITORY and validates it too', () => {
    expect(() =>
      getRepoFullName(loadAppConfig({ GITHUB_REPOSITORY: 'owner/' })),
    ).toThrow(ConfigError);

    expect(
      getRepoFullName(loadAppConfig({ GITHUB_REPOSITORY: 'owner/repo' })),
    ).toBe('owner/repo');
  });
});
