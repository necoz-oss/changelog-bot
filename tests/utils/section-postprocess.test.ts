import { describe, expect, test } from '@jest/globals';
import { postprocessSection } from '@/utils/section-postprocess.js';

function extractSection(md: string, heading: string): string {
  const pattern = new RegExp(`###\\s+${heading}[\\s\\S]*?(?=###\\s+|$)`, 'i');
  const match = md.match(pattern);
  return match ? match[0] : '';
}

describe('postprocessSection', () => {
  test('moves dependency update bullets from Changed to Chore', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Changed',
      '',
      '- chore(deps): Update dependency prettier to v3.8.0',
      '- Refactor core pipeline',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});
    const changedSection = extractSection(out, 'Changed');
    const choreSection = extractSection(out, 'Chore');

    expect(changedSection).toContain('- Refactor core pipeline');
    expect(changedSection).not.toContain(
      'chore(deps): Update dependency prettier to v3.8.0',
    );
    expect(choreSection).toContain(
      '- chore(deps): Update dependency prettier to v3.8.0',
    );
  });

  test('reuses an existing Chore section instead of creating a duplicate', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Changed',
      '',
      '- chore(deps): Update dependency prettier to v3.8.0',
      '',
      '### Chore',
      '',
      '- Adjust release scripts',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});
    const choreSections = out.match(/^###\s+Chore$/gm) ?? [];
    const choreSection = extractSection(out, 'Chore');

    expect(choreSections).toHaveLength(1);
    expect(choreSection).toContain('- Adjust release scripts');
    expect(choreSection).toContain(
      '- chore(deps): Update dependency prettier to v3.8.0',
    );
  });

  test('does not duplicate a dependency bullet already present in Chore', () => {
    const dependencyBullet =
      '- chore(deps): Update dependency prettier to v3.8.0';
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Changed',
      '',
      dependencyBullet,
      '',
      '### Chore',
      '',
      dependencyBullet,
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});
    const bulletOccurrences = out.split(dependencyBullet).length - 1;

    expect(bulletOccurrences).toBe(1);
    expect(extractSection(out, 'Chore')).toContain(dependencyBullet);
  });

  test('removes the Changed section when all entries are relocated', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Changed',
      '',
      '- chore(deps): Update dependency prettier to v3.8.0',
      '- chore(deps): Update dependency typescript to v5.9.0',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});
    const choreSection = extractSection(out, 'Chore');

    expect(out).not.toMatch(/^###\s+Changed$/m);
    expect(choreSection).toContain(
      '- chore(deps): Update dependency prettier to v3.8.0',
    );
    expect(choreSection).toContain(
      '- chore(deps): Update dependency typescript to v5.9.0',
    );
  });

  test('preserves content when there are no dependency updates to relocate', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Changed',
      '',
      '- Refactor core pipeline',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(markdown);
  });

  test('is idempotent when applied twice', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Changed',
      '',
      '- chore(deps): Update dependency prettier to v3.8.0',
      '- Refactor core pipeline',
      '',
    ].join('\n');

    const firstPass = postprocessSection(markdown, {});
    const secondPass = postprocessSection(firstPass, {});

    expect(secondPass).toBe(firstPass);
  });

  test('does not modify when Breaking Changes is already at the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(markdown);
  });

  test('moves Breaking Changes in the middle to the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });

  test('moves Breaking Changes at the end to the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });

  test('consolidates multiple Breaking Changes sections at the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
      '### Breaking Changes',
      '',
      '- Drop old config format',
      '',
      '### Chore',
      '',
      '- Adjust scripts',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '- Drop old config format',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
      '### Chore',
      '',
      '- Adjust scripts',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });

  test('does not move an empty Breaking Changes section', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Breaking Changes',
      '',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out.indexOf('### Added')).toBeLessThan(
      out.indexOf('### Breaking Changes'),
    );
    expect(out.indexOf('### Breaking Changes')).toBeLessThan(
      out.indexOf('### Fixed'),
    );
    const breakingSection = extractSection(out, 'Breaking Changes');
    expect(breakingSection).not.toMatch(/^\s*-\s+/m);
  });

  test('does not modify when Breaking Changes is absent', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(markdown);
  });

  test('consolidates multiple Breaking Changes sections already at the top', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '### Breaking Changes',
      '',
      '- Drop old config format',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
    ].join('\n');

    const expected = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Breaking Changes',
      '',
      '- Remove legacy flag',
      '',
      '- Drop old config format',
      '',
      '### Added',
      '',
      '- Add feature A',
      '',
    ].join('\n');

    const out = postprocessSection(markdown, {});

    expect(out).toBe(expected);
  });
});
