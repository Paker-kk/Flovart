import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const QUEUE_DIR = join(process.cwd(), '.flovart');
const QUEUE_FILE = join(QUEUE_DIR, 'command-queue.json');
const MAX_COMPLETED_ENTRIES = 80;

function ensureDir() {
  if (!existsSync(QUEUE_DIR)) mkdirSync(QUEUE_DIR, { recursive: true });
}

function emptyQueue() {
  return { version: 1, updatedAt: Date.now(), entries: [] };
}

export function readQueue() {
  ensureDir();
  if (!existsSync(QUEUE_FILE)) return emptyQueue();
  try {
    const parsed = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    return {
      ...emptyQueue(),
      ...parsed,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return emptyQueue();
  }
}

export function writeQueue(queue) {
  ensureDir();
  const completed = queue.entries.filter(entry => entry.status === 'done').slice(-MAX_COMPLETED_ENTRIES);
  const active = queue.entries.filter(entry => entry.status !== 'done');
  const next = {
    version: 1,
    updatedAt: Date.now(),
    entries: [...completed, ...active],
  };
  writeFileSync(QUEUE_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function readRequest(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function flovartBridge() {
  return {
    name: 'flovart-bridge',
    configureServer(server) {
      server.middlewares.use('/__flovart/queue', async (req, res) => {
        if (req.method === 'GET') {
          const queue = readQueue();
          const pending = queue.entries.find(entry => entry.status === 'pending') || null;
          if (pending) {
            pending.status = 'running';
            pending.updatedAt = Date.now();
            writeQueue(queue);
          }
          json(res, 200, pending);
          return;
        }

        if (req.method === 'POST') {
          try {
            const body = await readRequest(req);
            const queue = readQueue();
            const entry = queue.entries.find(item => item.id === body.id);
            if (!entry) {
              json(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `Queue entry not found: ${body.id}` } });
              return;
            }
            entry.status = 'done';
            entry.result = body.error ? { ok: false, error: body.error } : body.result;
            entry.updatedAt = Date.now();
            writeQueue(queue);
            json(res, 200, { ok: true });
          } catch (error) {
            json(res, 400, { ok: false, error: { code: 'BAD_REQUEST', message: error instanceof Error ? error.message : String(error) } });
          }
          return;
        }

        json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' } });
      });
    },
  };
}


export function enqueueCommand(command, args = {}) {
  const id = `flv_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const queue = readQueue();
  const entry = {
    id,
    command,
    args,
    status: 'pending',
    result: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  queue.entries.push(entry);
  writeQueue(queue);
  return { ok: true, accepted: true, queued: true, queueId: id, command };
}

export async function enqueueAndWait(command, args = {}, timeoutMs = 30000) {
  const queued = enqueueCommand(command, args);
  const id = queued.queueId;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 150));
    const updated = readQueue().entries.find(entry => entry.id === id);
    if (updated?.status === 'done') return updated.result;
  }

  return {
    ok: true,
    accepted: true,
    queued: true,
    pending: true,
    queueId: id,
    command,
    message: `Command is still pending after ${timeoutMs}ms. Keep the Flovart browser app open to execute it.`,
  };
}
