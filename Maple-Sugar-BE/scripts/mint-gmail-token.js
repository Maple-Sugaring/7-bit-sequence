/**
 * One-time: mints GMAIL_REFRESH_TOKEN for the MAIL_FROM Gmail account.
 *
 * Borrows the local sign-in redirect URI the Google client already allows, so
 * stop the API first. Opens Google's consent page; sign in as MAIL_FROM and
 * allow sending. The token is written straight into .env, never printed.
 *
 * Usage: npm run mint-gmail-token
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, MAIL_FROM, PUBLIC_API_URL } = process.env;
const sender = MAIL_FROM?.trim().toLowerCase();
if (!clientId || !clientSecret || !sender || !PUBLIC_API_URL) {
  console.error('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MAIL_FROM and PUBLIC_API_URL in .env first.');
  process.exit(1);
}

const redirectUri = `${PUBLIC_API_URL}/auth/google/callback`;
const { port, pathname } = new URL(redirectUri);
const state = crypto.randomBytes(24).toString('base64url');

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: 'openid email https://www.googleapis.com/auth/gmail.send',
  access_type: 'offline',
  prompt: 'consent',
  login_hint: sender,
  state,
}).toString();

async function exchange(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const tokens = await response.json();
  if (!response.ok) throw new Error(`Google refused the code: ${tokens.error} ${tokens.error_description ?? ''}`);
  if (!tokens.refresh_token) throw new Error('Google returned no refresh token. Run again.');

  // Read straight from Google over TLS, so decoding without verifying is safe.
  const email = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()).email?.toLowerCase();
  if (email !== sender) throw new Error(`Signed in as ${email}, but MAIL_FROM is ${sender}. Run again as ${sender}.`);
  return tokens.refresh_token;
}

async function saveToEnv(refreshToken) {
  const env = await readFile(envPath, 'utf8');
  const line = `GMAIL_REFRESH_TOKEN=${refreshToken}`;
  const next = /^GMAIL_REFRESH_TOKEN=.*$/m.test(env)
    ? env.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, line)
    : `${env.trimEnd()}\n${line}\n`;
  await writeFile(envPath, next);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== pathname) return res.writeHead(404).end();

  let message;
  try {
    if (url.searchParams.get('state') !== state) throw new Error('State mismatch; run the script again.');
    if (url.searchParams.get('error')) throw new Error(`Google said: ${url.searchParams.get('error')}`);
    await saveToEnv(await exchange(url.searchParams.get('code')));
    message = `Saved GMAIL_REFRESH_TOKEN for ${sender} to .env. You can close this tab.`;
    process.exitCode = 0;
  } catch (error) {
    message = error.message;
    process.exitCode = 1;
  }
  console.log(message);
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(message);
  server.close();
});

server.listen(Number(port), 'localhost', () => {
  console.log(`Sign in as ${sender} and allow sending email:\n${authUrl}`);
  if (process.platform === 'darwin') execFile('open', [authUrl.toString()]);
});
