/**
 * Host half of the `@local/pin-top` bundle.
 *
 * The Client half owns every pixel; this half owns exactly one thing: the
 * durable colour-label store behind two small HTTP routes on the Host's own web
 * server.
 *
 *   GET  /pin-top/labels                  → { ok: true, value: { bySession } }
 *   POST /pin-top/labels { sessionId, color } → write one label, same value back
 *
 * A `color` of `null` (or an empty string) removes the Session's label. Any
 * other value must name one colour of the palette, otherwise the write is
 * refused: a stored value the Client cannot draw would be a silent no-op.
 *
 * Both routes go through the connection service's own request fence — the same
 * admission the shipped routes use (Host/Origin trust plus a live authenticated
 * peer) — so only the running GUI can read or write labels, and a fence that
 * throws fails closed instead of being mistaken for an admitted request.
 * Storage is one JSON document under the user's DSH home, written through a temp
 * file + rename so a crash mid-write cannot truncate it.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Route the Client half calls. */
export const LABELS_ROUTE = '/pin-top/labels';
/** The palette both halves agree on (`client.js` draws it, this half validates it). */
export const PALETTE = Object.freeze(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']);
/** The DSH home this Host belongs to (`DSH_HOME` when the launcher sets one). */
const DSH_HOME = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME !== '' ? process.env.DSH_HOME : join(homedir(), '.dsh');
/** One JSON document; labels are small, so a single read/write keeps it simple. */
const STORE_PATH = join(DSH_HOME, 'pin-top', 'labels.json');
/** The document shape this half writes. */
const STORE_VERSION = 2;
/** Refuse oversized bodies rather than buffering them. */
const MAX_BODY_BYTES = 64 * 1024;
/** Cap the document so it cannot grow without bound. */
const MAX_LABELED_SESSIONS = 4000;

/** A palette id, or null for "no label". */
function normalizeColor(input) {
  if (input === undefined || input === null || input === '') return null;
  if (typeof input !== 'string') return undefined;
  return PALETTE.includes(input) ? input : undefined;
}

/** Load the store; an unreadable or corrupt document degrades to "no labels". */
async function readStore() {
  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const bySession = {};
    const source = parsed !== null && typeof parsed === 'object' ? parsed.bySession : undefined;
    if (source !== null && typeof source === 'object') {
      for (const [sessionId, color] of Object.entries(source)) {
        if (typeof sessionId !== 'string' || sessionId === '') continue;
        if (typeof color !== 'string' || !PALETTE.includes(color)) continue;
        bySession[sessionId] = color;
      }
    }
    return { version: STORE_VERSION, bySession };
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[pin-top] label store read failed:', error);
    return { version: STORE_VERSION, bySession: {} };
  }
}

/** Serialize read-modify-write cycles so two saves cannot lose one another. */
let writeChain = Promise.resolve();
function serialize(operation) {
  const run = writeChain.then(operation, operation);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let tempSeq = 0;
/** Persist the store atomically (unique temp file in the same directory, then rename). */
async function writeStore(state) {
  await mkdir(dirname(STORE_PATH), { recursive: true });
  tempSeq += 1;
  const temporary = `${STORE_PATH}.${process.pid}.${Date.now()}.${tempSeq}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temporary, STORE_PATH);
  } catch (error) {
    try {
      await rm(temporary, { force: true });
    } catch {
      /* nothing else to clean */
    }
    throw error;
  }
}

/** Answer one request with a JSON body and no caching. */
function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/** Read a request body with a hard byte cap. */
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Serve one request: admission, then GET or POST semantics. */
async function handleRequest(req, res, connection) {
  // No fence, no route: serving labels unguarded is worse than refusing them.
  if (connection === undefined || connection === null || typeof connection.requestRejection !== 'function') {
    sendJson(res, 403, { ok: false, error: 'forbidden' });
    return;
  }
  // Let a throwing fence propagate: the server's own error path answers 500,
  // which denies the write instead of admitting it.
  const rejection = connection.requestRejection({ headers: req.headers, method: req.method, url: req.url });
  if (rejection !== undefined && rejection !== null) {
    sendJson(res, rejection === 401 ? 401 : 403, {
      ok: false,
      error: rejection === 401 ? 'unauthenticated' : 'forbidden',
    });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    sendJson(res, 200, { ok: true, value: await readStore() });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' });
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    sendJson(res, 400, { ok: false, error: 'invalid-json', message: String(error.message ?? error) });
    return;
  }
  const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
  if (sessionId === '') {
    sendJson(res, 400, { ok: false, error: 'session-required' });
    return;
  }
  const color = normalizeColor(body?.color);
  if (color === undefined) {
    sendJson(res, 400, { ok: false, error: 'unknown-color' });
    return;
  }
  let state;
  try {
    state = await serialize(async () => {
      const current = await readStore();
      if (color === null) delete current.bySession[sessionId];
      else current.bySession[sessionId] = color;
      const labeled = Object.keys(current.bySession);
      if (labeled.length > MAX_LABELED_SESSIONS) {
        for (const stale of labeled.slice(0, labeled.length - MAX_LABELED_SESSIONS)) delete current.bySession[stale];
      }
      await writeStore(current);
      return current;
    });
  } catch (error) {
    console.error('[pin-top] label store write failed:', error);
    sendJson(res, 500, { ok: false, error: 'write-failed' });
    return;
  }
  sendJson(res, 200, { ok: true, value: state });
}

/**
 * Mount the label routes next to the shipped web server. A composition without a
 * web server simply never mounts them; the Client half then reports the feature
 * as unavailable instead of failing.
 */
export function apply(ctx) {
  ctx.inject(['webServer', 'connection'], (scoped) => {
    scoped.effect(
      () =>
        scoped.webServer.register({
          kind: 'exact',
          path: LABELS_ROUTE,
          // Return the promise: the server awaits the handler, so a rejection
          // reaches its own error path instead of becoming an unhandled one.
          handler: (req, res) => {
            const connection = scoped.get('connection');
            return handleRequest(req, res, connection).catch((error) => {
              console.error('[pin-top] label route failed:', error);
              if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal' });
            });
          },
        }),
      'pin-top: label routes',
    );
  });
}
