#!/usr/bin/env bun
// Minimal Blogger API MCP server.
// Reads Google OAuth credentials from /home/node/.gmail-mcp/ (same creds as Gmail MCP,
// which already carries the blogger scope).

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const BLOG_ID = '8184937593770967301'; // wandhealth.blogspot.com
const CREDENTIALS_PATH = '/home/node/.gmail-mcp/credentials.json';
const KEYS_PATH = '/home/node/.gmail-mcp/gcp-oauth.keys.json';

async function getAccessToken() {
  const creds = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
  const keys = JSON.parse(readFileSync(KEYS_PATH, 'utf8')).installed;
  if (creds.expiry_date > Date.now() + 60_000) return creds.access_token;
  const res = await fetch(keys.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: keys.client_id,
      client_secret: keys.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  creds.access_token = data.access_token;
  creds.expiry_date = Date.now() + data.expires_in * 1000;
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds));
  return data.access_token;
}

async function createPost(title, content, labels = []) {
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'blogger#post', title, content, labels }),
  });
  if (!res.ok) throw new Error(`Blogger API ${res.status}: ${await res.text()}`);
  return await res.json();
}

const TOOLS = [
  {
    name: 'create_blogger_post',
    description: 'Publish a new post to the wandhealth.blogspot.com Blogger blog.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Post title' },
        content: { type: 'string', description: 'Post body as HTML' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional labels/tags',
        },
      },
      required: ['title', 'content'],
    },
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

const rl = createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }

  if (req.method === 'initialize') {
    send({
      jsonrpc: '2.0', id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'blogger-mcp', version: '1.0.0' },
      },
    });
  } else if (req.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } });
  } else if (req.method === 'tools/call') {
    const { name, arguments: args } = req.params;
    try {
      if (name === 'create_blogger_post') {
        const post = await createPost(args.title, args.content, args.labels ?? []);
        send({
          jsonrpc: '2.0', id: req.id,
          result: { content: [{ type: 'text', text: `Post published: ${post.url}` }] },
        });
      } else {
        send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Unknown tool: ${name}` } });
      }
    } catch (err) {
      send({
        jsonrpc: '2.0', id: req.id,
        result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true },
      });
    }
  } else if (req.id != null) {
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } });
  }
});
