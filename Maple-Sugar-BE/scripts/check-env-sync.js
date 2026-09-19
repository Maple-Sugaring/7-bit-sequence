/**
 * Fails if config.js and .env.example drift apart.
 *
 * config.js is the single source of truth for which environment variables
 * the API reads; .env.example is the only place a developer or a deploy
 * actually looks. Nothing enforces that they agree, so this is a cheap,
 * static check rather than a real env parser: it extracts every variable
 * name config.js reads (via required/optional/list/integer or a direct
 * process.env access) and every variable name declared in .env.example
 * (commented-out declarations count as documented), and fails on any
 * variable that appears on only one side.
 *
 * Usage: node scripts/check-env-sync.js
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(rootDir, 'src', 'config.js');
const envExamplePath = join(rootDir, '.env.example');

// Variables config.js legitimately reads outside the required/optional/list/
// integer helpers, or that are read for reasons unrelated to .env (e.g. only
// ever set by the platform). Extend this list rather than the regexes below
// if a new case like that comes up.
const IGNORED = new Set([]);

function extractConfigVars(source) {
  const names = new Set();

  const helperCallPattern = /\b(?:required|optional|list|integer)\(\s*'([A-Z][A-Z0-9_]*)'/g;
  for (const match of source.matchAll(helperCallPattern)) {
    names.add(match[1]);
  }

  const directAccessPattern = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  for (const match of source.matchAll(directAccessPattern)) {
    names.add(match[1]);
  }

  for (const ignored of IGNORED) names.delete(ignored);
  return names;
}

function extractEnvExampleVars(source) {
  const names = new Set();
  const declarationPattern = /^#?\s*([A-Z][A-Z0-9_]*)=/;
  for (const line of source.split('\n')) {
    const match = declarationPattern.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

const [configSource, envExampleSource] = await Promise.all([
  readFile(configPath, 'utf8'),
  readFile(envExamplePath, 'utf8'),
]);

const configVars = extractConfigVars(configSource);
const envExampleVars = extractEnvExampleVars(envExampleSource);

const missingFromEnvExample = [...configVars]
  .filter((name) => !envExampleVars.has(name))
  .sort();
const missingFromConfig = [...envExampleVars]
  .filter((name) => !configVars.has(name))
  .sort();

if (missingFromEnvExample.length || missingFromConfig.length) {
  console.error('config.js and .env.example have drifted out of sync.\n');

  if (missingFromEnvExample.length) {
    console.error('Read by config.js but not documented in .env.example:');
    for (const name of missingFromEnvExample) console.error(`  - ${name}`);
    console.error('');
  }

  if (missingFromConfig.length) {
    console.error('Documented in .env.example but never read by config.js:');
    for (const name of missingFromConfig) console.error(`  - ${name}`);
    console.error('');
  }

  console.error(
    'Update src/config.js and .env.example together so every variable appears in both.',
  );
  process.exit(1);
}

console.log(`config.js and .env.example agree on ${configVars.size} variables.`);
