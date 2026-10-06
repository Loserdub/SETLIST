#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const UI_SRC = path.resolve(__dirname, '../ui/src');

const ALLOWLISTED_FILES = new Set([
  'WaveformCanvas.tsx',
  'WaveformMinimap.tsx',
  'StructuralMiniMap.tsx',
]);

function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getLuminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function resolveToken(category, hex) {
  const lower = hex.toLowerCase();
  const { r, g, b } = hexToRgb(lower);
  const lum = getLuminance(r, g, b);

  // Check color families
  const isBlueOrCyan = (b > r + 30 && b > g - 20) || (b > 150 && g > 150 && r < 100);
  const isAmberOrOrange = (r > 180 && g > 100 && b < 100) || (r > 150 && g > 70 && b < 50);
  const isGreen = g > r + 20 && g > b + 20;
  const isRed = r > g + 40 && r > b + 40;

  if (category === 'text') {
    if (isBlueOrCyan) return 'accent-blue';
    if (isAmberOrOrange) return lum > 180 ? 'accent-amber-glow' : 'accent-amber';
    if (isGreen) return 'status-success';
    if (isRed) return 'status-danger';

    if (lum >= 220) return 'content-primary';
    if (lum >= 180) return 'content-secondary';
    if (lum >= 110) return 'content-muted';
    return 'content-dim';
  }

  if (category === 'bg') {
    if (isBlueOrCyan) {
      if (lum < 40) return 'accent-blue-subtle';
      if (lum < 90) return 'accent-blue-dim';
      return 'accent-blue';
    }
    if (isAmberOrOrange) {
      if (lum < 45) return 'accent-amber-subtle';
      if (lum < 150) return 'accent-amber-hover';
      return 'accent-amber';
    }
    if (isGreen) {
      if (lum < 60) return 'status-success-dim';
      return 'status-success';
    }
    if (isRed) {
      if (lum < 60) return 'status-danger-dim';
      return 'status-danger';
    }

    if (lum <= 10) return 'surface-deep';
    if (lum <= 18) return 'surface-panel';
    if (lum <= 25) return 'surface-raised';
    if (lum <= 35) return 'surface-elevated';
    if (lum <= 70) return 'surface-hover';
    if (lum >= 220) return 'white';
    if (lum >= 180) return 'content-secondary';
    if (lum >= 110) return 'content-muted';
    return 'content-dim';
  }

  if (category === 'border' || category === 'divide') {
    if (isBlueOrCyan) {
      if (lum < 60) return 'accent-blue-subtle';
      if (lum < 110) return 'accent-blue-dim';
      return 'accent-blue';
    }
    if (isAmberOrOrange) return 'accent-amber';
    if (isGreen) return lum < 60 ? 'status-success-dim' : 'status-success';
    if (isRed) return lum < 60 ? 'status-danger-dim' : 'status-danger';

    if (lum <= 32) return 'border-subtle';
    if (lum <= 50) return 'border-base';
    if (lum <= 100) return 'border-strong';
    if (lum <= 180) return 'border-focus';
    return 'content-primary';
  }

  if (category === 'ring' || category === 'accent') {
    if (isBlueOrCyan) return 'accent-blue';
    if (isAmberOrOrange) return 'accent-amber';
    if (isGreen) return 'status-success';
    if (isRed) return 'status-danger';
    return 'border-focus';
  }

  return null;
}

const TW_CLASS_REGEX = /(?:([a-zA-Z0-9_\-:]+:)?)(text|bg|border|border-t|border-b|border-l|border-r|divide-y|divide-x|divide|ring|accent|stroke|fill)-\[#([0-9a-fA-F]{3,8})(?:\/([0-9.]+|%))?\]/g;

function scanDirectory(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function migrateFile(filePath) {
  const filename = path.basename(filePath);
  if (ALLOWLISTED_FILES.has(filename)) return 0;

  let content = fs.readFileSync(filePath, 'utf8');
  let replacedCount = 0;

  // 1. Replace Tailwind arbitrary classes
  let nextContent = content.replace(TW_CLASS_REGEX, (match, variant = '', prefix, hex, opacity) => {
    let category = 'bg';
    if (prefix.startsWith('border')) category = 'border';
    else if (prefix.startsWith('divide')) category = 'divide';
    else if (prefix === 'text') category = 'text';
    else if (prefix === 'ring') category = 'ring';
    else if (prefix === 'accent') category = 'accent';
    else if (prefix === 'stroke' || prefix === 'fill') category = 'text';

    const token = resolveToken(category, '#' + hex);
    if (!token) return match;

    replacedCount++;
    const opacitySuffix = opacity ? `/${opacity}` : '';
    return `${variant}${prefix}-${token}${opacitySuffix}`;
  });

  // 2. Replace shadow hexes: shadow-[0_0_..._#hex]
  nextContent = nextContent.replace(/shadow-\[0_0_([0-9]+px)_#([0-9a-fA-F]{3,8})\]/g, (m, size, hex) => {
    const lower = ('#' + hex).toLowerCase();
    let col = 'rgba(245,158,11,0.6)';
    if (lower === '#38bdf8') col = 'rgba(56,189,248,0.6)';
    else if (lower === '#10b981' || lower === '#34d399') col = 'rgba(16,185,129,0.6)';
    else if (lower === '#f59e0b') col = 'rgba(245,158,11,0.6)';
    replacedCount++;
    return `shadow-[0_0_${size}_${col}]`;
  });

  if (replacedCount > 0) {
    fs.writeFileSync(filePath, nextContent, 'utf8');
  }
  return replacedCount;
}

function run() {
  const files = scanDirectory(UI_SRC);
  let totalReplaced = 0;
  for (const file of files) {
    const count = migrateFile(file);
    if (count > 0) {
      console.log(`Updated ${path.relative(path.resolve(__dirname, '..'), file)}: ${count} classes replaced.`);
      totalReplaced += count;
    }
  }
  console.log(`\nTotal classes replaced: ${totalReplaced}`);
}

run();
