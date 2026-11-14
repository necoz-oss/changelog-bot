// WHY: We normalize titles for fuzzy matching, so we strip any leading
// conventional commit prefix (with optional scope) to compare plain subjects.
import { isBulletLine } from '@/utils/is.js';
import { INLINE_PR_PRESENT_RE } from '@/constants/conventional.js';
import { buildTitleLookup, findTitleMatch } from '@/utils/title-lookup.js';

/** Maps original PR titles to their numeric identifiers. */
type TitleToPr = Record<string, number>;

type BulletParts = {
  /** Leading bullet marker including whitespace (e.g., "- "). */
  prefix: string;
  /** Bullet content without the leading marker. */
  text: string;
};

/**
 * Check whether a line already includes an inline PR reference (e.g., "(#123)").
 * @param line Markdown line to inspect.
 */
function hasInlinePrReference(line: string): boolean {
  // Common patterns: "(#123)" or "[#123]" (including markdown links like in [#123](...))
  return INLINE_PR_PRESENT_RE.test(line);
}

/**
 * Split a markdown bullet line into prefix ("- ") and text segments.
 * @param line Markdown line to split.
 * @returns Bullet fragments or `undefined` when the line is not a bullet.
 */
function splitBulletLine(line: string): BulletParts | undefined {
  const bulletMatch = line.match(/^(\s*[-*]\s+)(.*)$/);
  if (!bulletMatch) return undefined;
  const [, prefix, text] = bulletMatch;
  return { prefix, text };
}

type FenceMarker = {
  /** Fence character, either a backtick or a tilde. */
  character: '`' | '~';
  /** Number of fence characters, used to match the closing fence. */
  length: number;
};

/**
 * Detect a fenced code block delimiter (``` or ~~~) at the start of a line.
 * CommonMark allows up to three leading spaces before the fence.
 * @param line Markdown line to inspect.
 */
function matchFenceDelimiter(line: string): FenceMarker | undefined {
  const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
  if (!fenceMatch) return undefined;
  const fenceText = fenceMatch[1];
  return { character: fenceText[0] as '`' | '~', length: fenceText.length };
}

/**
 * Check whether a line closes the currently open fenced code block.
 * The closing fence must reuse the opening character and be at least as long.
 * @param line Markdown line to inspect.
 * @param openFence Fence opened earlier in the document.
 */
function closesFence(line: string, openFence: FenceMarker): boolean {
  const fenceMatch = matchFenceDelimiter(line);
  if (!fenceMatch) return false;
  return (
    fenceMatch.character === openFence.character &&
    fenceMatch.length >= openFence.length
  );
}

/**
 * Attach a PR number reference to bullet lines in a markdown section when a matching
 * title exists in the provided map. Keeps existing references intact.
 * @param md Markdown text that may include bullet list items.
 * @param titleToPr Map of original PR titles to PR numbers.
 * @returns Markdown with missing PR references appended to matching bullets.
 */
export function attachPrNumbers(
  md: string,
  titleToPr: TitleToPr,
  repo?: { owner: string; repo: string },
): string {
  const titleLookup = buildTitleLookup(
    Object.entries(titleToPr).map(([title, prNumber]) => ({
      titles: [title],
      value: prNumber,
    })),
    {
      onNormalizedCollision: ({
        title,
        normalizedTitle,
        existingValue,
        incomingValue,
      }) => {
        // WHY: Collisions happen when titles differ only by punctuation/case.
        // Prefer the higher PR number (usually newer) and log for visibility.
        if (incomingValue !== existingValue) {
          console.warn(
            `Title collision: "${title}" -> "${normalizedTitle}" (PR #${incomingValue} vs #${existingValue})`,
          );
        }
        return Math.max(existingValue, incomingValue);
      },
    },
  );

  const lines = md.split('\n');
  // WHY: Fenced code blocks can contain bullet-looking lines (documentation
  // examples), so those lines must be emitted untouched instead of being linked.
  let openFence: FenceMarker | undefined;
  const updated = lines.map((line) => {
    if (openFence) {
      if (closesFence(line, openFence)) openFence = undefined;
      return line;
    }

    const fenceMarker = matchFenceDelimiter(line);
    if (fenceMarker) {
      openFence = fenceMarker;
      return line;
    }

    if (!isBulletLine(line) || !/^[-*]\s+/.test(line)) return line;
    if (hasInlinePrReference(line)) return line;

    const bulletParts = splitBulletLine(line);
    if (!bulletParts) return line;

    const matchedPrNumber = findTitleMatch(bulletParts.text, titleLookup);

    if (!matchedPrNumber) return line;

    if (repo) {
      const url = `https://github.com/${repo.owner}/${repo.repo}/pull/${matchedPrNumber}`;
      return `${bulletParts.prefix}${bulletParts.text} in [#${matchedPrNumber}](${url})`;
    }
    return `${bulletParts.prefix}${bulletParts.text} (#${matchedPrNumber})`;
  });
  return updated.join('\n');
}
