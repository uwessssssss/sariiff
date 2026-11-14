// Screen tests: the REAL web screens (components/**), run in Node without a browser.
//
//   node screens.test.js <web source tree> [<web dir that has node_modules>]
//
// How it works
//   * .ts/.tsx files are compiled on the fly (typescript.transpileModule), "@/x" is the source tree.
//   * A screen section is a function of its view-model:  Section({ vm })  returns the element tree
//     React would draw. The kit walks that tree: text() is what the user would read, find() returns
//     elements so a test can press a button (call its onClick) or type in a box (its onChange).
//   * Components that keep their own state (modals) are mounted on a small hook runtime (mount()),
//     so a click really changes state and the next render shows the result.
// Nothing here is a copy of the app: change a label or a formula in the app and these tests see it.
const Module = require("module");
const path = require("path");
const fs = require("fs");

const SRC = path.resolve(process.argv[2] || ".");
const WEB = path.resolve(process.argv[3] || SRC);
const fromWeb = (name) => require(require.resolve(name, { paths: [WEB] }));

const ts = fromWeb("typescript");
const tsOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
  jsx: ts.JsxEmit.ReactJSX,
  esModuleInterop: true,
};
for (const ext of [".ts", ".tsx"])
  require.extensions[ext] = (m, file) =>
    m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: tsOptions, fileName: file }).outputText, file);
for (const ext of [".css", ".svg", ".png"]) require.extensions[ext] = (m) => { m.exports = {}; };

const resolveOriginal = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith("@/")) request = path.join(SRC, request.slice(2));
  try {
    return resolveOriginal.call(this, request, parent, ...rest);
  } catch (e) {
    // a package: the tree under test may have no node_modules of its own (an older checkout)
    if (request.startsWith(".") || path.isAbsolute(request)) throw e;
    return resolveOriginal.call(this, request, { id: WEB, filename: path.join(WEB, "x.js"), paths: Module._nodeModulePaths(WEB) }, ...rest);
  }
};

// ---- a browser-ish world (no window: components must not need one to decide what to show)
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
store["sariff_auth"] = JSON.stringify({ token: "t", refreshToken: "r", user: { id: "u1", role: 1, whatsAppNumber: "+256700000001" }, expiresAt: "" });
process.on("unhandledRejection", () => {});   // a refused clipboard etc. inside the app; test failures are reported by proof()
process.exitCode = 3;                            // until finish() runs: a run that stops early is never a pass

/** Requests the screens made: [{ url, method, body }]. reply(url, body, method) decides the answer's data. */
const requests = [];
let replyWith = () => undefined;
global.fetch = async (url, opts = {}) => {
  let body; try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  const method = (opts.method || "GET").toUpperCase();
  requests.push({ url: String(url), method, body, headers: opts.headers || {} });
  const data = await replyWith(String(url), body, method, opts.headers || {});
  if (data && data.__status) return { ok: false, status: data.__status, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); }, text: async () => "", blob: async () => new Blob([]) };
  return { ok: true, status: 200, json: async () => ({ success: true, message: "ok", data }), text: async () => "", blob: async () => new Blob([]) };
};
const server = { requests, reply: (f) => { replyWith = f; }, clear: () => { requests.length = 0; } };

/**
 * Run f with the few browser objects some handlers touch (window.location, confirm, a download
 * link, the print frame). page.printed is the HTML handed to the printer, page.downloads the files.
 */
async function withBrowser(f, { confirm = true } = {}) {
  const page = { printed: null, downloads: [], asked: [], location: { protocol: "https:", href: "" } };
  const element = () => { const e = { style: {}, setAttribute() {}, remove() {}, click() {} }; return e; };
  global.window = { location: page.location, confirm: (q) => { page.asked.push(q); return confirm; }, open() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    URL: { createObjectURL: (b) => { page.downloads.push(b); return "blob:x"; }, revokeObjectURL() {} } };
  global.document = { cookie: "", createElement: element, addEventListener() {}, removeEventListener() {},
    body: { appendChild(e) { if (e && e.srcdoc) page.printed = e.srcdoc; }, removeChild() {} } };
  global.sessionStorage = { clear() {}, getItem: () => null, setItem() {}, removeItem() {} };
  try { await f(page); } finally { delete global.window; delete global.document; delete global.sessionStorage; }
  return page;
}
// next/navigation's useRouter outside a Next page
try { fromWeb("next/dist/shared/lib/app-router-context.shared-runtime").AppRouterContext._currentValue = { push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }; } catch { /* not this Next version */ }

