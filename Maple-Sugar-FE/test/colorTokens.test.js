import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from '../src/theme/ritTheme';
import { cssTokens } from '../src/theme/tokens';

const SRC = join(import.meta.dirname, '../src');

// Colors are defined in the first two. The rest stay light in both modes (see
// useColorModeInShell) and have not moved to tokens. Do not add signed-in pages.
const RAW_COLORS_ALLOWED = new Set([
  'theme/ritColors.js',
  'theme/tokens.js',
  'index.css',
  'css/login.css',
  'pages/LandingPage.jsx',
  'pages/LoginPage.jsx',
  'pages/PrivacyPage.jsx',
  'pages/AuthCallbackPage.jsx',
]);

// Layout values set in CSS or by the tour, not colors.
const NON_COLOR_VARIABLES = new Set(['--header-height', '--sidebar-width', '--tour-card-height']);

const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;

const sourceFiles = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(jsx?|css)$/.test(entry.name))
  .map((entry) => {
    const path = join(entry.parentPath, entry.name);
    return { name: relative(SRC, path).split(sep).join('/'), text: readFileSync(path, 'utf8') };
  });

describe('color tokens', () => {
  it('keeps raw colors out of the signed-in app', () => {
    const offenders = sourceFiles
      .filter((file) => !RAW_COLORS_ALLOWED.has(file.name))
      .flatMap((file) =>
        file.text
          .split('\n')
          .map((line, index) => ({ line: line.trim(), number: index + 1 }))
          .filter(({ line }) => RAW_COLOR.test(line))
          .map(({ line, number }) => `${file.name}:${number} ${line}`),
      );
    expect(offenders).toEqual([]);
  });

  it('defines every variable the source reads', () => {
    const missing = sourceFiles.flatMap((file) =>
      [...file.text.matchAll(/var\((--[\w-]+)/g)]
        .map((match) => match[1])
        .filter((name) => !(name in cssTokens.light) && !NON_COLOR_VARIABLES.has(name))
        .map((name) => `${file.name}: ${name}`),
    );
    expect(missing).toEqual([]);
  });

  it('gives both modes the same variables', () => {
    expect(Object.keys(cssTokens.dark).sort()).toEqual(Object.keys(cssTokens.light).sort());
  });

  it('feeds each mode its own variables through the theme', () => {
    expect(lightTheme.components.MuiCssBaseline.styleOverrides[':root']).toEqual(cssTokens.light);
    expect(darkTheme.components.MuiCssBaseline.styleOverrides[':root']).toEqual(cssTokens.dark);
  });

  it('keeps MUI surfaces and CSS surfaces on the same values', () => {
    expect(lightTheme.palette.background.paper).toBe(cssTokens.light['--surface']);
    expect(darkTheme.palette.background.paper).toBe(cssTokens.dark['--surface']);
    expect(lightTheme.palette.background.default).toBe(cssTokens.light['--surface-page']);
    expect(darkTheme.palette.background.default).toBe(cssTokens.dark['--surface-page']);
  });
});
