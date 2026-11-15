import { describe, expect, test } from '@jest/globals';
import { buildTitleLookup, findTitleMatch } from '@/utils/title-lookup.js';

describe('title-lookup utils', () => {
  test('matches direct titles after stripping conventional prefixes', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 42 },
    ]);

    expect(findTitleMatch('feat(auth): Add login flow', lookup)).toBe(42);
  });

  test('supports fuzzy prefix matching with a relative length threshold', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow with passwordless fallback'], value: 42 },
    ]);

    expect(
      findTitleMatch('Add login flow with passwordless', lookup, {
        minRelativePrefixLength: 0.5,
      }),
    ).toBe(42);
    expect(
      findTitleMatch('Add', lookup, {
        minRelativePrefixLength: 0.5,
      }),
    ).toBeUndefined();
  });

  test('uses the collision resolver for normalized title clashes', () => {
    const lookup = buildTitleLookup(
      [
        { titles: ['Add login flow'], value: 42 },
        { titles: ['add-login-flow'], value: 99 },
      ],
      {
        onNormalizedCollision: ({ existingValue, incomingValue }) =>
          Math.max(existingValue, incomingValue),
      },
    );

    expect(findTitleMatch('Add login flow', lookup)).toBe(99);
    expect(findTitleMatch('Add! Login Flow', lookup)).toBe(99);
  });

  test('preserves the first normalized value when no collision resolver is provided', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 42 },
      { titles: ['add-login-flow'], value: 99 },
    ]);

    expect(lookup.normalized.get('add login flow')).toBe(42);
    expect(findTitleMatch('Add! Login Flow', lookup)).toBe(42);
  });

  test('preserves the existing normalized value when the collision resolver returns undefined', () => {
    let collisionCount = 0;
    const lookup = buildTitleLookup(
      [
        { titles: ['Add login flow'], value: 42 },
        { titles: ['add-login-flow'], value: 99 },
      ],
      {
        onNormalizedCollision: () => {
          collisionCount += 1;
          return undefined;
        },
      },
    );

    expect(collisionCount).toBe(1);
    expect(lookup.normalized.get('add login flow')).toBe(42);
    expect(findTitleMatch('Add! Login Flow', lookup)).toBe(42);
  });

  test('prefers normalized matches over conflicting direct matches', () => {
    const lookup = buildTitleLookup(
      [
        { titles: ['Add login flow'], value: 42 },
        { titles: ['add-login-flow'], value: 99 },
      ],
      {
        onNormalizedCollision: ({ incomingValue }) => incomingValue,
      },
    );

    expect(lookup.direct.get('Add login flow')).toBe(42);
    expect(lookup.normalized.get('add login flow')).toBe(99);
    expect(findTitleMatch('Add login flow', lookup)).toBe(99);
  });

  test('handles titles differing only by capitalization or punctuation consistently', () => {
    const lookup = buildTitleLookup([
      { titles: ['Add login flow'], value: 42 },
    ]);

    for (const titleVariant of [
      'Add login flow',
      'ADD LOGIN FLOW',
      'add-login-flow',
      'Add! Login Flow',
    ]) {
      expect(findTitleMatch(titleVariant, lookup)).toBe(42);
    }
  });

  test('ignores empty titles when building lookup tables', () => {
    const lookup = buildTitleLookup([
      { titles: [''], value: 1 },
      { titles: ['Add login flow'], value: 42 },
    ]);

    expect(lookup.direct.has('')).toBe(false);
    expect(lookup.normalized.has('')).toBe(false);
    expect(findTitleMatch('', lookup)).toBeUndefined();
  });
});