/** The clipboard: allow() or refuse() what the page copies. */
const clipboard = { copied: [], ok: true };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { clipboard: { writeText: (t) => (clipboard.ok ? (clipboard.copied.push(t), Promise.resolve()) : Promise.reject(new Error("NotAllowedError"))) } },
});

/** Toasts the page showed: [["success" | "error" | ..., message]]. */
const toasts = [];
const sonner = fromWeb("sonner");
for (const kind of ["success", "error", "warning", "info", "message"]) sonner.toast[kind] = (msg) => { toasts.push([kind, String(msg)]); };

// ---- hooks outside a browser
const React = fromWeb("react");
const HOOKS = ["useState", "useEffect", "useLayoutEffect", "useMemo", "useCallback", "useRef", "useContext", "useId", "useReducer"];
function withHooks(hooks, f) {
  const saved = {};
  for (const h of HOOKS) { saved[h] = React[h]; React[h] = hooks[h]; }
  try { return f(); } finally { Object.assign(React, saved); }
}
/** Hooks that keep nothing: first-render values, effects not run. Used to look inside child components. */
const stateless = {
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useReducer: (_r, init) => [init, () => {}],
  useEffect() {}, useLayoutEffect() {},
  useMemo: (f) => f(), useCallback: (f) => f, useRef: (v) => ({ current: v }),
  useContext: (c) => c && c._currentValue, useId: () => "id",
};

/**
 * Mount a component that keeps state. tree is what it draws now; after pressing something call
 * render() to draw again. Effects run after each render when their inputs changed (like React).
 */
