#!/usr/bin/env node
/**
 * Hex Literal Lint Checker for TSX files.
 * Ensures no hardcoded hex color literals exist in React TSX files,
 * enforcing the use of Tailwind theme tokens defined in ui/src/index.css.
 */

const fs = require('fs');
const path = require('path');

const UI_SRC = path.resolve(__dirname, '../ui/src');

// Allowlisted files that are permitted to contain raw hex codes (Canvas 2D renderers, SVG vector graphs, hardware cue chips)
const ALLOWLISTED_FILES = new Set([
  'WaveformCanvas.tsx',
  'WaveformMinimap.tsx',
  'StructuralMiniMap.tsx',
  'MusicalTopologyCanvas.tsx',
  'EnergyChart.tsx',
  'DualDeckWaveform.tsx',
  'TrackInspectionDrawer.tsx',
  'FourPointCueChips.tsx',
  'FourPointCueDeck.tsx',
  'TrackView.tsx',
]);

const HEX_REGEX = /#[0-9a-fA-F]{3,8}\b/g;

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.test.tsx') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function runCheck() {
  const tsxFiles = scanDirectory(UI_SRC);
  const violations = [];

  for (const file of tsxFiles) {
    const filename = path.basename(file);
    if (ALLOWLISTED_FILES.has(filename)) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      // Allow intentional overrides via inline comment
      if (line.includes('/* allow-hex */') || line.includes('// allow-hex')) {
        return;
      }

      const matches = line.match(HEX_REGEX);
      if (matches) {
        violations.push({
          file: path.relative(path.resolve(__dirname, '..'), file),
          line: idx + 1,
          matches,
          snippet: line.trim(),
        });
      }
    });
  }

  if (violations.length > 0) {
    console.error(`\n❌ [HEX TOKEN LINT ERROR] Found ${violations.length} hardcoded hex literal(s) in TSX:`);
    violations.slice(0, 30).forEach((v) => {
      console.error(`  ${v.file}:${v.line} -> ${v.matches.join(', ')}`);
      console.error(`    ${v.snippet}`);
    });
    if (violations.length > 30) {
      console.error(`  ... and ${violations.length - 30} more.`);
    }
    console.error('\nPlease replace hardcoded hex colors with design tokens (e.g. text-content-primary, bg-surface-panel).');
    process.exit(1);
  } else {
    console.log('✅ [HEX TOKEN LINT PASSED] All TSX files adhere to design tokens with 0 hardcoded hex literals.');
    process.exit(0);
  }
}

runCheck();
