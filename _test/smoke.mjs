/**
 * Offline smoke test for the dsh-pin-top bundle.
 *
 * It evaluates the real client.js inside a minimal stand-in for the browser
 * module loader (a React stub plus a recording Cordis context), then exercises
 * what the plugin owns: the pinned-Session sidebar rows with their one-click
 * bridge, the macOS-style colour labels in the shared session menu, and the
 * colour dot inside the shipped session rows. The Host half is exercised over
 * its real HTTP handler against a temporary DSH home.
 */
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = join(here, '..');
const code = await readFile(join(pluginDir, 'client.js'), 'utf8');
const pkg = JSON.parse(await readFile(join(pluginDir, 'package.json'), 'utf8'));
const zh = JSON.parse(await readFile(join(pluginDir, 'locale', 'zh.json'), 'utf8'));
const en = JSON.parse(await readFile(join(pluginDir, 'locale', 'en.json'), 'utf8'));

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

/* ---------------- browser module loader stand-in ---------------- */

let captured = null;
let loadCalls = 0;

function renderChild(child) {
  if (child === null || child === undefined || child === false) return [];
  if (Array.isArray(child)) return child.flatMap(renderChild);
  if (typeof child === 'string' || typeof child === 'number') return [String(child)];
  if (typeof child === 'object' && typeof child.type === 'function') {
    const resolved = child.type({ ...child.props, ...(child.children.length === 0 ? {} : { children: child.children.length === 1 ? child.children[0] : child.children }) });
    return renderChild(resolved);
  }
  return [child];
}

const moduleStub = {
  createElement(type, props, ...children) {
    const flat = children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false);
    if (typeof type === 'function') return renderChild({ type, props: props ?? {}, children: flat });
    return { type, props: props ?? {}, children: flat };
  },
  useMemo: (fn) => fn(),
  useState: (initial) => [initial, () => {}],
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  useEffect: (effect) => {
    effect();
  },
  // Layout effects run during the test render so the opener's single-click path
  // is observable without a browser commit.
  useLayoutEffect: (effect) => {
    effect();
  },
  useCallback: (fn) => fn,
  useRef: (initial) => ({ current: initial }),
  Fragment: 'Fragment',
};

const documentListeners = [];
const styleTexts = [];

/** One attribute-compound selector (`[a][b="v"][c^="p"][d*="s"]`) against one element. */
function matchesSelector(element, selector) {
  const parts = selector.match(/\[[^\]]+\]/g);
  if (parts === null) return false;
  return parts.every((part) => {
    const inner = part.slice(1, -1);
    const star = inner.indexOf('*=');
    const caret = inner.indexOf('^=');
    const eq = inner.indexOf('=');
    if (eq === -1) return element.hasAttribute(inner);
    let operator = '=';
    let name = inner.slice(0, eq);
    let value = inner.slice(eq + 1);
    if (star !== -1) {
      operator = '*=';
      name = inner.slice(0, star);
      value = inner.slice(star + 2);
    } else if (caret !== -1) {
      operator = '^=';
      name = inner.slice(0, caret);
      value = inner.slice(caret + 2);
    }
    value = value.replace(/^["']|["']$/g, '');
    const actual = element.getAttribute(name);
    if (actual === null) return false;
    if (operator === '^=') return actual.startsWith(value);
    if (operator === '*=') return actual.includes(value);
    return actual === value;
  });
}

/** Minimal element: attributes, children, listeners, and a native-looking click. */
function makeElement(tagName) {
  let attributes = {};
  const element = {
    tagName: String(tagName).toUpperCase(),
    dataset: {},
    textContent: '',
    children: [],
    parentElement: null,
    get className() {
      return attributes.class ?? '';
    },
    set className(value) {
      attributes.class = String(value);
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.hasOwn(attributes, name) ? attributes[name] : null;
    },
    hasAttribute(name) {
      return Object.hasOwn(attributes, name);
    },
    appendChild(child) {
      if (child === null || child === undefined) return child;
      if (child.parentElement !== null) child.remove();
      child.parentElement = element;
      element.children.push(child);
      return child;
    },
    insertBefore(child, reference) {
      if (child.parentElement !== null) child.remove();
      child.parentElement = element;
      const at = reference === null || reference === undefined ? -1 : element.children.indexOf(reference);
      if (at === -1) element.children.push(child);
      else element.children.splice(at, 0, child);
      return child;
    },
    removeChild(child) {
      const at = element.children.indexOf(child);
      if (at !== -1) element.children.splice(at, 1);
      child.parentElement = null;
      return child;
    },
    remove() {
      if (element.parentElement !== null) element.parentElement.removeChild(element);
    },
    get isConnected() {
      let node = element;
      while (node.parentElement !== null) node = node.parentElement;
      return node === fakeDocument.body || node === fakeDocument.documentElement;
    },
    get nextElementSibling() {
      if (element.parentElement === null) return null;
      const siblings = element.parentElement.children;
      return siblings[siblings.indexOf(element) + 1] ?? null;
    },
    addEventListener(type, listener) {
      (element._listeners[type] ??= []).push(listener);
    },
    removeEventListener(type, listener) {
      const bucket = element._listeners[type] ?? [];
      const at = bucket.indexOf(listener);
      if (at !== -1) bucket.splice(at, 1);
    },
    scrollIntoView(options) {
      element.scrolled = options === undefined ? true : options.block;
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    click() {
      for (const listener of [...(element._listeners.click ?? [])]) {
        listener({
          target: element,
          preventDefault() {},
          stopPropagation() {},
          stopImmediatePropagation() {},
        });
      }
    },
    querySelector(selector) {
      for (const child of element.children) {
        if (matchesSelector(child, selector)) return child;
        const nested = child.querySelector(selector);
        if (nested !== null) return nested;
      }
      return null;
    },
    querySelectorAll(selector, out = []) {
      for (const child of element.children) {
        if (matchesSelector(child, selector)) out.push(child);
        child.querySelectorAll(selector, out);
      }
      return out;
    },
    _listeners: {},
  };
  return element;
}

/** A whole fake document: one body, one head, the query helpers the plugin uses. */
function makeFakeDocument() {
  const doc = {
    documentElement: makeElement('html'),
    body: makeElement('body'),
    head: makeElement('head'),
    addEventListener(type, listener, capture) {
      documentListeners.push({ type, listener, capture });
    },
    removeEventListener(type, listener) {
      const at = documentListeners.findIndex((entry) => entry.type === type && entry.listener === listener);
      if (at !== -1) documentListeners.splice(at, 1);
    },
    querySelector: (selector) => doc.body.querySelector(selector),
    querySelectorAll: (selector) => doc.body.querySelectorAll(selector),
    createElement: (tag) => makeElement(tag),
    createElementNS: (_namespace, tag) => makeElement(tag),
  };
  doc.head.appendChild = (node) => {
    styleTexts.push(String(node.textContent));
    return node;
  };
  doc.documentElement.appendChild(doc.body);
  return doc;
}

const fakeDocument = makeFakeDocument();
const observers = [];
globalThis.MutationObserver = class MutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    observers.push(this);
  }
  observe(target) {
    this.targets.push(target);
  }
  disconnect() {
    this.targets = [];
    this.disconnected = true;
  }
  /** Test hook: fire the callback once, like a batched mutation record. */
  fire() {
    if (this.targets.length === 0) return;
    this.callback([]);
  }
};
globalThis.document = fakeDocument;

globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      loadCalls += 1;
      captured = definition;
    },
  },
};

// eslint-disable-next-line no-new-func -- evaluates the shipped browser bundle verbatim
new Function('window', code)(globalThis.window);

check('module loader received exactly one definition', loadCalls === 1, `calls=${loadCalls}`);
check('bundle id is the package name', captured?.id === pkg.name, `id=${captured?.id}`);

const mod = captured.factory((name) => {
  if (name === 'react') return moduleStub;
  if (name === 'react/jsx-runtime') return { jsx: moduleStub.createElement, jsxs: moduleStub.createElement, Fragment: 'Fragment' };
  throw new Error(`unexpected require: ${name}`);
});
check('exports apply', typeof mod.apply === 'function');
check('exports inject list', Array.isArray(mod.inject) && mod.inject.length > 0, JSON.stringify(mod.inject));
check(
  'exports the palette the Host validates',
  Array.isArray(mod.COLORS) && JSON.stringify(mod.COLORS.map((color) => color.id)) === JSON.stringify(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']),
  JSON.stringify(mod.COLORS?.map((color) => color.id)),
);

/* ---------------- element tree helpers ---------------- */

function flatten(node, out = []) {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  for (const child of node.children ?? []) flatten(child, out);
  return out;
}

function findAll(node, predicate, out = []) {
  if (node === null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out);
    return out;
  }
  if (predicate(node)) out.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, out);
  return out;
}

/* ---------------- cordis context + observable stores ---------------- */

function makeStore(initial) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      snapshot = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

function translate(namespace, dictionariesForNamespace) {
  return (key, params) => {
    const template = dictionariesForNamespace[key] ?? key;
    if (params === undefined) return template;
    return Object.entries(params).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), template);
  };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** One applied Client run: its own stores, services, ledger and fetch route. */
