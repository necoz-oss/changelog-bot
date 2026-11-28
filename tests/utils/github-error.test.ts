import { describe, expect, test } from '@jest/globals';
import { z } from 'zod';
import type { HttpError } from '@/types/http.js';
import {
  classifyGithubError,
  formatBranchMetadataFallbackReason,
  formatCommitMetadataFallbackReason,
  formatIssueMetadataFallbackReason,
  formatMetadataFallbackReason,
  formatReleaseMetadataFallbackReason,
} from '@/utils/github-error.js';

function createMockHttpError(
  statusCode: number,
  errorMessage: string,
  responseBody: unknown = {},
): HttpError {
  const httpError = new Error(errorMessage) as HttpError;
  httpError.status = statusCode;
  httpError.body = responseBody;
  return httpError;
}

describe('classifyGithubError', () => {
  test('classifies 404 as not-found with context label', () => {
    const errorCandidate = createMockHttpError(404, 'Not Found');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'not-found',
      message: 'PR #42 not found (404)',
      statusCode: 404,
    });
  });

  test('classifies 401 as unauthenticated', () => {
    const errorCandidate = createMockHttpError(401, 'Bad credentials');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'unauthenticated',
      message: 'GitHub token unauthenticated (401): Bad credentials',
      statusCode: 401,
    });
  });

  test('classifies 403 as rate-limited when message mentions rate limit', () => {
    const errorCandidate = createMockHttpError(
      403,
      'API rate limit exceeded for user',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message:
        'GitHub API rate limit exceeded: API rate limit exceeded for user',
      statusCode: 403,
      retryAfter: undefined,
    });
  });

  test('classifies 403 secondary rate limit as rate-limited', () => {
    const errorCandidate = createMockHttpError(
      403,
      'You have exceeded a secondary rate limit',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message:
        'GitHub API rate limit exceeded: You have exceeded a secondary rate limit',
      statusCode: 403,
      retryAfter: undefined,
    });
  });

  test('classifies 403 without rate limit context as unauthenticated forbidden', () => {
    const errorCandidate = createMockHttpError(
      403,
      'Resource not accessible by integration',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'unauthenticated',
      message:
        'GitHub API forbidden (403): Resource not accessible by integration',
      statusCode: 403,
    });
  });

  test('classifies 429 as rate-limited and extracts retry_after when present', () => {
    const errorCandidate = createMockHttpError(429, 'Too Many Requests', {
      retry_after: 60,
    });
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Too Many Requests',
      statusCode: 429,
      retryAfter: 60,
    });
  });

  test('classifies non-rate-limit 5xx status as network-error with status code', () => {
    const errorCandidate = createMockHttpError(503, 'Service Unavailable');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'network-error',
      message: 'HTTP 503: Service Unavailable',
      statusCode: 503,
    });
  });

  test('classifies Zod schema validation errors as invalid-response', () => {
    const schema = z.object({ number: z.number() });
    const parseResult = schema.safeParse({ number: 'not-a-number' });
    expect(parseResult.success).toBe(false);

    if (!parseResult.success) {
      const failure = classifyGithubError(parseResult.error, 'PR #42');
      expect(failure.status).toBe('invalid-response');
      expect(failure.message).toContain('Invalid response schema');
    }
  });

  test('classifies JSON parsing failure as invalid-response', () => {
    const errorCandidate = new Error(
      'GitHub API failed to parse JSON response',
    );
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'invalid-response',
      message:
        'Invalid response schema: GitHub API failed to parse JSON response',
    });
  });

  test('classifies generic fetch or network failures as network-error', () => {
    const errorCandidate = new TypeError('fetch failed');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'network-error',
      message: 'Network error: fetch failed',
    });
  });

  test('classifies error object with status property but no message as not-found', () => {
    const errorCandidate = { status: 404 };
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'not-found',
      message: 'PR #42 not found (404)',
      statusCode: 404,
    });
  });

  test('classifies error object with statusCode property as not-found', () => {
    const errorCandidate = { statusCode: 404, message: 'Not Found' };
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'not-found',
      message: 'PR #42 not found (404)',
      statusCode: 404,
    });
  });

  test('classifies 403 as rate-limited when message is inside response body', () => {
    const errorCandidate = {
      status: 403,
      message: 'Forbidden',
      body: { message: 'API rate limit exceeded for user' },
    };
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Forbidden',
      statusCode: 403,
      retryAfter: undefined,
    });
  });

  test('extracts string retry_after or direct retryAfter', () => {
    const errorWithStringBodyRetry = {
      status: 429,
      message: 'Too Many Requests',
      body: { retry_after: '120' },
    };
    expect(classifyGithubError(errorWithStringBodyRetry, 'PR #42')).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Too Many Requests',
      statusCode: 429,
      retryAfter: 120,
    });

    const errorWithDirectRetry = {
      status: 429,
      message: 'Too Many Requests',
      retryAfter: '45',
    };
    expect(classifyGithubError(errorWithDirectRetry, 'PR #42')).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: Too Many Requests',
      statusCode: 429,
      retryAfter: 45,
    });
  });

  test('classifies non-HTTP Error mentioning rate limit as rate-limited', () => {
    const errorCandidate = new Error('GitHub API rate limit exceeded');
    const failure = classifyGithubError(errorCandidate, 'PR #42');

    expect(failure).toEqual({
      status: 'rate-limited',
      message: 'GitHub API rate limit exceeded: GitHub API rate limit exceeded',
      retryAfter: undefined,
    });
  });
});

