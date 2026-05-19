#!/usr/bin/env node
/**
 * Flovart Serve — HTTP API server for image/video generation.
 *
 * Inspired by OpenCLI's antigravity serve.
 * Exposes OpenAI-compatible image generation + Flovart-native endpoints.
 *
 * Usage:
 *   node tools/flovart/cli.js serve --port 8080
 *   # Then: curl http://localhost:8080/v1/images/generations \
 *     -H "Content-Type: application/json" \
 *     -d '{"prompt": "a cat", "model": "gemini-2.0-flash-exp"}'
 */

import { createServer } from 'node:http';
import { FlovartRuntimeClient, createRuntimeFacade } from './runtime-client.js';
import { formatOutput } from './formatter.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function generateId(prefix = 'flovart') {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = prefix + '_';
  for (let i = 0; i < 24; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    ...extraHeaders,
  });
  res.end(body);
}

// ─── CDP Connection Manager ────────────────────────────────────────────────

class FlovartConnection {
  constructor() {
    this._client = null;
    this._runtime = null;
  }

  async ensureConnected() {
    if (this._runtime) {
      try {
        await this._client.execute('status');
        return this._runtime;
      } catch {
        console.error('[serve] CDP connection lost, reconnecting...');
        await this.disconnect();
      }
    }

    console.error('[serve] Connecting to Flovart via CDP...');
    this._client = new FlovartRuntimeClient();
    try {
      await this._client.connect();
      this._runtime = createRuntimeFacade(this._client);
      console.error('[serve] ✅ CDP connected to Flovart.');
      return this._runtime;
    } catch (err) {
      this._client = null;
      this._runtime = null;
      throw new Error(
        'Cannot connect to Flovart. Make sure:\n' +
        '  1. npm run dev is running\n' +
        '  2. Chrome is started with --remote-debugging-port=9222\n' +
        '  3. Flovart is open in that Chrome window'
      );
    }
  }

  async disconnect() {
    if (this._client) {
      try { await this._client.disconnect(); } catch {}
    }
    this._client = null;
    this._runtime = null;
  }
}

// ─── API Handlers ──────────────────────────────────────────────────────────

async function handleHealth(conn) {
  let flovartStatus = 'disconnected';
  try {
    const rt = await conn.ensureConnected();
    const status = await rt.status?.();
    flovartStatus = status ? 'connected' : 'unknown';
  } catch {}
  return { ok: true, flovart: flovartStatus, server: 'flovart-serve/0.2.0' };
}

async function handleListModels(conn) {
  const rt = await conn.ensureConnected();
  let models = [];
  try {
    const status = await rt.provider?.status?.();
    if (status && status.models) models = status.models;
  } catch {}

  return {
    object: 'list',
    data: [
      { id: 'gemini-2.0-flash-exp', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'google' },
      { id: 'gemini-2.0-flash-exp-image-gen', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'google' },
      { id: 'veo-2.0', object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'google' },
      ...models.map(m => ({ id: m.id || m, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'flovart' })),
    ],
  };
}

async function handleGenerateImage(conn, body) {
  const rt = await conn.ensureConnected();
  const prompt = body.prompt || body.prompt;
  if (!prompt || !prompt.trim()) {
    throw new Error('prompt is required');
  }

  const n = body.n || 1;
  const aspectRatio = body.aspect_ratio || body.aspectRatio || '1:1';
  const model = body.model || 'gemini-2.0-flash-exp';

  console.error(`[serve] Generating image: "${prompt.slice(0, 60)}..." (n=${n}, model=${model})`);

  if (n === 1) {
    const result = await rt.generate?.image?.({
      prompt,
      aspectRatio,
      placeOnCanvas: body.place_on_canvas !== false,
    });

    const data = result?.data || result || {};
    return {
      created: Math.floor(Date.now() / 1000),
      data: [{
        id: data.id || generateId('img'),
        url: data.url || data.href || '',
        b64_json: data.b64_json || null,
        revised_prompt: prompt,
        width: data.width || null,
        height: data.height || null,
        seed: data.seed || null,
      }],
    };
  }

  // Batch: generate n images using shots.json-like approach
  const items = Array.from({ length: n }, (_, i) => ({
    clientShotId: `shot_${i + 1}`,
    prompt: prompt + (n > 1 ? ` (variant ${i + 1})` : ''),
    aspectRatio,
  }));

  const batchResult = await rt.generate?.imagesBatch?.({
    items,
    placeOnCanvas: body.place_on_canvas !== false,
    layout: 'grid',
  });

  const images = (batchResult?.data || batchResult?.images || batchResult || [])
    .map(item => ({
      id: item.id || item.clientShotId || generateId('img'),
      url: item.url || item.href || '',
      b64_json: item.b64_json || null,
      revised_prompt: item.prompt || prompt,
      width: item.width || null,
      height: item.height || null,
      seed: item.seed || null,
    }));

  return {
    created: Math.floor(Date.now() / 1000),
    data: images,
  };
}

