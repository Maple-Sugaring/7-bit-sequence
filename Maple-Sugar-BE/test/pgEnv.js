/**
 * Opt-in real-Postgres tests. Import AFTER ./env.js: when
 * MAPLE_TEST_DATABASE_URL is set it replaces the unreachable URL env.js forces,
 * before config.js reads it. Use a throwaway database; the tests delete rows.
 *
 *   MAPLE_TEST_DATABASE_URL=postgresql://maple:pw@127.0.0.1:55499/maple_test npm test
 */

export const testDatabaseUrl = process.env.MAPLE_TEST_DATABASE_URL || null;

if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