describe('formatMetadataFallbackReason', () => {
  test('formats human-readable reason for not-found', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'not-found',
      message: 'Not found',
      statusCode: 404,
    });
    expect(reason).toBe('Skipped PR #10: PR not found (404)');
  });

  test('formats human-readable reason for unauthenticated', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'unauthenticated',
      message: 'Bad token',
      statusCode: 401,
    });
    expect(reason).toBe(
      'Skipped PR #10: GitHub authentication required or token invalid',
    );
  });

  test('formats human-readable reason for rate-limited', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'rate-limited',
      message: 'Rate limit',
      statusCode: 429,
    });
    expect(reason).toBe('Skipped PR #10: GitHub API rate limit reached');
  });

  test('formats human-readable reason for invalid-response', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'invalid-response',
      message: 'Schema violation',
    });
    expect(reason).toBe(
      'Skipped PR #10: invalid PR metadata received from GitHub',
    );
  });

  test('formats human-readable reason for network-error', () => {
    const reason = formatMetadataFallbackReason(10, {
      status: 'network-error',
      message: 'Connection reset',
    });
    expect(reason).toBe('Skipped PR #10: network error fetching PR metadata');
  });

  test('throws error for unsupported failure status', () => {
    expect(() =>
      formatMetadataFallbackReason(10, {
        status: 'custom-status' as unknown as 'network-error',
        message: 'Something unexpected happened',
      }),
    ).toThrow('Unsupported metadata lookup failure status: custom-status');
  });
});

describe('formatBranchMetadataFallbackReason', () => {
  test('formats branch fallback reason for rate-limited failure', () => {
    const reason = formatBranchMetadataFallbackReason('feature/branch', {
      status: 'rate-limited',
      message: 'Rate limit exceeded',
    });
    expect(reason).toBe('Branch feature/branch: GitHub API rate limit reached');
  });

  test('formats branch fallback reason for unauthenticated failure', () => {
    const reason = formatBranchMetadataFallbackReason('feature/branch', {
      status: 'unauthenticated',
      message: 'Bad token',
    });
    expect(reason).toBe(
      'Branch feature/branch: GitHub authentication required or token invalid',
    );
  });
});

describe('formatCommitMetadataFallbackReason', () => {
  test('formats commit fallback reason for rate-limited failure', () => {
    const reason = formatCommitMetadataFallbackReason('1234567890abcdef', {
      status: 'rate-limited',
      message: 'Rate limit exceeded',
    });
    expect(reason).toBe('Commit 1234567: GitHub API rate limit reached');
  });

  test('formats commit fallback reason for not-found failure', () => {
    const reason = formatCommitMetadataFallbackReason('1234567890abcdef', {
      status: 'not-found',
      message: 'Not found',
    });
    expect(reason).toBe('Commit 1234567: commit pulls not found (404)');
  });
});

describe('formatReleaseMetadataFallbackReason', () => {
  test('formats release fallback reason for not-found failure', () => {
    const reason = formatReleaseMetadataFallbackReason('v1.0.0', {
      status: 'not-found',
      message: 'Not found',
    });
    expect(reason).toBe('Release v1.0.0: release notes not found (404)');
  });

  test('formats release fallback reason for network error', () => {
    const reason = formatReleaseMetadataFallbackReason('v1.0.0', {
      status: 'network-error',
      message: 'Network offline',
    });
    expect(reason).toBe('Release v1.0.0: network error fetching release notes');
  });
});