function createHarness(options = {}) {
  const registrations = [];
  const dictionaries = new Map();
  const events = new Map();
  const services = {};
  const observed = [];
  const unpinnedBy = [];
  const pinnedBy = [];
  const fetchCalls = [];
  const notices = [];
  let labelDocument = options.labels ?? { version: 2, bySession: {} };
  const failLabels = options.failLabels ?? false;
  let registerFailure = null;

  const emit = (name) => {
    for (const listener of [...(events.get(name) ?? [])]) listener(name);
  };

  const workspaceStore = makeStore({
    phase: 'ready',
    items: [
      { workspaceId: 'w1', path: '/tmp/demo-app', title: 'demo-app', sessionIds: ['s1', 's2'] },
      { workspaceId: 'w2', path: '/tmp/other', title: 'default-workspace', sessionIds: ['s4'] },
    ],
    pinnedSessionIds: ['s2', 's4', 's1', 'stale-session'],
    archivedSessionIds: [],
  });
  const sessionStore = makeStore({
    phase: 'ready',
    ids: ['s1', 's2', 's3', 's4'],
    byId: {
      s1: { id: 's1', title: 'Refactor the sidebar', blank: false },
      s2: { id: 's2', title: '   ', blank: false },
      s3: { id: 's3', title: 'Scratch', blank: false },
      s4: { id: 's4', title: 'Default workspace chat', blank: true },
    },
  });

  const menus = {
    registered: [],
    opened: [],
    register(contribution) {
      this.registered.push(contribution);
      return () => {
        const at = this.registered.indexOf(contribution);
        if (at !== -1) this.registered.splice(at, 1);
      };
    },
    notify(text) {
      notices.push(text);
    },
    open(target, point) {
      this.opened.push({ target, point });
    },
  };

  globalThis.fetch = async (input, init = {}) => {
    const method = init.method ?? 'GET';
    fetchCalls.push({ input: String(input), method, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    if (failLabels === 'error') return { ok: false, status: 500, json: async () => ({}) };
    if (failLabels) return { ok: false, status: 404, json: async () => ({}) };
    if (method === 'POST') {
      const body = JSON.parse(String(init.body));
      const bySession = { ...labelDocument.bySession };
      if (body.color === null || body.color === undefined) delete bySession[body.sessionId];
      else bySession[body.sessionId] = body.color;
      labelDocument = { version: 2, bySession };
      return { ok: true, status: 200, json: async () => ({ ok: true, value: labelDocument }) };
    }
    // A read answers with the document as it was when the request started.
    const served = labelDocument;
    if (options.holdGet !== undefined) await options.holdGet;
    return { ok: true, status: 200, json: async () => ({ ok: true, value: served }) };
  };

  services.workspaces = { list: workspaceStore };
  services.sessions = { list: sessionStore };
  services.contextMenus = menus;
  services.layout = { selectPanel: (id) => observed.push(`selectPanel:${String(id)}`) };
  services.uiWorkspace = {
    openSession: (id) => observed.push(`openSession:${id}`),
    unpinSession: (id) => {
      unpinnedBy.push(id);
      return Promise.resolve();
    },
    pinSession: (id) => {
      pinnedBy.push(id);
      const snapshot = workspaceStore.getSnapshot();
      if (!snapshot.pinnedSessionIds.includes(id)) {
        workspaceStore.set({ ...snapshot, pinnedSessionIds: [id, ...snapshot.pinnedSessionIds] });
      }
      return Promise.resolve();
    },
  };

  const disposers = [];
  const ctx = {
    effect(callback, label) {
      const cleanup = callback();
      const dispose = () => {
        if (typeof cleanup === 'function') cleanup();
      };
      disposers.push({ label, dispose });
      return dispose;
    },
    on(name, listener) {
      const bucket = events.get(name) ?? new Set();
      bucket.add(listener);
      events.set(name, bucket);
      return () => bucket.delete(listener);
    },
    locale: {
      register(namespace, registered) {
        dictionaries.set(namespace, registered.zh);
        registrations.push({ kind: 'locale', namespace, dictionaries: registered });
        return () => {};
      },
      bind: (namespace) => translate(namespace, dictionaries.get(namespace) ?? {}),
    },
    get: (name) => services[name],
    // The real Scope exposes the injected services as own properties.
    inject(names, callback) {
      const list = [].concat(names);
      if (!list.every((name) => services[name] !== undefined)) return () => {};
      const scoped = Object.create(ctx);
      for (const name of list) scoped[name] = services[name];
      return callback(scoped);
    },
    slots: {
      inject(key, callback) {
        registrations.push({ kind: 'inject', slot: key });
        const dispose = callback();
        return () => {
          if (typeof dispose === 'function') dispose();
        };
      },
      register(registerOptions, component) {
        if (registerFailure !== null && registerFailure(registerOptions) !== null) throw new Error('slot is not declared yet');
        if (registerOptions.name === 'sidebar.panellist') {
          const clash = registrations.find((entry) => entry.kind === 'register' && !entry.disposed && entry.options.name === registerOptions.name && entry.options.id === registerOptions.id);
          if (clash !== undefined) throw new Error(`list slot "${registerOptions.name}" already has an entry with id "${registerOptions.id}"`);
        }
        if (registerOptions.name === 'main') {
          const clash = registrations.find((entry) => entry.kind === 'register' && !entry.disposed && entry.options.name === registerOptions.name && entry.options.key === registerOptions.key);
          if (clash !== undefined) throw new Error(`keyed slot "main" already has an entry for key "${registerOptions.key}"`);
        }
        const record = { kind: 'register', options: registerOptions, component, disposed: false };
        registrations.push(record);
        return () => {
          if (record.disposed) return;
          record.disposed = true;
          // the real ledger notifies subscribers on every mutation, including this one
          emit('slots/changed');
        };
      },
    },
  };

  mod.apply(ctx);

  const rowsOf = () => registrations.filter((r) => r.kind === 'register' && !r.disposed && r.options.name === 'sidebar.panellist');
  const titleRowsOf = () => rowsOf().filter((r) => (r.options.id ?? '').startsWith('pin-session:'));
  const openersOf = () => registrations.filter((r) => r.kind === 'register' && !r.disposed && r.options.name === 'main');
  const t = translate('pin-top', dictionaries.get('pin-top') ?? {});
  const rowFor = (sessionId) => titleRowsOf().find((r) => r.options.id === `pin-session:${sessionId}`);
  const iconFor = (sessionId, extra = {}) => {
    const row = rowFor(sessionId);
    if (row === undefined) throw new Error('no row for ' + sessionId);
    return row.component({ size: 16, active: false, t, ...row.options.inject(), ...extra });
  };
  const runRow = (id) => {
    const bridge = openersOf().find((entry) => entry.options.key === id);
    if (bridge === undefined) throw new Error('no bridge for ' + id);
    bridge.options.inject().run();
  };

  return {
    disposers,
    /** Run (and forget) the one effect a label names. */
    disposeLabel(label) {
      const at = disposers.findIndex((entry) => entry.label === label);
      if (at === -1) return false;
      disposers.splice(at, 1)[0].dispose();
      return true;
    },
    registrations,
    dictionaries,
    services,
    observed,
    unpinnedBy,
    pinnedBy,
    fetchCalls,
    notices,
    menus,
    workspaceStore,
    sessionStore,
    rowsOf,
    titleRowsOf,
    openersOf,
    rowFor,
    iconFor,
    runRow,
    emit,
    t,
    setRegisterFailure(next) {
      registerFailure = next;
    },
    getLabelDocument: () => labelDocument,
  };
}

const A = createHarness({ labels: { version: 2, bySession: { s1: 'red' } } });
await settle();
// Every applied Client run installs its own tag; the first run's stylesheet is
// the document the browser would read.
const css = styleTexts[0] ?? '';

/* ---------------- dictionaries + display metadata ---------------- */

const localeRegistration = A.registrations.find((r) => r.kind === 'locale');
check('zh and en dictionaries both registered', Boolean(localeRegistration?.dictionaries?.zh && localeRegistration?.dictionaries?.en));
const zhKeys = Object.keys(localeRegistration.dictionaries.zh).sort();
const enKeys = Object.keys(localeRegistration.dictionaries.en).sort();
check('zh/en key sets match', JSON.stringify(zhKeys) === JSON.stringify(enKeys), `${zhKeys.length} vs ${enKeys.length}`);
check('every dictionary key is referenced by the client bundle', zhKeys.every((key) => code.includes(`'${key}'`) || code.includes(`"${key}"`)));
check(
  'every palette colour is named',
  mod.COLORS.every((color) => zhKeys.includes(color.key) && localeRegistration.dictionaries.zh[color.key] !== ''),
  JSON.stringify(mod.COLORS.map((color) => color.key)),
);
check('the tag vocabulary is gone', !zhKeys.some((key) => key.startsWith('tags.')) && !code.includes('parseTags'), JSON.stringify(zhKeys.filter((key) => key.startsWith('tags.'))));
check('zh locale carries meta.title', typeof zh.meta?.title === 'string' && zh.meta.title.length > 0, JSON.stringify(zh.meta));
check('en locale carries meta.title', typeof en.meta?.title === 'string' && en.meta.title.length > 0, JSON.stringify(en.meta));
check('zh locale carries meta.description', typeof zh.meta?.description === 'string' && zh.meta.description.length > 0);
check('en locale carries meta.description', typeof en.meta?.description === 'string' && en.meta.description.length > 0);

/* ---------------- pinned sidebar rows ---------------- */

const rows = A.rowsOf();
check('the section opens with a label row', rows[0]?.options.id === 'pin-top-header' && rows[0]?.options.label?.() === '置顶', JSON.stringify(rows[0]?.options));
check('the label row sorts above the first entry', (rows[0]?.options.order ?? 0) === 99, String(rows[0]?.options.order));
check('one row per pinned session', A.titleRowsOf().length === 3, `rows=${A.titleRowsOf().length}`);
const ids = rows.map((r) => r.options.id);
check(
  'rows follow the Host pin order and nothing else',
  JSON.stringify(ids) === JSON.stringify(['pin-top-header', 'pin-session:s2', 'pin-session:s4', 'pin-session:s1']),
  JSON.stringify(ids),
);
check('no tag section rows are contributed', !rows.some((r) => /pin-tag/.test(r.options.id ?? '')), JSON.stringify(ids));
check(
  'rows sit below the shipped panels (插件 0, 自动化任务 10)',
  A.titleRowsOf().every((r) => (r.options.order ?? 0) >= 100),
  JSON.stringify(A.titleRowsOf().map((r) => r.options.order)),
);
check(
  'row labels follow the session titles',
  JSON.stringify(A.titleRowsOf().map((r) => r.options.label?.())) === JSON.stringify(['未命名会话', '新会话', 'Refactor the sidebar']),
  JSON.stringify(A.titleRowsOf().map((r) => r.options.label?.())),
);
check('row labels are thunks so the sidebar re-reads them', rows.every((r) => typeof r.options.label === 'function'));
check('rows declare no children (nothing is shadowed)', rows.every((r) => r.options.children === undefined));
check('each row carries its own locale seat', rows.every((r) => r.options.locale === 'pin-top'));
check(
  'row registrations inject their Session id',
  A.titleRowsOf().every((r) => typeof r.options.inject === 'function' && String(r.options.inject().sessionId).length > 0),
);
check(
  'row registrations carry the label store, so a colour needs no rebuild',
  A.titleRowsOf().every((r) => typeof r.options.inject().labelsStore?.getSnapshot === 'function'),
);

const idleUncolored = A.iconFor('s2');
check(
  'an idle, uncoloured entry draws only the fixed-width glyph cell',
  idleUncolored?.props?.className === 'pintop-cell' && (idleUncolored?.children ?? []).every((child) => child?.type !== 'svg') && idleUncolored?.props?.['data-pintop-label'] === undefined,
  JSON.stringify(idleUncolored?.props),
);
check('the glyph cell carries the row marker and its Session', idleUncolored?.props?.['data-pintop-row'] === '' && idleUncolored?.props?.['data-pintop-session'] === 's2', JSON.stringify(idleUncolored?.props));
check('the glyph cell keeps every label on one column', code.includes('.pintop-cell{') && code.includes('width:16px;height:16px'));
const headerGlyph = rows[0].component({ size: 16, active: false });
check('the label row draws no glyph column', Object.hasOwn(headerGlyph?.props ?? {}, 'data-pintop-header') && headerGlyph?.props?.style?.display === 'none');

/* ---------------- live session state on each pinned entry ---------------- */

const hookFor = (map) => (selector) => selector(map);
const glyphOf = (node) => (node?.children ?? [])[0];

const idle = A.iconFor('s1', { useSessionStatus: hookFor(new Map()) });
check('an idle session shows no status glyph', (idle?.children ?? []).every((child) => child?.props?.['data-state'] === undefined));
check('an idle but labelled session shows its colour dot instead', glyphOf(idle)?.props?.className === 'pintop-dot' && glyphOf(idle)?.props?.['data-pintop-label'] === 'red', JSON.stringify(glyphOf(idle)?.props));
check('the dot is named for hover', idle?.props?.title === '红色', String(idle?.props?.title));

const running = A.iconFor('s1', { useSessionStatus: hookFor(new Map([['s1', { running: true }]])) });
check(
  'a running session gets the working ring',
  glyphOf(running)?.props?.['data-state'] === 'ongoing' && glyphOf(running)?.props?.width === 14,
  JSON.stringify(glyphOf(running)?.props),
);
check(
  'the working ring is two stroked circles',
  (glyphOf(running)?.children ?? []).length === 2 && glyphOf(running).children.every((child) => child?.type === 'circle'),
);
check('the ring is named for hover, beside its colour', running?.props?.title === '运行中 · 红色', String(running?.props?.title));
check(
  'a coloured row still reports its colour for the tint',
  running?.props?.['data-pintop-label'] === 'red' && running?.props?.['data-pintop-state'] === 'ongoing',
  JSON.stringify(running?.props),
);

const approval = A.iconFor('s1', { useSessionStatus: hookFor(new Map([['s1', { running: true, pendingInteraction: { kind: 'approval', key: 1 } }]])) });
check(
  'a pending approval outranks activity',
  glyphOf(approval)?.props?.['data-state'] === 'warning' && approval?.props?.title === '等待确认 · 红色',
  JSON.stringify(glyphOf(approval)?.props),
);
check('a state dot is a 10px box with a 6px dot', glyphOf(approval)?.props?.width === 10 && glyphOf(approval)?.children?.[0]?.props?.r === 3);

const question = A.iconFor('s2', { useSessionStatus: hookFor(new Map([['s2', { pendingInteraction: { kind: 'question' } }]])) });
check('a pending question is named too', question?.props?.title === '等待回答', String(question?.props?.title));

const unread = A.iconFor('s2', { useSessionStatus: hookFor(new Map([['s2', { completionUnread: true }]])) });
check(
  'an unread completion gets the done dot',
  glyphOf(unread)?.props?.['data-state'] === 'done' && unread?.props?.title === '已完成，未读',
  JSON.stringify(unread?.props),
);

const otherSession = A.iconFor('s1', { useSessionStatus: hookFor(new Map([['s9', { running: true }]])) });
check('another session status does not leak in', glyphOf(otherSession)?.props?.className === 'pintop-dot');

const plainObjectStatus = A.iconFor('s2', { useSessionStatus: hookFor({ s2: { running: true } }) });
check('a plain-record status face works too', glyphOf(plainObjectStatus)?.props?.['data-state'] === 'ongoing');

const noHook = A.iconFor('s2');
check('a composition without the status face still renders the row', noHook?.props?.className === 'pintop-cell' && (noHook?.children ?? []).every((child) => child?.type !== 'svg'));

/* ---------------- unpin from the section itself ---------------- */

const rowProps = { ...A.rowFor('s2').options.inject(), t: A.t };
rowProps.unpin = () => {
  A.unpinnedBy.push('s2');
  return Promise.resolve();
};
const withAction = A.rowFor('s2').component({ size: 16, active: false, ...rowProps });
const action = (withAction?.children ?? []).find((child) => child?.props?.className === 'pintop-unpin');
check('every pinned row carries an unpin action', Boolean(action), JSON.stringify(withAction?.children?.map((child) => child?.props)));
check('the action is named for pointer use', action?.props?.title === '取消置顶（不打开会话）', JSON.stringify(action?.props));
check('the inline action is pointer-only, so it never nests a focusable control in the row', action?.props?.role === undefined && action?.props?.tabIndex === undefined, JSON.stringify(action?.props));
check('the action advertises its own hit area above the shell button', css.includes('.pintop-unpin{position:absolute;inset-inline-end:0;top:2px;z-index:2;'));
check(
  'the shell per-entry button is suppressed on every row this plugin owns',
  css.includes('[data-pintop-header],[data-pintop-control]') && css.includes('~[class*="panelUnpin"]{display:none}'),
);
check('the inline action carries no ARIA role it cannot honour', !code.includes("'aria-label': label"));

const beforeClicks = A.observed.length;
let stopped = 0;
action?.props?.onClick({ preventDefault() {}, stopPropagation() { stopped += 1; } });
await settle();
check('clicking the action unpins that session', A.unpinnedBy.join() === 's2', JSON.stringify(A.unpinnedBy));
check('clicking the action does not open the session', A.observed.length === beforeClicks && !A.observed.includes('openSession:s2'), JSON.stringify(A.observed.slice(beforeClicks)));
check('the action keeps its click away from the row', stopped === 1);

const withoutAction = A.rowFor('s2').component({ size: 16, active: false, sessionId: 's2', t: A.t });
check('a composition without the command draws no action', !(withoutAction?.children ?? []).some((child) => child?.props?.className === 'pintop-unpin'));

const broken = A.rowFor('s1').component({ size: 16, active: false, sessionId: 's1', t: () => { throw new Error('locale down'); }, unpin: null });
check('a decoration failure still yields a usable row', broken?.props?.className === 'pintop-cell' && broken?.props?.['data-pintop-row'] !== undefined, JSON.stringify(broken?.props));

/* ---------------- the capture listener owns the unpin click ---------------- */

const captureListener = documentListeners.find((entry) => entry.type === 'click' && entry.capture === true);
check('a capture-phase click listener is installed on the document', Boolean(captureListener), JSON.stringify(documentListeners.map((entry) => entry.type)));
check('the marker names the session the action belongs to', action?.props?.['data-pintop-unpin'] === '' && action?.props?.['data-pintop-session'] === 's2', JSON.stringify(action?.props));

const captureWithSession = (sessionId) => {
  const fakeAction = {
    getAttribute: (name) => (name === 'data-pintop-session' ? sessionId : ''),
  };
  const order = [];
  const event = {
    target: { closest: (selector) => (selector === '[data-pintop-unpin]' ? fakeAction : null) },
    preventDefault: () => order.push('preventDefault'),
    stopPropagation: () => order.push('stopPropagation'),
    stopImmediatePropagation: () => order.push('stopImmediatePropagation'),
  };
  captureListener.listener(event);
  return order;
};
const order = captureWithSession('s7');
check('the capture listener cancels the row activation first', order[0] === 'preventDefault' && order.includes('stopPropagation') && order.includes('stopImmediatePropagation'), JSON.stringify(order));

const unrelated = { target: { closest: () => null }, preventDefault() { throw new Error('must not cancel unrelated clicks'); }, stopPropagation() {} };
let unrelatedFailure = null;
try {
  captureListener.listener(unrelated);
} catch (error) {
  unrelatedFailure = error;
}
check('clicks elsewhere are left alone', unrelatedFailure === null);

/* ---------------- one click: row -> session ---------------- */

const openers = A.openersOf();
check('one bridging panel per row', openers.length === rows.length, `openers=${openers.length} rows=${rows.length}`);
check('bridging panels declare no children', openers.every((r) => r.options.children === undefined));
check('bridging panels answer the row ids', openers.map((r) => r.options.key).join() === rows.map((r) => r.options.id).join());

const headerBridge = openers[0].options.inject?.() ?? {};
let headerFailure = null;
try {
  openers[0].component(headerBridge);
} catch (error) {
  headerFailure = error;
}
check('the label row is inert but never throws when activated', headerFailure === null, String(headerFailure));
check('activating the label row returns to the conversation', A.observed.includes('selectPanel:null'), JSON.stringify(A.observed));

let openFailure = null;
let rendered = null;
try {
  rendered = openers[1].component(openers[1].options.inject());
} catch (error) {
  openFailure = error;
}
check('opener mounts without throwing', openFailure === null, String(openFailure));
check('opener renders nothing of its own', rendered === null);
check('selecting a row opens its session exactly once', A.observed.filter((entry) => entry === 'openSession:s2').length === 1, JSON.stringify(A.observed));
const openerFour = A.openersOf().find((entry) => entry.options.key === 'pin-session:s4').options.inject();
openerFour.run();
check('each opener targets its own session', A.observed.includes('openSession:s4'), JSON.stringify(A.observed));
openerFour.leavePanel();
check('opener can clear the panel', A.observed.includes('selectPanel:null'), JSON.stringify(A.observed));

/* ---------------- reactivity: unpin / rename / archive ---------------- */

const beforeRows = A.rowsOf();
const beforeOpeners = A.openersOf();
const rowForS4 = beforeRows.find((entry) => entry.options.id === 'pin-session:s4');
const openerForS4 = beforeOpeners.find((entry) => entry.options.key === 'pin-session:s4');
A.workspaceStore.set({ ...A.workspaceStore.getSnapshot(), pinnedSessionIds: ['s2', 's1'] });
check(
  'removing a pin disposes its row and its bridge',
  rowForS4?.disposed === true && openerForS4?.disposed === true,
  JSON.stringify({ row: rowForS4?.disposed, bridge: openerForS4?.disposed }),
);
check(
  'the plan is rebuilt wholesale, so kept rows are re-registered once',
  beforeRows.find((entry) => entry.options.id === 'pin-session:s2')?.disposed === true &&
    A.rowsOf().filter((entry) => entry.options.id === 'pin-session:s2').length === 1,
  JSON.stringify(A.rowsOf().map((entry) => entry.options.id)),
);
check(
  'the honest ledger sees exactly one live entry per id',
  new Set(A.rowsOf().map((entry) => entry.options.id)).size === A.rowsOf().length,
  JSON.stringify(A.rowsOf().map((entry) => entry.options.id)),
);
check('pin removal shrinks the pinned rows', A.titleRowsOf().length === 2, `rows=${A.titleRowsOf().length}`);
check('pin removal drops their bridging panels', A.openersOf().length === A.rowsOf().length, `openers=${A.openersOf().length}`);
check(
  'remaining rows keep pin order',
  JSON.stringify(A.rowsOf().map((r) => r.options.id)) === JSON.stringify(['pin-top-header', 'pin-session:s2', 'pin-session:s1']),
  JSON.stringify(A.rowsOf().map((r) => r.options.id)),
);

const countAfterPinChange = A.registrations.filter((r) => r.kind === 'register').length;
A.emit('slots/changed');
check('an unchanged pin set does not re-register', A.registrations.filter((r) => r.kind === 'register').length === countAfterPinChange);

A.sessionStore.set({
  ...A.sessionStore.getSnapshot(),
  byId: { ...A.sessionStore.getSnapshot().byId, s1: { id: 's1', title: 'Renamed session', blank: false } },
});
check('rename refreshes the row label', A.rowsOf().every((r) => r.options.label?.() !== 'Refactor the sidebar'), JSON.stringify(A.rowsOf().map((r) => r.options.label?.())));
check('rename keeps both entries', A.titleRowsOf().length === 2);

A.workspaceStore.set({ ...A.workspaceStore.getSnapshot(), archivedSessionIds: ['s2'] });
check(
  'archived pin leaves the sidebar',
  A.rowsOf().every((r) => !r.options.id.endsWith(':s2')),
  JSON.stringify(A.rowsOf().map((r) => r.options.id)),
);

A.workspaceStore.set({ ...A.workspaceStore.getSnapshot(), archivedSessionIds: [], pinnedSessionIds: [] });
check('no pins leaves no rows at all', A.titleRowsOf().length === 0 && A.rowsOf().length === 0, JSON.stringify(A.rowsOf().map((r) => r.options.id)));

/* ---------------- declared-late seats are retried ---------------- */

A.setRegisterFailure((registerOptions) => (registerOptions.name === 'sidebar.panellist' ? 'declared? no' : null));
A.workspaceStore.set({ ...A.workspaceStore.getSnapshot(), pinnedSessionIds: ['s1', 's3'] });
check(
  'a not-yet-declared slot leaves no half-wired row',
  A.rowsOf().length === 0 && A.openersOf().length === 0,
  `rows=${A.rowsOf().length} openers=${A.openersOf().length}`,
);
// While the slot still rejects, the partial plan's own disposal events must not
// drive another attempt (that would spin the microtask queue forever).
const attemptsWhileFailing = A.registrations.length;
await settle();
check(
  'a failing plan is not requeued by its own disposal events',
  A.registrations.length === attemptsWhileFailing,
  `${A.registrations.length - attemptsWhileFailing} new registrations after the failure settled`,
);
A.setRegisterFailure(null);
A.emit('slots/changed');
check(
  'the next slot change retries and lands the full set',
  A.titleRowsOf().length === 2 && A.openersOf().length === A.rowsOf().length,
  `pinned=${A.titleRowsOf().length} rows=${A.rowsOf().length} openers=${A.openersOf().length}`,
);

/* ---------------- collapse: many pins stay short ---------------- */

const manyIds = ['s1', 's3', 's5', 's6', 's7', 's8', 's9'];
const manySessions = {
  phase: 'ready',
  ids: manyIds,
  byId: Object.fromEntries(manyIds.map((id) => [id, { id, title: `Session ${id}`, blank: false }])),
};
A.workspaceStore.set({
  phase: 'ready',
  items: [{ workspaceId: 'w1', path: '/tmp/many', title: 'many', sessionIds: manyIds }],
  pinnedSessionIds: manyIds,
  archivedSessionIds: [],
});
A.sessionStore.set(manySessions);
check('long pin sets collapse to the limit', A.titleRowsOf().length === 4, `title rows=${A.titleRowsOf().length}`);
const moreRow = A.rowsOf().find((r) => r.options.id === 'pin-top-more');
check('the collapsed section offers the remaining count', Boolean(moreRow) && moreRow.options.label?.() === '还有 3 个置顶…', JSON.stringify(moreRow?.options.label?.()));
const moreBridge = A.openersOf().find((r) => r.options.key === 'pin-top-more');
check('the remaining-count row has a bridge', Boolean(moreBridge));
moreBridge.options.inject().run();
await settle();
check('expanding lands every pin', A.titleRowsOf().length === 7, `title rows=${A.titleRowsOf().length}`);
const lessRow = A.rowsOf().find((r) => r.options.id === 'pin-top-less');
check('the expanded section offers a collapse control', Boolean(lessRow) && lessRow.options.label?.() === '收起', JSON.stringify(lessRow?.options.label?.()));
check('an expanded section no longer counts the rest', !A.rowsOf().some((r) => r.options.id === 'pin-top-more'));
A.openersOf().find((r) => r.options.key === 'pin-top-less').options.inject().run();
await settle();
check('collapsing again hides the tail', A.titleRowsOf().length === 4);

A.workspaceStore.set({ ...A.workspaceStore.getSnapshot(), pinnedSessionIds: ['s1', 's3'] });
A.sessionStore.set({
  phase: 'ready',
  ids: ['s1', 's2', 's3', 's4'],
  byId: {
    s1: { id: 's1', title: 'Refactor the sidebar', blank: false },
    s2: { id: 's2', title: 'Sketch the top bar', blank: false },
    s3: { id: 's3', title: 'Scratch', blank: false },
    s4: { id: 's4', title: 'Default workspace chat', blank: true },
  },
});
await settle();

/* ---------------- colour labels: storage, menu, dots ---------------- */

check(
  'the label document is loaded from the Host route',
  A.fetchCalls.some((call) => call.method === 'GET' && call.input === '/pin-top/labels'),
  JSON.stringify(A.fetchCalls),
);
check('the stored colour reaches the pinned row without a rebuild', A.iconFor('s1')?.props?.['data-pintop-label'] === 'red');
check('an unlabelled row carries no colour', A.iconFor('s3')?.props?.['data-pintop-label'] === undefined);

const dotRegistration = A.registrations.find((r) => r.kind === 'register' && r.options.name === 'sidebar.session.row.trailing');
check('one ambient dot is registered after each shipped session row', Boolean(dotRegistration), JSON.stringify(A.registrations.filter((r) => r.kind === 'register').map((r) => r.options.name)));
check('the dot declares its order', dotRegistration?.options.order === 20, JSON.stringify(dotRegistration?.options));
const dot = dotRegistration.component({ ...dotRegistration.options.inject(), sessionId: 's1', t: A.t });
check('a labelled session shows its dot in the tree', dot?.props?.className === 'pintop-dot' && dot?.props?.['data-pintop-label'] === 'red', JSON.stringify(dot?.props));
check('the dot is decorative, not a second accessible name', dot?.props?.['aria-hidden'] === 'true' && dot?.props?.title === undefined, JSON.stringify(dot?.props));
check('an unlabelled session shows no dot', dotRegistration.component({ ...dotRegistration.options.inject(), sessionId: 's3', t: A.t }) === null);

const contribution = A.menus.registered.find((entry) => entry.id === 'pin-top.labels');
check('the shared menu carries one session-label contribution', Boolean(contribution), JSON.stringify(A.menus.registered.map((entry) => entry.id)));
check('it targets the session family', contribution?.target === 'session');
check('it sits after the shipped fork action and before the id copy', contribution?.order === 350, String(contribution?.order));
check(
  'it re-resolves against the label store and the locale while open',
  Array.isArray(contribution.observe?.()) && contribution.observe().length === 2,
  JSON.stringify(contribution.observe?.()?.map((entry) => typeof entry)),
);

const menuActions = contribution.resolve({ sessionId: 's1', displayTitle: 'Refactor the sidebar' });
const submenu = menuActions[0];
check('the contribution is one colour submenu', submenu?.id === 'label-color' && submenu?.label === '标签颜色', JSON.stringify(submenu?.label));
check('the submenu is not selectable itself', submenu?.run === undefined);
check('the submenu carries a neutral swatch', submenu?.icon?.key === 'pin-top.label.none', JSON.stringify(submenu?.icon));
const colorItems = submenu.children.filter((item) => item.id.startsWith('label:') && item.id !== 'label:clear');
check('seven colours are offered', colorItems.length === 7, JSON.stringify(colorItems.map((item) => item.id)));
check(
  'the palette is offered in order',
  JSON.stringify(colorItems.map((item) => item.id)) === JSON.stringify(mod.COLORS.map((color) => 'label:' + color.id)),
  JSON.stringify(colorItems.map((item) => item.id)),
);
check(
  'each colour carries its own swatch key',
  colorItems.every((item, index) => item.icon.key === 'pin-top.label.' + mod.COLORS[index].id),
  JSON.stringify(colorItems.map((item) => item.icon.key)),
);
check(
  'the current colour is checked and the others are bare',
  colorItems[0].label === '✓ 红色' && colorItems[2].label === '黄色',
  JSON.stringify(colorItems.map((item) => item.label)),
);
const clearItem = submenu.children.find((item) => item.id === 'label:clear');
check('removing a colour leads the submenu', submenu.children[0] === clearItem, JSON.stringify(submenu.children.map((item) => item.id)));
check('the palette follows behind one separator', colorItems[0].separatorBefore === true && colorItems.slice(1).every((item) => item.separatorBefore !== true), JSON.stringify(colorItems.map((item) => item.separatorBefore)));
check('clearing is offered for a coloured session', clearItem?.disabled === false, JSON.stringify(clearItem));
check('every colour action names its own failure text', colorItems.every((item) => item.failureLabel === '标签颜色保存失败'), JSON.stringify(colorItems.map((item) => item.failureLabel)));

const registrationsBeforeColors = A.registrations.filter((r) => r.kind === 'register').length;
const blueItem = colorItems.find((item) => item.id === 'label:blue');
await blueItem.run();
await settle();
const bluePost = A.fetchCalls.filter((call) => call.method === 'POST' && call.input === '/pin-top/labels').pop();
check('picking a colour posts it to the Host route', bluePost?.body?.sessionId === 's1' && bluePost?.body?.color === 'blue', JSON.stringify(bluePost));
check('a colour already pinned does not pin again', A.pinnedBy.length === 0, JSON.stringify(A.pinnedBy));
check('the row picks the new colour up in place', A.iconFor('s1')?.props?.['data-pintop-label'] === 'blue');
check('a colour change does not rebuild the section', A.registrations.filter((r) => r.kind === 'register').length === registrationsBeforeColors);
check(
  'the reopened menu marks the new colour',
  contribution.resolve({ sessionId: 's1', displayTitle: 'Refactor the sidebar' })[0].children.find((item) => item.id === 'label:blue').label === '✓ 蓝色',
);

const s2Actions = contribution.resolve({ sessionId: 's2', displayTitle: 'Sketch the top bar' });
check('a session without a colour offers no checked row', s2Actions[0].children.every((item) => !item.label.startsWith('✓')), JSON.stringify(s2Actions[0].children.map((item) => item.label)));
check('and its clear row is disabled', s2Actions[0].children.find((item) => item.id === 'label:clear').disabled === true);
check('the unpinned session is not in the section yet', !A.titleRowsOf().some((r) => r.options.id === 'pin-session:s2'));
await s2Actions[0].children.find((item) => item.id === 'label:green').run();
await settle();
check('a colour on an unpinned session pins it', A.pinnedBy.join() === 's2', JSON.stringify(A.pinnedBy));
check('the newly pinned session joins the section', A.titleRowsOf().some((r) => r.options.id === 'pin-session:s2'), JSON.stringify(A.titleRowsOf().map((r) => r.options.id)));
check('and it carries the colour', A.iconFor('s2')?.props?.['data-pintop-label'] === 'green');

const clearActions = contribution.resolve({ sessionId: 's2', displayTitle: 'Sketch the top bar' });
await clearActions[0].children.find((item) => item.id === 'label:clear').run();
await settle();
const clearPost = A.fetchCalls.filter((call) => call.method === 'POST' && call.input === '/pin-top/labels').pop();
check('clearing posts a null colour', clearPost?.body?.sessionId === 's2' && clearPost?.body?.color === null, JSON.stringify(clearPost));
check('clearing keeps the pin and drops only the colour', A.iconFor('s2')?.props?.['data-pintop-label'] === undefined && A.titleRowsOf().some((r) => r.options.id === 'pin-session:s2'));

const iconRegistration = A.registrations.filter((r) => r.kind === 'register' && r.options.name === 'contextMenu.icon');
check('one swatch glyph per colour plus "none"', iconRegistration.length === 8, String(iconRegistration.length));
check(
  'the swatches use this plugin\'s key space',
  iconRegistration.every((r) => String(r.options.key).startsWith('pin-top.label.')),
  JSON.stringify(iconRegistration.map((r) => r.options.key)),
);
check(
  'a swatch draws the colour the key names',
  iconRegistration.every((r) => {
    const swatch = r.component({ icon: { key: r.options.key } });
    const expected = r.options.key.slice('pin-top.label.'.length);
    return swatch?.props?.className === 'pintop-swatch' && swatch?.props?.['data-pintop-label'] === expected;
  }),
);
const noneSwatch = iconRegistration.find((r) => r.options.key === 'pin-top.label.none').component({ icon: { key: 'pin-top.label.none' } });
check('the neutral swatch is an outline', noneSwatch?.props?.['data-pintop-label'] === 'none' && css.includes('.pintop-swatch[data-pintop-label="none"]{box-sizing:border-box;border:1.5px solid var(--dsw-alias-label-tertiary);background:transparent}'));

const contextListener = documentListeners.find((entry) => entry.type === 'contextmenu' && entry.capture === true);
check('a capture-phase contextmenu listener serves this plugin\'s own rows', Boolean(contextListener), JSON.stringify(documentListeners.map((entry) => entry.type)));

const menuOpenedBefore = A.menus.opened.length;
const fakeRow = { getAttribute: (name) => (name === 'data-pintop-session' ? 's1' : '') };
const contextOrder = [];
contextListener.listener({
  target: { closest: (selector) => (selector === '[data-pintop-session]' ? fakeRow : null) },
  clientX: 320,
  clientY: 240,
  preventDefault: () => contextOrder.push('preventDefault'),
  stopPropagation: () => contextOrder.push('stopPropagation'),
  stopImmediatePropagation: () => contextOrder.push('stopImmediatePropagation'),
});
check('right-clicking a pinned row opens the shared session menu', A.menus.opened.length === menuOpenedBefore + 1, JSON.stringify(A.menus.opened));
const opened = A.menus.opened[A.menus.opened.length - 1];
check(
  'the menu targets that session at the pointer',
  opened?.target?.kind === 'session' && opened?.target?.value?.sessionId === 's1' && opened?.point?.x === 320 && opened?.point?.y === 240,
  JSON.stringify(opened),
);
check('the menu carries the row title for the shipped actions', opened?.target?.value?.displayTitle === 'Refactor the sidebar', JSON.stringify(opened?.target?.value));
check('the plugin cancels the browser menu first', contextOrder[0] === 'preventDefault' && contextOrder.includes('stopPropagation'), JSON.stringify(contextOrder));
const quietListener = (() => {
  let fired = 0;
  contextListener.listener({ target: { closest: () => null }, preventDefault: () => { fired += 1; }, stopPropagation() {} });
  return fired;
})();
check('right-clicks outside this plugin\'s rows are left alone', quietListener === 0 && A.menus.opened.length === menuOpenedBefore + 1);

// The marker lives in the glyph cell: a right-click on the row's *title* has to
// find it through the row button the shell renders.
const titleTarget = {
  closest: (selector) => {
    if (selector === '[data-pintop-session]') return null;
    return selector === 'button' ? { querySelector: (inner) => (inner === '[data-pintop-session]' ? fakeRow : null) } : null;
  },
};
const titleOrder = [];
contextListener.listener({
  target: titleTarget,
  clientX: 120,
  clientY: 200,
  preventDefault: () => titleOrder.push('preventDefault'),
  stopPropagation: () => titleOrder.push('stopPropagation'),
  stopImmediatePropagation: () => titleOrder.push('stopImmediatePropagation'),
});
const titled = A.menus.opened[A.menus.opened.length - 1];
check(
  'right-clicking the row title reaches the same session',
  A.menus.opened.length === menuOpenedBefore + 2 && titled?.target?.value?.sessionId === 's1' && titleOrder[0] === 'preventDefault',
  JSON.stringify(titled),
);

// A keyboard/zero-coordinate gesture anchors on the row instead of the origin.
const anchoredRow = {
  getAttribute: (name) => (name === 'data-pintop-session' ? 's1' : ''),
  getBoundingClientRect: () => ({ left: 40, bottom: 90 }),
};
contextListener.listener({
  target: { closest: (selector) => (selector === '[data-pintop-session]' ? anchoredRow : null) },
  clientX: 0,
  clientY: 0,
  preventDefault() {},
  stopPropagation() {},
  stopImmediatePropagation() {},
});
const anchored = A.menus.opened[A.menus.opened.length - 1];
check(
  'the anchored gesture is the third menu of this run',
  A.menus.opened.length === menuOpenedBefore + 3,
  `${A.menus.opened.length - menuOpenedBefore} menus opened`,
);
check(
  'a gesture without pointer coordinates lands on the row, not at the origin',
  anchored?.point?.x === 40 && anchored?.point?.y === 90,
  JSON.stringify(anchored?.point),
);
// The shell binds the menu key on its own rows only; the plugin supplies it for
// the rows it contributes, anchored on the row rather than the pointer.
const keyListener = documentListeners.find((entry) => entry.type === 'keydown' && entry.capture === true);
check('a capture-phase keydown listener supplies the menu key', Boolean(keyListener), JSON.stringify(documentListeners.map((entry) => entry.type)));
const menuOpenedBeforeKey = A.menus.opened.length;
keyListener.listener({
  key: 'F10',
  shiftKey: true,
  repeat: false,
  target: { closest: (selector) => (selector === 'button' ? { querySelector: (inner) => (inner === '[data-pintop-session]' ? anchoredRow : null) } : null) },
  preventDefault() {},
  stopPropagation() {},
  stopImmediatePropagation() {},
});
const byKey = A.menus.opened[A.menus.opened.length - 1];
check(
  'shift+F10 on a pinned row opens its menu at the row',
  A.menus.opened.length === menuOpenedBeforeKey + 1 && byKey?.target?.value?.sessionId === 's1' && byKey?.point?.y === 90,
  JSON.stringify(byKey),
);
keyListener.listener({ key: 'F10', shiftKey: false, target: { closest: () => null } });
keyListener.listener({ key: 'Enter', target: { closest: () => null } });
check('other keys and other rows stay untouched', A.menus.opened.length === menuOpenedBeforeKey + 1);


const unavailable = createHarness({ failLabels: true });
await settle();
const unavailableActions = unavailable.menus.registered.find((entry) => entry.id === 'pin-top.labels').resolve({ sessionId: 's1', displayTitle: 'Refactor the sidebar' });
check(
  'an unanswered Host route degrades to one saying so',
  unavailableActions.length === 1 && unavailableActions[0].disabled === true && unavailableActions[0].label === '标签颜色（重启应用后可用）',
  JSON.stringify(unavailableActions),
);
check('the unavailable state is reported once, not thrown', unavailable.registrations.some((r) => r.kind === 'register'));

const failing = createHarness({ failLabels: 'error' });
await settle();
const failingActions = failing.menus.registered.find((entry) => entry.id === 'pin-top.labels').resolve({ sessionId: 's1', displayTitle: 'Refactor the sidebar' });
check(
  'a failing (not missing) store says so instead of asking for a restart',
  failingActions.length === 1 && failingActions[0].label === '标签颜色（存储服务未响应）',
  JSON.stringify(failingActions),
);

let releaseRead;
const heldRead = new Promise((resolve) => {
  releaseRead = resolve;
});
const stale = createHarness({ holdGet: heldRead });
await settle();
const staleMenu = stale.menus.registered.find((entry) => entry.id === 'pin-top.labels');
await staleMenu.resolve({ sessionId: 's1', displayTitle: 'Refactor the sidebar' })[0].children.find((item) => item.id === 'label:red').run();
await settle();
check('a write lands while the opening read is still in flight', stale.iconFor('s1')?.props?.['data-pintop-label'] === 'red', JSON.stringify(stale.iconFor('s1')?.props));
releaseRead();
await settle();
check(
  'a stale read cannot overwrite the write the user just made',
  stale.iconFor('s1')?.props?.['data-pintop-label'] === 'red',
  JSON.stringify(stale.iconFor('s1')?.props),
);

/* ---------------- header bulk controls (collapse all / expand all) ---------------- */

// The Workspace header has no Slot, so this plugin parks two buttons beside the
// shipped action cluster. This block gives the surface its own document, so the
// harnesses above neither see it nor fight over it.
const bulkDoc = makeFakeDocument();
globalThis.document = bulkDoc;
const sidebarRoot = makeElement('div');
const workspacesHeader = makeElement('div');
workspacesHeader.setAttribute('data-sidebar-workspace-header', '');
const headerLabel = makeElement('span');
headerLabel.textContent = '工作区';
const headerActions = makeElement('div');
headerActions.className = 'headerActions_hash';
const shippedOptions = makeElement('button');
shippedOptions.className = 'iconButton_hash';
const shippedAdd = makeElement('button');
shippedAdd.className = 'iconButton_hash';
headerActions.appendChild(shippedOptions);
headerActions.appendChild(shippedAdd);
workspacesHeader.appendChild(headerLabel);
workspacesHeader.appendChild(headerActions);
const groupList = makeElement('div');
sidebarRoot.appendChild(workspacesHeader);
sidebarRoot.appendChild(groupList);
bulkDoc.body.appendChild(sidebarRoot);

const observerStart = observers.length;
const B = createHarness();
const bulkObservers = () => observers.slice(observerStart);
const bulkWrap = () => bulkDoc.body.querySelector('[data-pintop-bulk]');
const bulkOf = (kind) => bulkDoc.body.querySelector('[data-pintop-bulk-' + kind + ']');

check('the bulk controls mount beside the shipped action cluster', bulkWrap() !== null, String(bulkDoc.body.children.length));
check(
  'they sit immediately left of the shipped buttons, which stay untouched',
  bulkWrap()?.nextElementSibling === headerActions
    && headerActions.children[0] === shippedOptions
    && headerActions.children[1] === shippedAdd
    && bulkWrap().parentElement === workspacesHeader,
  JSON.stringify({ parent: bulkWrap()?.parentElement?.tagName, next: bulkWrap()?.nextElementSibling?.className }),
);
check(
  'locate, collapse and expand, in that order',
  bulkWrap()?.children.length === 3
    && bulkWrap().children.map((child) => child.getAttribute('data-pintop-bulk-locate') === ''
      ? 'locate'
      : child.getAttribute('data-pintop-bulk-collapse') === '' ? 'collapse' : 'expand').join() === 'locate,collapse,expand',
  JSON.stringify(bulkWrap()?.children.map((child) => child.getAttribute('aria-label'))),
);
check(
  'each button is a labelled, named control',
  bulkOf('locate')?.getAttribute('aria-label') === '定位到当前会话'
    && bulkOf('locate')?.getAttribute('title') === '展开并滚动到当前会话'
    && bulkOf('collapse')?.getAttribute('aria-label') === '全部收起'
    && bulkOf('collapse')?.getAttribute('title') === '收起所有工作区的会话'
    && bulkOf('expand')?.getAttribute('aria-label') === '全部展开'
    && bulkOf('expand')?.getAttribute('title') === '展开所有工作区的会话',
  JSON.stringify([bulkOf('locate')?.getAttribute('aria-label'), bulkOf('collapse')?.getAttribute('aria-label'), bulkOf('expand')?.getAttribute('aria-label')]),
);
const glyphParts = (kind) => (bulkOf(kind)?.children[0]?.children ?? []).map((part) => String(part.tagName).toLowerCase() + ':' + (part.getAttribute('d') ?? part.getAttribute('r') ?? ''));
const bulkGlyphOf = (kind) => bulkOf(kind)?.children[0] ?? null;
const partsOf = (kind, tag) => (bulkGlyphOf(kind)?.children ?? []).filter((part) => String(part.tagName).toLowerCase() === tag);
check(
  'collapse all draws the IDE mark: two bars and inward arrows',
  bulkGlyphOf('collapse') !== null
    && partsOf('collapse', 'rect').length === 2
    && partsOf('collapse', 'path').length === 2,
  JSON.stringify(glyphParts('collapse')),
);
check(
  'expand all mirrors it with outward arrows around one bar',
  bulkGlyphOf('expand').children.length === 3
    && partsOf('expand', 'rect').length === 1
    && partsOf('expand', 'path').length === 2,
  JSON.stringify(glyphParts('expand')),
);
check(
  'locate draws a target ring with four ticks',
  bulkGlyphOf('locate').children.length === 5
    && partsOf('locate', 'circle').length === 1
    && partsOf('locate', 'path').length === 4,
  JSON.stringify(glyphParts('locate')),
);
check(
  'the glyphs inherit the theme ink instead of hard-coded colours',
  bulkGlyphOf('collapse').getAttribute('stroke') === 'currentColor'
    && partsOf('collapse', 'rect')[0].getAttribute('fill') === 'currentColor',
);
check('mounting is watched, so a remounted header gets the controls back', bulkObservers().length >= 1 && bulkObservers().every((observer) => observer.targets.length > 0));

// Workspace group rows: the shipped rows own the state, `aria-expanded` mirrors it.
const groupClicks = [];
const makeGroupRow = (key, expanded, onToggle) => {
  const row = makeElement('div');
  row.setAttribute('data-row-key', 'workspace:' + key);
  row.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  row.addEventListener('click', () => {
    groupClicks.push(key);
    const open = row.getAttribute('aria-expanded') === 'true';
    row.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (onToggle !== undefined) onToggle(row);
  });
  groupList.appendChild(row);
  return row;
};
const rowW1 = makeGroupRow('w1', true);
const rowW2 = makeGroupRow('w2', false, () => {
  // Tree mode mounts a nested group only once its parent opens.
  if (groupList.querySelector('[data-row-key="workspace:w2/child"]') === null) makeGroupRow('w2/child', false);
});
const rowUngrouped = makeGroupRow('ungrouped', false);
// A Session row also carries data-row-key; one that even had aria-expanded must
// stay out of reach, because the selector is Workspace-scoped.
const sessionRow = makeElement('div');
sessionRow.setAttribute('data-row-key', 'session:s1');
sessionRow.setAttribute('aria-expanded', 'true');
sessionRow.addEventListener('click', () => groupClicks.push('session:s1'));
groupList.appendChild(sessionRow);

bulkOf('collapse')?.click();
check('collapse all closes every open group', rowW1.getAttribute('aria-expanded') === 'false', JSON.stringify(groupClicks));
check('and touches no group that is already closed', JSON.stringify(groupClicks) === JSON.stringify(['w1']), JSON.stringify(groupClicks));
check('a Session row is never activated by the bulk command', !groupClicks.includes('session:s1'));

groupClicks.length = 0;
bulkOf('expand')?.click();
await settle();
check(
  'expand all opens every closed group, including nested ones a pass reveals',
  rowW1.getAttribute('aria-expanded') === 'true'
    && rowW2.getAttribute('aria-expanded') === 'true'
    && rowUngrouped.getAttribute('aria-expanded') === 'true'
    && groupList.querySelector('[data-row-key="workspace:w2/child"]')?.getAttribute('aria-expanded') === 'true',
  JSON.stringify(groupClicks),
);
check('each row is activated at most once per command', new Set(groupClicks).size === groupClicks.length, JSON.stringify(groupClicks));

groupClicks.length = 0;
bulkOf('collapse')?.click();
check(
  'collapse all reaches the nested group too',
  groupList.querySelector('[data-row-key="workspace:w2/child"]')?.getAttribute('aria-expanded') === 'false'
    && ['w1', 'w2', 'ungrouped'].every((key) => groupList.querySelector('[data-row-key="workspace:' + key + '"]').getAttribute('aria-expanded') === 'false'),
  JSON.stringify(groupClicks),
);
check('the bulk controls never touch a Session row', !groupClicks.includes('session:s1'));

/* ---------------- locate the current session ---------------- */

// The collapse/expand commands schedule follow-up passes; drain them so this
// block observes only the locate command's own clicks.
const settleTimers = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
await settleTimers();

// The browser marks the selected Session row `aria-selected`; the current id
// itself comes from the local reference count the shipped browser also reads.
check(
  'the current session is read from the same reference count the browser uses',
  mod.currentSessionId(makeStore({ byId: { a: { id: 'a', retainedBy: {} }, b: { id: 'b', retainedBy: { mainView: 1 } } } })) === 'b',
);
check(
  'no retained session reads as none',
  mod.currentSessionId(makeStore({ byId: { a: { id: 'a', retainedBy: {} } } })) === '',
);

const selectedRow = makeElement('div');
selectedRow.setAttribute('data-row-key', 'session:s9');
selectedRow.setAttribute('aria-selected', 'true');
groupList.appendChild(selectedRow);
bulkOf('locate')?.click();
check('locate scrolls the current row into view', selectedRow.scrolled === 'nearest', String(selectedRow.scrolled));
check('locate flashes the row it landed on', selectedRow.getAttribute('data-pintop-located') === '', String(selectedRow.getAttribute('data-pintop-located')));
check('the flash is transient', code.includes("if (typeof row.removeAttribute === 'function') row.removeAttribute(LOCATED_ATTR)") && code.includes('}, 1200)'));

// A hidden current Session: its group is collapsed, so its row is not mounted
// until that group opens — exactly what the button has to fix.
const hiddenRow = makeElement('div');
hiddenRow.setAttribute('data-row-key', 'session:s-hidden');
hiddenRow.setAttribute('aria-selected', 'true');
const ownerRow = makeGroupRow('owner-group', false, () => {
  groupList.appendChild(hiddenRow);
});
B.sessionStore.set({
  phase: 'ready',
  ids: ['s-hidden'],
  byId: { 's-hidden': { id: 's-hidden', title: 'Hidden session', blank: false, retainedBy: { mainView: 1 } } },
});
B.workspaceStore.set({
  phase: 'ready',
  items: [{ workspaceId: 'owner-group', path: '/w/owner', title: 'owner', sessionIds: ['s-hidden'] }],
  pinnedSessionIds: [],
  archivedSessionIds: [],
});
selectedRow.remove();
check('the owner group starts closed and its session is not mounted', ownerRow.getAttribute('aria-expanded') === 'false' && hiddenRow.parentElement === null);
bulkOf('locate')?.click();
await settle();
check('locate opens the group that hides the current session', ownerRow.getAttribute('aria-expanded') === 'true', String(groupClicks));
check('and then scrolls to the row it just uncovered', hiddenRow.scrolled === 'nearest', String(hiddenRow.scrolled));
check('and flashes it', hiddenRow.getAttribute('data-pintop-located') === '');
// Opening only the owner's chain: an unrelated collapsed group stays closed.
const unrelatedRow = makeGroupRow('unrelated', false);
bulkOf('locate')?.click();
await settle();
check('locate leaves unrelated groups alone', unrelatedRow.getAttribute('aria-expanded') === 'false', String(groupClicks));

// Nothing is selected at all: locate is a no-op rather than a random scroll.
hiddenRow.remove();
// A session the layout cannot place (ungrouped bucket): one pass over what is
// still closed, one look, then it stops instead of looping on timers.
const ungroupedRow = makeGroupRow('only-group', false);
const closedBefore = bulkDoc.body.querySelectorAll('[data-row-key^="workspace:"][aria-expanded="false"]').length;
const loopsBefore = groupClicks.length;
mod.locateCurrent('s-nowhere', { items: [] });
await settleTimers();
const afterFallback = groupClicks.length;
await settleTimers();
check(
  'an unplaceable session expands what is closed once, then stops',
  afterFallback - loopsBefore === closedBefore
    && groupClicks.length === afterFallback
    && ungroupedRow.getAttribute('aria-expanded') === 'true',
  JSON.stringify({ clicked: afterFallback - loopsBefore, closedBefore, later: groupClicks.length - afterFallback }),
);

// Nothing is selected at all: locate is a no-op rather than a random scroll.
hiddenRow.remove();
const quietBefore = groupClicks.length;
mod.locateCurrent('', { items: [] });
await settle();
check('locate does nothing when there is no current session', groupClicks.length === quietBefore);

// A newer command cancels the follow-up passes of an older one.
groupClicks.length = 0;
bulkOf('expand')?.click();
bulkOf('collapse')?.click();
await settle();
check(
  'a later command wins over an older command\'s pending passes',
  groupList.querySelector('[data-row-key="workspace:w2/child"]')?.getAttribute('aria-expanded') === 'false'
    && rowW1.getAttribute('aria-expanded') === 'false',
  JSON.stringify({ clicks: groupClicks, w1: rowW1.getAttribute('aria-expanded') }),
);

// The shipped header is React-owned: when it is rebuilt, the controls come back
// exactly once, without a second copy stacking up.
const replacement = makeElement('div');
replacement.setAttribute('data-sidebar-workspace-header', '');
const replacementActions = makeElement('div');
replacementActions.className = 'headerActions_hash';
replacement.appendChild(replacementActions);
bulkDoc.body.removeChild(sidebarRoot);
bulkDoc.body.appendChild(replacement);
for (const observer of bulkObservers()) observer.fire();
check(
  'a remounted header gets exactly one fresh set of controls',
  bulkDoc.body.querySelectorAll('[data-pintop-bulk]').length === 1
    && bulkDoc.body.querySelector('[data-pintop-bulk]').nextElementSibling === replacementActions,
  String(bulkDoc.body.querySelectorAll('[data-pintop-bulk]').length),
);

// Disposal: the injected surface is this plugin's, and leaves with it.
check('the surface is owned by its own effect', B.disposeLabel('pin-top: bulk controls'));
check('disposal removes the injected controls', bulkDoc.body.querySelector('[data-pintop-bulk]') === null);
check('disposal leaves the shipped header untouched', replacementActions.parentElement === replacement && replacement.children.length === 1);
check('disposal disconnects its observer', bulkObservers().every((observer) => observer.targets.length === 0));
for (const observer of bulkObservers()) observer.fire();
check('a late mutation can no longer re-mount the removed surface', bulkDoc.body.querySelector('[data-pintop-bulk]') === null);
globalThis.document = fakeDocument;

/* ---------------- the shipped list is decorated, never replaced ---------------- */

check(
  'no registration takes the browsing region or a row of it',
  A.registrations.every((r) => r.kind !== 'register' || !['sidebar.workspaces', 'sidebar.session.row.leading', 'sidebar.session.row.hover'].includes(r.options.name)),
  JSON.stringify(A.registrations.filter((r) => r.kind === 'register').map((r) => r.options.name)),
);
check('no single-occupancy hole is injected', A.registrations.every((r) => r.kind !== 'inject' || r.slot !== 'sidebar.workspaces'));
check('the stylesheet never targets a shipped row', !css.includes('data-row-key'));
check(
  'the bulk controls only address Workspace group rows, never a Session row',
  code.includes('const GROUP_ROW_SELECTOR = \'[data-row-key^="workspace:"][aria-expanded]\''),
);

/* ---------------- stylesheet ---------------- */

check('the applied run installs exactly one stylesheet', styleTexts.length >= 1 && css.length > 0, `tags=${styleTexts.length}`);
check('stylesheet is token-driven (no literal colors)', !/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/.test(code.slice(code.indexOf('const CSS'), code.indexOf('const zh'))));
check(
  'the palette is published as custom properties for both themes',
  css.includes('--pintop-c-red:#FF3B30') && css.includes('body[data-ds-dark-theme]{--pintop-c-red:#FF453A'),
  css.slice(0, 400),
);
check(
  'a label value aliases its palette entry',
  mod.COLORS.every((color) => css.includes(`[data-pintop-label="${color.id}"]{--pintop-c:var(--pintop-c-${color.id})}`)),
);
check(
  'a labelled row takes its own tint and deepens it on hover',
  css.includes('button[class*="panelRow"]:has([data-pintop-label="red"]){--pintop-c:var(--pintop-c-red);background:color-mix(in srgb,var(--pintop-c) 14%,transparent)}') &&
    css.includes(':hover{background:color-mix(in srgb,var(--pintop-c) 24%,transparent)}'),
  css.slice(css.indexOf('has([data-pintop-label="red"])'), 420),
);
check(
  'the brand tint keeps its light-theme pair',
  css.includes('body:not([data-ds-dark-theme]){--pintop-tint:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)')
    && css.includes('--pintop-tint-hover:color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent)'),
  css.slice(css.indexOf('--pintop-tint:'), 260),
);
check('the tint degrades to the shipped tint without color-mix', css.includes('@supports not (background:color-mix(in srgb,red 10%,transparent)){button[class*="panelRow"]:has([data-pintop-label]){background:var(--pintop-tint)}'));
check(
  'the dot carries a hairline ring, so the pale colours stay readable',
  css.includes('box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pintop-c) 55%,var(--dsw-alias-label-primary))'),
);
check('the dot and the swatch share one palette property', css.includes('.pintop-dot{') && css.includes('background:var(--pintop-c)') && css.includes('.pintop-swatch{'));
check('pinned entries are tinted through their own marker only', css.includes('button:has([data-pintop-row]){') && !css.includes('data-row-key'));
check('pinned entry size matches the shipped row and stays tunable', code.includes('rowHeight: 32') && css.includes('min-height:32px;padding-top:5px;padding-bottom:5px'));
check('a pinned row is one fully rounded block', css.includes('button:has([data-pintop-row]){position:relative;') && css.includes('border-radius:var(--dsw-radius-md);background:var(--pintop-tint)'));
check('pinned rows are separated by a small gap', code.includes('groupGap: 4') && css.includes('margin-block-start:4px'));
check('pointer feedback covers the row', css.includes('button:has([data-pintop-row]):hover'));
check('state indicators use the host state tokens', css.includes('.pintop-status[data-state="done"]{color:var(--dsw-alias-state-success-primary)}') && css.includes('.pintop-status[data-state="warning"]{color:var(--dsw-alias-state-warn-primary)}') && css.includes('.pintop-status[data-state="ongoing"]{color:var(--dsw-alias-label-tertiary);'));
check('the working ring spins and dashes, and reduced motion is respected', css.includes('animation:pintop-spin 1.5s linear infinite') && css.includes('animation:pintop-dash') && css.includes('prefers-reduced-motion:reduce'));
check('unread completions read heavier', css.includes('button:has([data-pintop-state="done"])>span:last-child{font-weight:500}'));
check('the action takes the strip the shell reserves at the row\'s end', css.includes('.pintop-unpin{position:absolute;inset-inline-end:0;') && css.includes('position:relative;min-height:'));
check('the action is out of flow in the row\'s trailing slot', css.includes('.pintop-unpin{position:absolute;inset-inline-end:0;top:2px;z-index:2;'));
check(
  'the action wears the row badge\'s mark and tone at rest',
  css.includes('color:var(--dsw-alias-label-caption);cursor:pointer') && !css.includes('opacity:.6'),
);
check(
  'the action is the host pin, with a slash that only appears on hover',
  code.includes("M9.96976 1.70572L13.1554 3.93629") && code.includes("className: 'pintop-slash'") && css.includes('.pintop-slash{opacity:0;transition:opacity .12s ease}'),
  'the host pin-fill path data is reused so both marks match',
);
check(
  'hovering fades the pin and shows the slash',
  css.includes('button:has([data-pintop-row]):hover .pintop-pin,button:has([data-pintop-row]):focus-within .pintop-pin,.pintop-unpin:hover .pintop-pin{opacity:.28}')
    && css.includes('button:has([data-pintop-row]):hover .pintop-slash'),
);
check('hovering the row emphasises the action', css.includes('button:has([data-pintop-row]):hover .pintop-unpin'));
check('the action is reachable by pointer and by keyboard focus', css.includes('button:has([data-pintop-row]):focus-within .pintop-unpin'));
check('labels and controls disappear in the collapsed rail', css.includes('[data-sidebar-collapsed] button:has([data-pintop-header])') && css.includes('[data-sidebar-collapsed] button:has([data-pintop-control])'));
check('the section label is inert and left-aligned', css.includes('button:has([data-pintop-header]){') && css.includes('pointer-events:none'));
check('collapse controls are plain text rows', css.includes('button:has([data-pintop-control]){') && code.includes('maxVisible: 4'));
check(
  'the header controls keep the shipped header geometry',
  css.includes('.pintop-bulk-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:28px;')
    && css.includes('.pintop-bulk-btn:focus-visible{outline:var(--dsw-focus-ring-width)')
    && css.includes('[data-sidebar-collapsed] [data-pintop-bulk]{display:none}'),
);
check(
  'a locate landing flashes the row, and reduced motion is respected',
  css.includes('[data-pintop-located]{animation:pintop-located 1.2s ease-out}')
    && css.includes('prefers-reduced-motion:reduce){[data-pintop-located]{animation:none;box-shadow:inset 0 0 0 2px var(--dsw-alias-brand-primary)}}'),
);
check('stylesheet is tagged as plugin-owned', code.includes("tag.dataset.plugin = 'dsh-pin-top'"));

/* ---------------- boot safety: missing services / failing ledger ---------------- */

check('hard dependencies are only the core services', JSON.stringify(mod.inject) === JSON.stringify(['slots', 'locale']), JSON.stringify(mod.inject));
for (const optionalService of ['uiWorkspace', 'workspaces', 'sessions', 'layout', 'contextMenus']) {
  check(`${optionalService} is not a hard dependency`, !mod.inject.includes(optionalService));
}

const bareRegistrations = [];
const bareCtx = {
  effect: (callback) => {
    callback();
    return () => {};
  },
  on: () => () => {},
  locale: { register: () => () => {}, bind: () => (key) => key },
  get: () => undefined,
  inject: () => () => {},
  slots: {
    inject: (key, callback) => {
      try {
        callback();
      } catch {
        /* the production guard swallows this itself; the harness only observes the outcome */
      }
      return () => {};
    },
    register: (registerOptions, component) => {
      bareRegistrations.push({ options: registerOptions, component });
      return () => {};
    },
  },
};
let applyFailure = null;
try {
  mod.apply(bareCtx);
} catch (error) {
  applyFailure = error;
}
check('apply never throws without optional services', applyFailure === null, String(applyFailure));
check(
  'no sidebar rows are offered without services',
  bareRegistrations.every((entry) => entry.options.name !== 'sidebar.panellist'),
  JSON.stringify(bareRegistrations.map((entry) => entry.options.name)),
);
check(
  'the ambient dot still works without the menu service',
  bareRegistrations.some((entry) => entry.options.name === 'sidebar.session.row.trailing'),
  JSON.stringify(bareRegistrations.map((entry) => entry.options.name)),
);

const hostileCtx = {
  effect: (callback) => {
    callback();
    return () => {};
  },
  on: () => () => {},
  locale: {
    register: () => {
      throw new Error('locale registry unavailable');
    },
    bind: () => (key) => key,
  },
  get: () => undefined,
  inject: () => () => {},
  slots: { inject: () => () => {}, register: () => () => {} },
};
let hostileFailure = null;
try {
  mod.apply(hostileCtx);
} catch (error) {
  hostileFailure = error;
}
check('apply swallows an activation failure instead of aborting boot', hostileFailure === null, String(hostileFailure));

/* ---------------- Host half: label routes ---------------- */

const hostHome = join(here, '.tmp-host');
await rm(hostHome, { recursive: true, force: true });
process.env.DSH_HOME = hostHome;
const hostModule = await import('../index.js');
check('the Host half exports apply', typeof hostModule.apply === 'function');
check(
  'both halves share one palette',
  JSON.stringify(hostModule.PALETTE) === JSON.stringify(mod.COLORS.map((color) => color.id)),
  JSON.stringify(hostModule.PALETTE),
);
const routes = [];
// The shipped fence is the only admission: it answers 401/403, or undefined.
let hostConnection = {
  requestRejection: (req) => (req.headers.cookie === 'ok' ? undefined : 401),
};
const hostCtx = {
  inject: (names, callback) => {
    callback({
      get: (name) => (name === 'connection' ? hostConnection : undefined),
      webServer: {
        register: (route) => {
          routes.push(route);
          return () => {};
        },
      },
      effect: (callback2) => {
        callback2();
        return () => {};
      },
    });
  },
};
hostModule.apply(hostCtx);
check('the Host half registers exactly one exact route', routes.length === 1 && routes[0].kind === 'exact' && routes[0].path === '/pin-top/labels', JSON.stringify(routes.map((r) => ({ kind: r.kind, path: r.path }))));

const callRoute = async (method, body, headers = { cookie: 'ok' }) => {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = {
    method,
    headers,
    url: '/pin-top/labels',
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
  const answer = { status: 0, payload: undefined };
  const res = {
    headersSent: false,
    writeHead(status) { answer.status = status; this.headersSent = true; },
    end(text) { answer.payload = text === undefined ? '' : JSON.parse(text); },
  };
  await routes[0].handler(req, res);
  return answer;
};

check('an unauthenticated request is refused', (await callRoute('GET', undefined, {})).status === 401);
const emptyRead = await callRoute('GET');
check('GET answers the empty document', emptyRead.status === 200 && emptyRead.payload.ok === true && JSON.stringify(emptyRead.payload.value.bySession) === '{}', JSON.stringify(emptyRead.payload));
const saved = await callRoute('POST', { sessionId: 's1', color: 'blue' });
check('POST stores the colour', saved.status === 200 && saved.payload.value.bySession.s1 === 'blue', JSON.stringify(saved.payload));
const reloaded = await callRoute('GET');
check('labels survive a re-read from disk', reloaded.payload.value.bySession.s1 === 'blue', JSON.stringify(reloaded.payload));
const stored = JSON.parse(await readFile(join(hostHome, 'pin-top', 'labels.json'), 'utf8'));
check('the stored file is versioned plain JSON', stored.version === 2 && stored.bySession.s1 === 'blue', JSON.stringify(stored));
const cleared = await callRoute('POST', { sessionId: 's1', color: null });
check('a null colour removes the session', cleared.status === 200 && cleared.payload.value.bySession.s1 === undefined, JSON.stringify(cleared.payload));
check('a request without a session is refused', (await callRoute('POST', { color: 'red' })).status === 400);
check('an unknown colour is refused instead of stored', (await callRoute('POST', { sessionId: 's1', color: 'chartreuse' })).status === 400);
check('a non-string colour is refused', (await callRoute('POST', { sessionId: 's1', color: 7 })).status === 400);
check('the refused requests stored nothing', JSON.stringify((await callRoute('GET')).payload.value.bySession) === '{}');
check('a method other than GET/POST is refused', (await callRoute('DELETE', undefined)).status === 405);

await mkdir(join(hostHome, 'pin-top'), { recursive: true });
await writeFile(join(hostHome, 'pin-top', 'labels.json'), JSON.stringify({ version: 2, bySession: { s1: 'burgundy', s2: 'green' } }), 'utf8');
check(
  'a hand-edited colour the Client cannot draw is dropped on read',
  JSON.stringify((await callRoute('GET')).payload.value.bySession) === JSON.stringify({ s2: 'green' }),
  JSON.stringify((await callRoute('GET')).payload.value.bySession),
);

hostConnection = { requestRejection: () => 403 };
check('a cross-origin request is forbidden', (await callRoute('GET')).status === 403);
hostConnection = { requestRejection: () => 401 };
check('a request without a live peer is unauthorized', (await callRoute('GET')).status === 401);
hostConnection = { requestRejection: () => { throw new Error('fence exploded'); } };
check('a fence that throws denies the request instead of admitting it', (await callRoute('GET')).status === 500);
hostConnection = undefined;
check('a composition without a fence refuses the route', (await callRoute('GET')).status === 403);
await rm(hostHome, { recursive: true, force: true });

/* ---------------- manifest ---------------- */

check('manifest exports client bundle', pkg.exports?.['./client'] === './client.js');
check('manifest exports icon', pkg.exports?.['./icon'] === './icon.svg');
check('manifest exports its own package manifest', pkg.exports?.['./package.json'] === './package.json');
check('manifest exports locale files', pkg.exports?.['./locale/*.json'] === './locale/*.json');
check('manifest declares the bundle patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml');
check('manifest client platform is web', pkg.dsh?.client?.platform === 'web');
check('manifest keeps the description free of the removed tag feature', !/tag/i.test(pkg.description ?? ''), pkg.description);
for (const required of ['index.js', 'client.js', 'cordis.patch.yml']) {
  check(`files[] covers ${required}`, (pkg.files ?? []).includes(required));
}
check('package stays private', pkg.private === true);

const failures = checks.filter((entry) => !entry.ok);
console.log(`pin-top smoke test: ${checks.length - failures.length}/${checks.length} checks passed`);
for (const entry of failures) console.log(`FAIL  ${entry.name}${entry.detail === undefined ? '' : `  (${entry.detail})`}`);
if (failures.length > 0) process.exitCode = 1;
