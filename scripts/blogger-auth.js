#!/usr/bin/env node
/**
 * Re-authorize OAuth with Blogger scope added to existing Gmail scopes.
 * Usage:
 *   node scripts/blogger-auth.js          → prints auth URL
 *   node scripts/blogger-auth.js <code>   → exchanges code for tokens
 */
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const CRED_DIR = path.join(process.env.HOME || '/root', '.gmail-mcp');
const KEYS_PATH = path.join(CRED_DIR, 'gcp-oauth.keys.json');
const TOKENS_PATH = path.join(CRED_DIR, 'credentials.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/blogger',
];

const keys = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf-8'));
const { client_id, client_secret, redirect_uris } = keys.installed || keys.web;

const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const code = process.argv[2];

if (!code) {
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  console.log('\nOpen this URL in your browser:\n');
  console.log(url);
  console.log('\nAfter authorizing, copy the code from the redirect URL and run:');
  console.log('  node scripts/blogger-auth.js <CODE>\n');
} else {
  try {
    const { tokens } = await oauth2.getToken(code);
    // Merge with existing tokens (preserve any fields)
    let existing = {};
    if (fs.existsSync(TOKENS_PATH)) {
      existing = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
    }
    const merged = { ...existing, ...tokens };
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2));
    console.log('\nTokens saved successfully! Scopes:', tokens.scope);
    console.log('Credentials updated at:', TOKENS_PATH);
  } catch (err) {
    console.error('Failed to exchange code:', err.message);
    process.exit(1);
  }
}