describe('formatIssueMetadataFallbackReason', () => {
  test('formats human-readable reason for not-found', () => {
    const reason = formatIssueMetadataFallbackReason(236, {
      status: 'not-found',
      message: 'Not found',
      statusCode: 404,
    });
    expect(reason).toBe('Skipped Issue #236: issue not found (404)');
  });

  test('formats human-readable reason for unauthenticated', () => {
    const reason = formatIssueMetadataFallbackReason(236, {
      status: 'unauthenticated',
      message: 'Bad token',
      statusCode: 401,
    });
    expect(reason).toBe(
      'Skipped Issue #236: GitHub authentication required or token invalid',
    );
  });

  test('formats human-readable reason for rate-limited', () => {
    const reason = formatIssueMetadataFallbackReason(236, {
      status: 'rate-limited',
      message: 'Rate limit exceeded',
      statusCode: 429,
    });
    expect(reason).toBe('Skipped Issue #236: GitHub API rate limit reached');
  });

  test('formats human-readable reason for invalid-response', () => {
    const reason = formatIssueMetadataFallbackReason(236, {
      status: 'invalid-response',
      message: 'Schema violation',
    });
    expect(reason).toBe(
      'Skipped Issue #236: invalid issue metadata received from GitHub',
    );
  });

  test('formats human-readable reason for network-error', () => {
    const reason = formatIssueMetadataFallbackReason(236, {
      status: 'network-error',
      message: 'Connection failed',
    });
    expect(reason).toBe(
      'Skipped Issue #236: network error fetching issue metadata',
    );
  });

  test('throws error for unsupported failure status', () => {
    expect(() =>
      formatIssueMetadataFallbackReason(236, {
        status: 'custom-status' as unknown as 'network-error',
        message: 'Something unexpected happened',
      }),
    ).toThrow('Unsupported metadata lookup failure status: custom-status');
  });
});