async function handleGenerateVideo(conn, body) {
  const rt = await conn.ensureConnected();
  const prompt = body.prompt;
  if (!prompt || !prompt.trim()) {
    throw new Error('prompt is required');
  }

  console.error(`[serve] Generating video: "${prompt.slice(0, 60)}..."`);

  const result = await rt.generate?.video?.({
    prompt,
    sourceImageIds: body.source_image_ids || body.sourceImageIds || [],
    durationSec: body.duration || body.durationSec,
    aspectRatio: body.aspect_ratio || body.aspectRatio,
  });

  return {
    id: result?.jobId || result?.id || generateId('video'),
    status: result?.status || 'queued',
    prompt,
    created_at: new Date().toISOString(),
    ...result,
  };
}

async function handleVideoStatus(conn, jobId) {
  const rt = await conn.ensureConnected();
  const result = await rt.generate?.videoStatus?.({ jobId });
  return {
    id: jobId,
    status: result?.status || 'unknown',
    ...result,
  };
}

async function handleCanvasList(conn) {
  const rt = await conn.ensureConnected();
  const media = await rt.canvas?.listMedia?.();
  return { object: 'list', data: media || [] };
}

async function handleCanvasAddImage(conn, body) {
  const rt = await conn.ensureConnected();
  const result = await rt.canvas?.addImage?.({
    type: 'image',
    href: body.href || body.url || body.image_url,
    mimeType: body.mime_type || body.mimeType || 'image/png',
    name: body.name || 'API Image',
    x: body.x ? Number(body.x) : undefined,
    y: body.y ? Number(body.y) : undefined,
    width: body.width ? Number(body.width) : undefined,
    height: body.height ? Number(body.height) : undefined,
  });
  return { ok: true, result };
}

async function handleStatus(conn) {
  const rt = await conn.ensureConnected();
  const s = await rt.status?.();
  return { ok: true, result: s };
}

// ─── Route dispatching ─────────────────────────────────────────────────────

const ROUTES = {
  'GET /health': (conn) => handleHealth(conn),
  'GET /v1/health': (conn) => handleHealth(conn),
  'GET /v1/models': (conn) => handleListModels(conn),
  'GET /v1/status': (conn) => handleStatus(conn),
  'GET /v1/canvas': (conn) => handleCanvasList(conn),
};

async function routeRequest(method, pathname, conn, body) {
  const staticKey = `${method} ${pathname}`;

  // Static routes
  if (ROUTES[staticKey]) {
    return await ROUTES[staticKey](conn);
  }

  // POST /v1/images/generations
  if (method === 'POST' && pathname === '/v1/images/generations') {
    return await handleGenerateImage(conn, body);
  }

  // POST /v1/video/generations
  if (method === 'POST' && pathname === '/v1/video/generations') {
    return await handleGenerateVideo(conn, body);
  }

  // GET /v1/video/generations/:jobId
  const videoMatch = pathname.match(/^\/v1\/video\/generations\/(.+)$/);
  if (method === 'GET' && videoMatch) {
    return await handleVideoStatus(conn, videoMatch[1]);
  }

  // POST /v1/canvas (add image)
  if (method === 'POST' && pathname === '/v1/canvas') {
    return await handleCanvasAddImage(conn, body);
  }

  throw new ApiError(404, `Not found: ${method} ${pathname}`);
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ─── Server ────────────────────────────────────────────────────────────────

export async function startServe(opts = {}) {
  const port = opts.port ?? 8080;
  const conn = new FlovartConnection();
  let requestInFlight = false;

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      });
      res.end();
      return;
    }

    const url = req.url ?? '/';
    const pathname = url.split('?')[0];

    try {
      // Parse body for POST/PUT
      let body = {};
      if (req.method === 'POST' || req.method === 'PUT') {
        const raw = await readBody(req);
        if (raw.trim()) body = JSON.parse(raw);
      }

      const data = await routeRequest(req.method, pathname, conn, body);
      jsonResponse(res, 200, data);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'Internal server error';

      if (status === 500) {
        console.error('[serve] Error:', message);
      }

      jsonResponse(res, status, {
        error: {
          type: status === 404 ? 'not_found_error' : 'api_error',
          message,
          code: status,
        },
      });
    }
  });

  // ─── Startup message ──────────────────────────────────────────────────
  const banner = `
  ╔══════════════════════════════════════════════╗
  ║         Flovart API Server v0.2.0           ║
  ║  OpenAI-compatible image generation API     ║
  ╚══════════════════════════════════════════════╝

  Server: http://127.0.0.1:${port}

  Endpoints:
    GET  /health                    Health check
    GET  /v1/models                 List models
    GET  /v1/status                 Flovart runtime status
    GET  /v1/canvas                 List canvas media
    POST /v1/images/generations     Generate image (OpenAI compatible)
    POST /v1/video/generations      Generate video
    GET  /v1/video/generations/:id  Video job status
    POST /v1/canvas                 Add image to canvas

  Examples:
    curl http://127.0.0.1:${port}/v1/images/generations \\
      -H "Content-Type: application/json" \\
      -d '{"prompt": "a cute cat", "model": "gemini-2.0-flash-exp"}'

  Press Ctrl+C to stop.
  `;

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      console.error(banner);
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('[serve] Failed to start:', err.message);
      reject(err);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.error('\n[serve] Shutting down...');
      await conn.disconnect();
      server.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  });
}
