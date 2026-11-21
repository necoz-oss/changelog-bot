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
});

describe('detectPrSubChangesFromCommits suppression and deduplication rules', () => {
  // Two commits that expand on their own: distinct subjects in distinct type/scope slots.
  const exportCommit = {
    sha: 'c1',
    subject: 'feat(api): add bulk export endpoint',
  };
  const authCommit = {
    sha: 'c2',
    subject: 'fix(auth): handle missing authorization header',
  };
  const expanded = [
    {
      subIndex: 1,
      title: 'add bulk export endpoint',
      rawTitle: 'feat(api): add bulk export endpoint',
      commitSha: 'c1',
    },
    {
      subIndex: 2,
      title: 'handle missing authorization header',
      rawTitle: 'fix(auth): handle missing authorization header',
      commitSha: 'c2',
    },
  ];

  test('expands the baseline commits when no suppression rule applies', () => {
    const result = detectPrSubChangesFromCommits(200, 'Export and auth fixes', [
      exportCommit,
      authCommit,
    ]);

    expect(result).toEqual(expanded);
  });

  test.each([
    ['the exact commit subject', 'feat(api): add bulk export endpoint'],
    ['a different prefix, case and punctuation', 'Add Bulk-Export endpoint!'],
  ])(
    'keeps the pull request whole when a commit matches the PR title (%s)',
    (_label, prTitle) => {
      const result = detectPrSubChangesFromCommits(200, prTitle, [
        exportCommit,
        authCommit,
      ]);

      expect(result).toBeNull();
    },
  );

  test.each([
    'feat(ui): first part of export dialog',
    'feat(ui): export dialog part 2',
    'feat(ui): export dialog step 3',
    'feat(ui): follow-up change for export dialog',
  ])(
    'keeps the pull request whole when a commit is a partial increment: %s',
    (partialSubject) => {
      const result = detectPrSubChangesFromCommits(
        200,
        'Export and auth fixes',
        [exportCommit, authCommit, { sha: 'c3', subject: partialSubject }],
      );

      expect(result).toBeNull();
    },
  );

  test('collapses commits whose subjects differ only in case and punctuation, keeping the first', () => {
    const result = detectPrSubChangesFromCommits(200, 'Export and auth fixes', [
      { sha: 'c1', subject: 'feat(api): Add bulk export endpoint' },
      { sha: 'c1b', subject: 'fix(api-v2): add bulk-export endpoint.' },
      authCommit,
    ]);

    expect(result).toEqual([
      {
        subIndex: 1,
        title: 'Add bulk export endpoint',
        rawTitle: 'feat(api): Add bulk export endpoint',
        commitSha: 'c1',
      },
      expanded[1],
    ]);
  });

  test.each(['fixup!', 'squash!', 'amend!'])(
    'ignores %s commits and keeps the remaining sub-changes',
    (marker) => {
      const result = detectPrSubChangesFromCommits(
        200,
        'Export and auth fixes',
        [
          exportCommit,
          { sha: 'f1', subject: `${marker} feat(ui): add export dialog` },
          authCommit,
        ],
      );

      expect(result).toEqual(expanded);
    },
  );

  test('keeps original order and consecutive sub-indexes after filtering and deduplication', () => {
    const result = detectPrSubChangesFromCommits(
      200,
      'Export, auth and query work',
      [
        { sha: 'n1', subject: 'chore: update swagger types' },
        exportCommit,
        { sha: 'd1', subject: 'feat(api-v2): Add bulk export endpoint!' },
        { sha: 'n2', subject: 'address review comments' },
        authCommit,
        {
          sha: 'f1',
          subject: 'fixup! fix(auth): handle missing authorization header',
        },
        { sha: 'c3', subject: 'perf(db): batch export queries' },
      ],
    );

    expect(result).toEqual([
      ...expanded,
      {
        subIndex: 3,
        title: 'batch export queries',
        rawTitle: 'perf(db): batch export queries',
        commitSha: 'c3',
      },
    ]);
  });
});
