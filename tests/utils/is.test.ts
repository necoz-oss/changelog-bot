// @ts-nocheck
import { test, expect, describe } from '@jest/globals';
import {
  isRecord,
  isString,
  isPrimitive,
  isNumber,
  isNullable,
  isBucketName,
  isReasoningModel,
  isBulletLine,
} from '@/utils/is.js';

describe('is utilities', () => {
  test('isRecord', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(true);
    expect(isRecord(new (class Example {})())).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });

  test('isNullable', () => {
    expect(isNullable(null)).toBe(true);
    expect(isNullable(undefined)).toBe(true);
    expect(isNullable(0)).toBe(false);
    expect(isNullable('')).toBe(false);
    expect(isNullable(false)).toBe(false);
  });

  test('isBucketName', () => {
    expect(isBucketName('Breaking Changes')).toBe(true);
    expect(isBucketName('Added')).toBe(true);
    expect(isBucketName('Fixed')).toBe(true);
    expect(isBucketName('Changed')).toBe(true);
    expect(isBucketName('Docs')).toBe(true);
    expect(isBucketName('Test')).toBe(true);
    expect(isBucketName('Chore')).toBe(true);
    expect(isBucketName('Reverted')).toBe(true);
    expect(isBucketName('Other')).toBe(false);
    expect(isBucketName('')).toBe(false);
    expect(isBucketName(1)).toBe(false);
  });

  test('isString', () => {
    expect(isString('a')).toBe(true);
    expect(isString(1)).toBe(false);
  });

  test('isPrimitive', () => {
    expect(isPrimitive(1)).toBe(true);
    expect(isPrimitive('x')).toBe(true);
    expect(isPrimitive(null)).toBe(true);
    expect(isPrimitive(undefined)).toBe(true);
    expect(isPrimitive(Symbol('s'))).toBe(true);
    expect(isPrimitive(BigInt(1))).toBe(true);
    expect(isPrimitive({})).toBe(false);
    expect(isPrimitive(() => {})).toBe(false);
  });

  test('isNumber', () => {
    expect(isNumber(NaN)).toBe(false);
    expect(isNumber(Infinity)).toBe(false);
    expect(isNumber('1')).toBe(false);
    expect(isNumber(123)).toBe(true);
  });

  test('isReasoningModel', () => {
    expect(isReasoningModel('o3-mini')).toBe(true);
    expect(isReasoningModel('gpt-5.1-reasoning')).toBe(true);
    expect(isReasoningModel('gpt-4o')).toBe(false);
  });

  test('isBulletLine', () => {
    expect(isBulletLine('- item')).toBe(true);
    expect(isBulletLine('  * item')).toBe(true);
    expect(isBulletLine('item')).toBe(false);
  });
});