function mount(Component, props) {
  const slots = []; let i = 0; let pending = [];
  const hooks = {
    ...stateless,
    useState(init) {
      const k = i++;
      if (!(k in slots)) slots[k] = typeof init === "function" ? init() : init;
      return [slots[k], (v) => { slots[k] = typeof v === "function" ? v(slots[k]) : v; }];
    },
    useRef(v) { const k = i++; if (!(k in slots)) slots[k] = { current: v }; return slots[k]; },
    useMemo(f) { i++; return f(); },
    useCallback(f) { i++; return f; },
    useEffect(f, deps) {
      const k = i++; const old = slots[k];
      const changed = !old || !deps || !old.deps || deps.length !== old.deps.length || deps.some((d, n) => !Object.is(d, old.deps[n]));
      if (changed) pending.push(() => { if (old && typeof old.cleanup === "function") old.cleanup(); slots[k] = { deps, cleanup: f() }; });
      else slots[k] = old;
    },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  const self = {
    tree: null,
    render() {
      i = 0; pending = [];
      self.tree = withHooks(hooks, () => Component(props));
      const run = pending; pending = [];
      withHooks(hooks, () => run.forEach((f) => f()));
      return self.tree;
    },
  };
  self.render();
  return self;
}

// ---- reading the element tree
const isElement = (n) => n && typeof n === "object" && "props" in n && "type" in n;
/** Children an element draws: a plain function component is called (so its own markup is seen). */
function inside(node) {
  if (typeof node.type === "function" && !(node.type.prototype && node.type.prototype.isReactComponent)) {
    try { return withHooks(stateless, () => node.type(node.props)); } catch { /* needs a browser: use what it was given */ }
  }
  return node.props.children;
}
function walk(node, visit) {
  if (node == null || typeof node === "boolean") return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (typeof node === "string" || typeof node === "number") return visit(String(node), true);
  if (!isElement(node)) return;
  visit(node, false);
  walk(inside(node), visit);
}
/** Everything a person could read, in order, single-spaced. */
function text(tree) {
  let out = "";
  const add = (node) => {
    if (node == null || typeof node === "boolean") return;
    if (Array.isArray(node)) return node.forEach(add);
    if (typeof node === "string" || typeof node === "number") { out += String(node); return; }
    if (!isElement(node)) return;
    out += " "; add(inside(node)); out += " ";
  };
  add(tree);
  return out.replace(/\s+/g, " ").trim();
}
/** Elements matching a test, e.g. find(tree, (e) => e.type === "select"). */
function find(tree, test) {
  const hits = [];
  walk(tree, (n, isText) => { if (!isText && test(n)) hits.push(n); });
  return hits;
}
const tag = (e) => (typeof e.type === "string" ? e.type : "");
/** A button (or anything pressable) whose words match. */
const pressable = (tree, words) => find(tree, (e) => typeof e.props.onClick === "function" && words.test(text(e)))[0];
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** A view-model: the fields given, and a do-nothing function for every handler not given. */
const vm = (fields) => new Proxy(fields, { get: (t, k) => (k in t ? t[k] : typeof k === "symbol" ? undefined : () => {}) });

// ---- results
const results = [];
async function proof(id, title, body) {
  const fails = [];
  const expect = (ok, detail) => { if (!ok) fails.push(String(detail).slice(0, 400)); };
  toasts.length = 0; server.clear(); server.reply(() => undefined); clipboard.ok = true; clipboard.copied.length = 0;
  try { await body(expect); } catch (e) { fails.push(`crashed: ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`); }
  results.push({ id, title, fails });
  console.log(`${fails.length ? "FAIL" : "PASS"}  ${id}  ${title}${fails.map((f) => `\n        ${f}`).join("")}`);
}
/**
 * End of run. Normally every test must pass. With --expect-fail (the tree is the app as it was
 * BEFORE the fixes) every test must fail, by an assertion and not by a crash: that is the proof
 * that the test sees the defect.
 */
function finish() {
  const expectFail = process.argv.includes("--expect-fail");
  const failed = results.filter((r) => r.fails.length);
  if (!expectFail) {
    console.log(`\nSCREENS: ${results.length - failed.length} passed, ${failed.length} failed`);
    process.exit(failed.length ? 1 : 0);
  }
  const crashed = failed.filter((r) => r.fails.some((f) => f.startsWith("crashed")));
  const passed = results.filter((r) => !r.fails.length);
  console.log(`\nPROOF on the old screens: ${failed.length - crashed.length} of ${results.length} fail on the defect itself` +
    (crashed.length ? `; crashed instead: ${crashed.map((r) => r.id).join(", ")}` : "") +
    (passed.length ? `; NOT PROVEN (pass on the old screens): ${passed.map((r) => r.id).join(", ")}` : ""));
  process.exit(passed.length || crashed.length ? 1 : 0);
}

/** Call a hook that takes the layers before it as its argument (useXActions(prev)) and return what it gives. */
const hook = (useIt, arg) => withHooks(stateless, () => useIt(arg));
/** Mount a hook that keeps its own state: m.api is what it returns now; m.render() after changing something. */
function mountHook(useIt, arg) {
  const m = mount(() => { m_api = useIt(arg); return null; }, {});
  var m_api;
  return { get api() { return m_api; }, render() { m.render(); return m_api; } };
}

/** The home currency the screens will see (it is fetched once and shared, as in the app). */
async function signedInBureau(home) {
  replyWith = (url) => (url.includes("/currencies") ? { baseCurrency: home, currencies: [] } : undefined);
  mountHook(require(path.join(SRC, "lib/useBaseCurrency")).useBaseCurrency);
  await tick(30);
}
/** Run a test file: anything thrown outside a proof() stops the run with an error. */
function suite(body) {
  body().then(finish, (e) => { console.log(`SUITE STOPPED: ${e && e.stack ? e.stack : e}`); process.exit(2); });
}

module.exports = { withBrowser, store, signedInBureau, suite, hook, mountHook, SRC, WEB, fromWeb, React, mount, text, find, tag, pressable, tick, vm, proof, finish, server, clipboard, toasts, app: (p) => require(path.join(SRC, p)) };
