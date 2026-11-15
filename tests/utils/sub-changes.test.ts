import { describe, expect, test } from '@jest/globals';
import { detectPrSubChangesFromCommits } from '@/utils/sub-changes.js';

describe('detectPrSubChangesFromCommits', () => {
  test('returns null for single-commit pull request', () => {
    const result = detectPrSubChangesFromCommits(
      42,
      'feat: add dark mode support',
      [{ sha: 'aaa', subject: 'feat: add dark mode support' }],
    );

    expect(result).toBeNull();
  });

  test('returns null for empty commit list', () => {
    const result = detectPrSubChangesFromCommits(
      42,
      'feat: add dark mode support',
      [],
    );

    expect(result).toBeNull();
  });

  test('returns null when multiple commits consist of a feature and follow-up fixups/chores', () => {
    const result = detectPrSubChangesFromCommits(
      42,
      'feat: add dark mode support',
      [
        { sha: '111', subject: 'feat: add dark mode support' },
        { sha: '222', subject: 'fix: typo in dark mode settings' },
        { sha: '333', subject: 'chore: lint fix' },
        { sha: '444', subject: 'test: add test coverage' },
        { sha: '555', subject: 'address review comments' },
        { sha: '666', subject: 'fixup! add dark mode support' },
      ],
    );

    expect(result).toBeNull();
  });

  test('returns null when all commits share the same semantic subject (homogeneous)', () => {
    const result = detectPrSubChangesFromCommits(
      42,
      'feat: add user authentication',
      [
        { sha: '111', subject: 'feat: add user authentication' },
        { sha: '222', subject: 'feat: add user authentication' },
        { sha: '333', subject: 'fix: add user authentication' },
      ],
    );

    expect(result).toBeNull();
  });

  test('discovers distinct sub-changes when >= 2 distinct user-facing commits are present', () => {
    const result = detectPrSubChangesFromCommits(
      101,
      'feat: authentication and profile management',
      [
        { sha: 'aaa', subject: 'feat: add OAuth login provider' },
        { sha: 'bbb', subject: 'fix: resolve race condition in token refresh' },
      ],
    );

    expect(result).toEqual([
      {
        subIndex: 1,
        title: 'add OAuth login provider',
        rawTitle: 'feat: add OAuth login provider',
        commitSha: 'aaa',
      },
      {
        subIndex: 2,
        title: 'resolve race condition in token refresh',
        rawTitle: 'fix: resolve race condition in token refresh',
        commitSha: 'bbb',
      },
    ]);
  });

  test('filters out commit noise while retaining multiple distinct features', () => {
    const result = detectPrSubChangesFromCommits(
      102,
      'feat: multiple changes',
      [
        { sha: 'c1', subject: 'feat(api): implement bulk export endpoint' },
        { sha: 'c2', subject: 'chore: update swagger types' },
        { sha: 'c3', subject: 'fix: handle missing authorization header' },
        { sha: 'c4', subject: 'address code review feedback' },
        { sha: 'c5', subject: 'perf: optimize export streaming buffer size' },
      ],
    );

    expect(result).toEqual([
      {
        subIndex: 1,
        title: 'implement bulk export endpoint',
        rawTitle: 'feat(api): implement bulk export endpoint',
        commitSha: 'c1',
      },
      {
        subIndex: 2,
        title: 'handle missing authorization header',
        rawTitle: 'fix: handle missing authorization header',
        commitSha: 'c3',
      },
      {
        subIndex: 3,
        title: 'optimize export streaming buffer size',
        rawTitle: 'perf: optimize export streaming buffer size',
        commitSha: 'c5',
      },
    ]);
  });

  test('filters non-conventional noise such as readme updates and dependency bumps', () => {
    const result = detectPrSubChangesFromCommits(
      103,
      'feat: widget improvements',
      [
        { sha: 'c1', subject: 'feat: add interactive widget' },
        { sha: 'c2', subject: 'update readme' },
        { sha: 'c3', subject: 'bump dependencies' },
      ],
    );

    // Only 1 user-facing commit left, returns null to preserve invariant
    expect(result).toBeNull();
  });

  test('strictly rejects non-conventional commit messages to avoid false sub-change splitting', () => {
    const result = detectPrSubChangesFromCommits(
      104,
      'refactor: parser overhaul',
      [
        { sha: 'c1', subject: 'refactor: extract AST parser helper' },
        { sha: 'c2', subject: 'add parser tests' },
        { sha: 'c3', subject: 'rename helper' },
      ],
    );

    // "add parser tests" and "rename helper" lack conventional prefixes and are rejected
    expect(result).toBeNull();
  });

  test('returns null when a commit matches the normalized PR title even with other eligible commits', () => {
    const result = detectPrSubChangesFromCommits(
      105,
      'Add Dashboard Metrics!',
      [
        { sha: 'c1', subject: 'feat: add dashboard metrics' },
        { sha: 'c2', subject: 'fix: correct timezone offset' },
        { sha: 'c3', subject: 'perf: reduce dashboard bundle size' },
      ],
    );

    expect(result).toBeNull();
  });

  test('returns null when a partial-increment commit is present alongside eligible commits', () => {
    const result = detectPrSubChangesFromCommits(
      106,
      'feat: dashboard improvements',
      [
        { sha: 'c1', subject: 'feat: add dashboard metrics (first part)' },
        { sha: 'c2', subject: 'fix: correct timezone offset' },
        { sha: 'c3', subject: 'perf: reduce dashboard bundle size' },
      ],
    );

    expect(result).toBeNull();
  });

  test.each([
    'feat: add dashboard metrics - part 2',
    'feat: add dashboard metrics (initial step)',
    'feat: add dashboard metrics (follow-up change)',
  ])(
    'returns null when an incremental commit is present: %s',
    (incrementalSubject) => {
      const result = detectPrSubChangesFromCommits(
        107,
        'feat: dashboard improvements',
        [
          { sha: 'c1', subject: incrementalSubject },
          { sha: 'c2', subject: 'fix: correct timezone offset' },
        ],
      );

      expect(result).toBeNull();
    },
  );

  test('deduplicates commits differing only in capitalization or punctuation', () => {
    const result = detectPrSubChangesFromCommits(
      108,
      'feat: authentication improvements',
      [
        { sha: 'c1', subject: 'feat: Add OAuth login provider!' },
        { sha: 'c2', subject: 'feat: add oauth login provider' },
        { sha: 'c3', subject: 'fix: resolve token refresh race' },
      ],
    );

    expect(result).toEqual([
      {
        subIndex: 1,
        title: 'Add OAuth login provider!',
        rawTitle: 'feat: Add OAuth login provider!',
        commitSha: 'c1',
      },
      {
        subIndex: 2,
        title: 'resolve token refresh race',
        rawTitle: 'fix: resolve token refresh race',
        commitSha: 'c3',
      },
    ]);
  });

  test('ignores fixup!, squash!, and amend! commits', () => {
    const result = detectPrSubChangesFromCommits(
      109,
      'feat: dashboard improvements',
      [
        { sha: 'c1', subject: 'fixup! feat: add dashboard metrics' },
        { sha: 'c2', subject: 'squash! feat: add dashboard metrics' },
        { sha: 'c3', subject: 'amend! feat: add dashboard metrics' },
        { sha: 'c4', subject: 'feat: add dashboard filters' },
        { sha: 'c5', subject: 'fix: correct timezone offset' },
      ],
    );

    expect(result).toEqual([
      {
        subIndex: 1,
        title: 'add dashboard filters',
        rawTitle: 'feat: add dashboard filters',
        commitSha: 'c4',
      },
      {
        subIndex: 2,
        title: 'correct timezone offset',
        rawTitle: 'fix: correct timezone offset',
        commitSha: 'c5',
      },
    ]);
  });

  test('keeps the first commit when multiple commits share a semantic subject', () => {
    const result = detectPrSubChangesFromCommits(
      110,
      'feat: authentication improvements',
      [
        { sha: 'c1', subject: 'feat(auth): add OAuth login provider' },
        { sha: 'c2', subject: 'fix: Add OAuth login provider!' },
        { sha: 'c3', subject: 'fix: resolve token refresh race' },
      ],
    );

    expect(result).toEqual([
      {
        subIndex: 1,
        title: 'add OAuth login provider',
        rawTitle: 'feat(auth): add OAuth login provider',
        commitSha: 'c1',
      },
      {
        subIndex: 2,
        title: 'resolve token refresh race',
        rawTitle: 'fix: resolve token refresh race',
        commitSha: 'c3',
      },
    ]);
  });

  test('assigns consecutive sub-change indexes after filtering and deduplication', () => {
    const result = detectPrSubChangesFromCommits(
      111,
      'feat: authentication improvements',
      [
        { sha: 'c1', subject: 'chore: update generated docs' },
        { sha: 'c2', subject: 'feat: add OAuth login provider' },
        { sha: 'c3', subject: 'feat: Add OAuth login provider!' },
        { sha: 'c4', subject: 'fixup! feat: add OAuth login provider' },
        { sha: 'c5', subject: 'fix: resolve token refresh race' },
        { sha: 'c6', subject: 'docs: document auth setup' },
        { sha: 'c7', subject: 'perf: optimize token cache' },
      ],
    );

    expect(result).toEqual([
      {
        subIndex: 1,
        title: 'add OAuth login provider',
        rawTitle: 'feat: add OAuth login provider',
        commitSha: 'c2',
      },
      {
        subIndex: 2,
        title: 'resolve token refresh race',
        rawTitle: 'fix: resolve token refresh race',
        commitSha: 'c5',
      },
      {
        subIndex: 3,
        title: 'optimize token cache',
        rawTitle: 'perf: optimize token cache',
        commitSha: 'c7',
      },
    ]);
  });
});