describe('classifyGithubError retry-after extraction (alternate shapes)', () => {
  const RATE_LIMIT_MESSAGE =
    'GitHub API rate limit exceeded: Too Many Requests';

  // Accepted shapes: each must classify as rate-limited with the parsed value.
  test.each([
    [
      'direct numeric retryAfter',
      { status: 429, message: 'Too Many Requests', retryAfter: 60 },
      60,
    ],
    [
      'direct numeric-string retryAfter',
      { status: 429, message: 'Too Many Requests', retryAfter: '120' },
      120,
    ],
    [
      'direct snake_case retry_after number',
      { status: 429, message: 'Too Many Requests', retry_after: 30 },
      30,
    ],
    [
      'direct snake_case retry_after string',
      { status: 429, message: 'Too Many Requests', retry_after: '15' },
      15,
    ],
    [
      'body retry_after number',
      { status: 429, message: 'Too Many Requests', body: { retry_after: 60 } },
      60,
    ],
    [
      'body retry_after string',
      {
        status: 429,
        message: 'Too Many Requests',
        body: { retry_after: '3600' },
      },
      3600,
    ],
    [
      'body retryAfter number',
      { status: 429, message: 'Too Many Requests', body: { retryAfter: 7 } },
      7,
    ],
    [
      'body retryAfter string',
      { status: 429, message: 'Too Many Requests', body: { retryAfter: '90' } },
      90,
    ],
    [
      'zero direct retryAfter is valid',
      { status: 429, message: 'Too Many Requests', retryAfter: 0 },
      0,
    ],
    [
      'zero body retry_after is valid',
      { status: 429, message: 'Too Many Requests', body: { retry_after: 0 } },
      0,
    ],
    [
      'large value',
      { status: 429, message: 'Too Many Requests', retryAfter: 86400 },
      86400,
    ],
    [
      'fractional value',
      { status: 429, message: 'Too Many Requests', retryAfter: 1.5 },
      1.5,
    ],
    [
      'statusCode field instead of status',
      { statusCode: 429, message: 'Too Many Requests', retryAfter: 12 },
      12,
    ],
    [
      '403 with rate-limit message and direct retryAfter',
      { status: 403, message: 'API rate limit exceeded', retryAfter: 20 },
      20,
    ],
    [
      'non-HTTP error object with retryAfter',
      Object.assign(new Error('rate limit exceeded'), { retryAfter: 33 }),
      33,
    ],
  ])('accepts %s', (_name, errorCandidate, expectedRetryAfter) => {
    const failure = classifyGithubError(errorCandidate, 'PR #42');
    expect(failure.status).toBe('rate-limited');
    expect(failure.retryAfter).toBe(expectedRetryAfter);
  });

  // Rejected shapes: still rate-limited, but no retry value is surfaced.
  test.each([
    [
      'negative number',
      { status: 429, message: 'Too Many Requests', retryAfter: -5 },
    ],
    [
      'negative string',
      { status: 429, message: 'Too Many Requests', retryAfter: '-1' },
    ],
    [
      'NaN',
      { status: 429, message: 'Too Many Requests', retryAfter: Number.NaN },
    ],
    [
      'Infinity',
      {
        status: 429,
        message: 'Too Many Requests',
        retryAfter: Number.POSITIVE_INFINITY,
      },
    ],
    [
      'negative Infinity number',
      {
        status: 429,
        message: 'Too Many Requests',
        retryAfter: Number.NEGATIVE_INFINITY,
      },
    ],
    [
      'Infinity string',
      { status: 429, message: 'Too Many Requests', retryAfter: 'Infinity' },
    ],
    [
      'negative-infinity string',
      { status: 429, message: 'Too Many Requests', retryAfter: '-Infinity' },
    ],
    [
      'NaN string',
      { status: 429, message: 'Too Many Requests', retryAfter: 'NaN' },
    ],
    [
      'non-numeric string',
      { status: 429, message: 'Too Many Requests', retryAfter: 'soon' },
    ],
    [
      'boolean',
      { status: 429, message: 'Too Many Requests', retryAfter: true },
    ],
    ['null', { status: 429, message: 'Too Many Requests', retryAfter: null }],
    [
      'object',
      { status: 429, message: 'Too Many Requests', retryAfter: { seconds: 5 } },
    ],
    ['array', { status: 429, message: 'Too Many Requests', retryAfter: [5] }],
    [
      'invalid body retry_after',
      { status: 429, message: 'Too Many Requests', body: { retry_after: -3 } },
    ],
    [
      'invalid body retryAfter string',
      {
        status: 429,
        message: 'Too Many Requests',
        body: { retryAfter: 'later' },
      },
    ],
  ])('rejects %s', (_name, errorCandidate) => {
    const failure = classifyGithubError(errorCandidate, 'PR #42');
    expect(failure.status).toBe('rate-limited');
    expect(failure.retryAfter).toBeUndefined();
  });

  test('direct retryAfter wins over retry_after and body values', () => {
    const failure = classifyGithubError(
      {
        status: 429,
        message: 'Too Many Requests',
        retryAfter: 5,
        retry_after: 9,
        body: { retry_after: 99 },
      },
      'PR #42',
    );
    expect(failure.retryAfter).toBe(5);
  });

  test('direct retry_after is used when retryAfter is absent', () => {
    const failure = classifyGithubError(
      {
        status: 429,
        message: 'Too Many Requests',
        retry_after: 9,
        body: { retry_after: 99 },
      },
      'PR #42',
    );
    expect(failure.retryAfter).toBe(9);
  });

  test('missing retry information leaves retryAfter undefined but keeps classification', () => {
    const failure = classifyGithubError(
      { status: 429, message: 'Too Many Requests' },
      'PR #42',
    );
    expect(failure).toEqual({
      status: 'rate-limited',
      message: RATE_LIMIT_MESSAGE,
      statusCode: 429,
      retryAfter: undefined,
    });
  });

  // Full-field assertions on the complete MetadataLookupFailure for each shape family.
  test.each([
    [
      'direct retryAfter on 429',
      { status: 429, message: 'Too Many Requests', retryAfter: 60 },
      {
        status: 'rate-limited',
        message: RATE_LIMIT_MESSAGE,
        statusCode: 429,
        retryAfter: 60,
      },
    ],
    [
      'body retry_after string on 429',
      {
        status: 429,
        message: 'Too Many Requests',
        body: { retry_after: '120' },
      },
      {
        status: 'rate-limited',
        message: RATE_LIMIT_MESSAGE,
        statusCode: 429,
        retryAfter: 120,
      },
    ],
    [
      'direct retryAfter on 403 rate limit',
      {
        status: 403,
        message: 'You have exceeded a secondary rate limit',
        retryAfter: 45,
      },
      {
        status: 'rate-limited',
        message:
          'GitHub API rate limit exceeded: You have exceeded a secondary rate limit',
        statusCode: 403,
        retryAfter: 45,
      },
    ],
    [
      'non-HTTP rate-limit error with retryAfter',
      Object.assign(new Error('GitHub API rate limit exceeded'), {
        retryAfter: 10,
      }),
      {
        status: 'rate-limited',
        message:
          'GitHub API rate limit exceeded: GitHub API rate limit exceeded',
        retryAfter: 10,
      },
    ],
  ])('full failure object for %s', (_name, errorCandidate, expected) => {
    expect(classifyGithubError(errorCandidate, 'PR #42')).toEqual(expected);
  });

  // Classification behavior is preserved: retry info only surfaces on rate-limited.
  test('404 stays not-found and drops retry info', () => {
    const failure = classifyGithubError(
      { status: 404, message: 'Not Found', retryAfter: 60 },
      'PR #42',
    );
    expect(failure).toEqual({
      status: 'not-found',
      message: 'PR #42 not found (404)',
      statusCode: 404,
    });
  });

  test('401 stays unauthenticated and drops retry info', () => {
    const failure = classifyGithubError(
      { status: 401, message: 'Bad credentials', retryAfter: 60 },
      'PR #42',
    );
    expect(failure).toEqual({
      status: 'unauthenticated',
      message: 'GitHub token unauthenticated (401): Bad credentials',
      statusCode: 401,
    });
  });

  test('403 without rate-limit wording stays unauthenticated and drops retry info', () => {
    const failure = classifyGithubError(
      {
        status: 403,
        message: 'Resource not accessible',
        body: { message: 'Forbidden' },
        retryAfter: 60,
      },
      'PR #42',
    );
    expect(failure).toEqual({
      status: 'unauthenticated',
      message: 'GitHub API forbidden (403): Resource not accessible',
      statusCode: 403,
    });
  });

  test('other HTTP statuses stay network-error and drop retry info', () => {
    const failure = classifyGithubError(
      { status: 503, message: 'Service Unavailable', retryAfter: 60 },
      'PR #42',
    );
    expect(failure).toEqual({
      status: 'network-error',
      message: 'HTTP 503: Service Unavailable',
      statusCode: 503,
    });
  });

  test('documented quirk: empty-string retry value parses as 0 (Number("") === 0)', () => {
    const failure = classifyGithubError(
      { status: 429, message: 'Too Many Requests', retryAfter: '' },
      'PR #42',
    );
    expect(failure.status).toBe('rate-limited');
    expect(failure.retryAfter).toBe(0);
  });
});

