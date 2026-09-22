/**
 * Hermetic environment for the API test process.
 *
 * config.js reads the environment once, at import, and refuses to boot when
 * required variables are missing. Import this module before anything that
 * imports config. Values are forced so a developer shell or .env cannot point
 * the suite at a live database.
 */

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://maple:maple@127.0.0.1:1/maple_sugaring';
process.env.REDIS_URL = '';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-for-validation';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-not-real';
process.env.PUBLIC_API_URL = 'http://127.0.0.1:3999';
process.env.PUBLIC_WEB_URL = 'http://127.0.0.1:5173';
process.env.ALLOWED_EMAIL_DOMAINS = 'g.rit.edu,rit.edu';
process.env.CORS_ORIGINS = '';