describe('classifyGithubError HTTP 403/429 edge cases', () => {
  test.each([
    [
      'Error instance with status 403 and permission message',
      Object.assign(new Error('Resource not accessible by integration'), {
        status: 403,
      }),
      {
        status: 'unauthenticated',
        message:
          'GitHub API forbidden (403): Resource not accessible by integration',
        statusCode: 403,
      },
    ],
    [
      'Error instance with status 403 and secondary rate limit',
      Object.assign(new Error('You have exceeded a secondary rate limit'), {
        status: 403,
      }),
      {
        status: 'rate-limited',
        message:
          'GitHub API rate limit exceeded: You have exceeded a secondary rate limit',
        statusCode: 403,
        retryAfter: undefined,
      },
    ],
    [
      'statusCode 403 with permission message',
      {
        statusCode: 403,
        message: 'Must have admin rights to Repository',
      },
      {
        status: 'unauthenticated',
        message:
          'GitHub API forbidden (403): Must have admin rights to Repository',
        statusCode: 403,
      },
    ],
    [
      'statusCode 403 with rate limit message',
      {
        statusCode: 403,
        message: 'API rate limit exceeded for user',
      },
      {
        status: 'rate-limited',
        message:
          'GitHub API rate limit exceeded: API rate limit exceeded for user',
        statusCode: 403,
        retryAfter: undefined,
      },
    ],
    [
      'statusCode 429',
      {
        statusCode: 429,
        message: 'Too Many Requests',
      },
      {
        status: 'rate-limited',
        message: 'GitHub API rate limit exceeded: Too Many Requests',
        statusCode: 429,
        retryAfter: undefined,
      },
    ],
  ])(
    'handles different error object shapes: %s',
    (_desc, errorCandidate, expected) => {
      expect(classifyGithubError(errorCandidate, 'PR #42')).toEqual(expected);
    },
  );

  test.each([
    ['uppercase primary rate limit', 'API RATE LIMIT EXCEEDED FOR USER'],
    ['mixed-case primary rate limit', 'GitHub API Rate Limit Exceeded'],
    [
      'uppercase secondary rate limit',
      'YOU HAVE EXCEEDED A SECONDARY RATE LIMIT',
    ],
  ])(
    'handles case variations for 403 rate-limit messages: %s',
    (_desc, message) => {
      const failure = classifyGithubError({ status: 403, message }, 'PR #42');

      expect(failure).toEqual({
        status: 'rate-limited',
        message: `GitHub API rate limit exceeded: ${message}`,
        statusCode: 403,
        retryAfter: undefined,
      });
    },
  );

  test.each([
    [
      'secondary rate limit in body.message with generic Forbidden top-level message',
      {
        status: 403,
        message: 'Forbidden',
        body: {
          message:
            'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.',
          documentation_url:
            'https://docs.github.com/rest/overview/resources-in-the-rest-api#secondary-rate-limits',
        },
      },
      {
        status: 'rate-limited',
        message: 'GitHub API rate limit exceeded: Forbidden',
        statusCode: 403,
        retryAfter: undefined,
      },
    ],
    [
      'primary rate limit in body.message without top-level message',
      {
        status: 403,
        body: {
          message: 'API rate limit exceeded for user',
        },
      },
      {
        status: 'rate-limited',
        message:
          'GitHub API rate limit exceeded: API rate limit exceeded for user',
        statusCode: 403,
        retryAfter: undefined,
      },
    ],
    [
      'secondary rate limit in raw string body without top-level message',
      {
        status: 403,
        body: 'You have exceeded a secondary rate limit',
      },
      {
        status: 'rate-limited',
        message:
          'GitHub API rate limit exceeded: You have exceeded a secondary rate limit',
        statusCode: 403,
        retryAfter: undefined,
      },
    ],
    [
      'permission message in body.message without top-level message',
      {
        status: 403,
        body: {
          message: 'Resource not accessible by integration',
        },
      },
      {
        status: 'unauthenticated',
        message:
          'GitHub API forbidden (403): Resource not accessible by integration',
        statusCode: 403,
      },
    ],
    [
      'permission message in raw string body without top-level message',
      {
        status: 403,
        body: 'Must have push access to repository',
      },
      {
        status: 'unauthenticated',
        message:
          'GitHub API forbidden (403): Must have push access to repository',
        statusCode: 403,
      },
    ],
    [
      'generic Forbidden top-level message with permission message in body',
      {
        status: 403,
        message: 'Forbidden',
        body: {
          message: 'Must have admin rights to Repository',
        },
      },
      {
        status: 'unauthenticated',
        message: 'GitHub API forbidden (403): Forbidden',
        statusCode: 403,
      },
    ],
    [
      'body retry_after preserved when body has secondary rate limit message',
      {
        status: 403,
        message: 'Forbidden',
        body: {
          message: 'You have exceeded a secondary rate limit',
          retry_after: '90',
        },
      },
      {
        status: 'rate-limited',
        message: 'GitHub API rate limit exceeded: Forbidden',
        statusCode: 403,
        retryAfter: 90,
      },
    ],
  ])(
    'handles nested response body messages: %s',
    (_desc, errorCandidate, expected) => {
      expect(classifyGithubError(errorCandidate, 'PR #42')).toEqual(expected);
    },
  );

  test.each([
    [
      '403 with no message and no body',
      { status: 403 },
      'unauthenticated',
      403,
    ],
    [
      'statusCode 403 without message',
      { statusCode: 403 },
      'unauthenticated',
      403,
    ],
    [
      '403 with empty string message',
      { status: 403, message: '' },
      'unauthenticated',
      403,
    ],
    [
      '403 with empty object body',
      { status: 403, body: {} },
      'unauthenticated',
      403,
    ],
    [
      '403 with undefined message and body',
      { status: 403, message: undefined, body: undefined },
      'unauthenticated',
      403,
    ],
    ['429 with missing message', { status: 429 }, 'rate-limited', 429],
  ])(
    'handles missing or empty messages: %s',
    (_desc, errorCandidate, expectedStatus, expectedStatusCode) => {
      const failure = classifyGithubError(errorCandidate, 'PR #42');

      expect(failure.status).toBe(expectedStatus);
      expect(failure.statusCode).toBe(expectedStatusCode);
    },
  );

  test('drops retryAfter on 403 ordinary permission error even when present on object', () => {
    const failure = classifyGithubError(
      {
        status: 403,
        message: 'Resource not accessible by integration',
        retryAfter: 60,
      },
      'PR #42',
    );

    expect(failure).toEqual({
      status: 'unauthenticated',
      message:
        'GitHub API forbidden (403): Resource not accessible by integration',
      statusCode: 403,
    });
    expect(failure).not.toHaveProperty('retryAfter');
  });
});
