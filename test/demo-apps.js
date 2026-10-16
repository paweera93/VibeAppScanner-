// Deliberately broken and clean demo apps, served from memory.
// Fake secrets are assembled at runtime so no secret-shaped string is committed
// (that would trip GitHub push protection and secret scanners).

import http from 'node:http';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role, iat: 1700000000 })}.c2lnbmF0dXJlLXRlc3Qtb25seQ`;

const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const FAKE_OPENAI = ['sk', 'proj', 'TESTONLYabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKL'].join('-');
const FAKE_STRIPE = ['sk', 'live', 'TESTONLY1234567890abcdefgh'].join('_');

const SPA_HTML = (script) =>
  `<!doctype html><html><head><title>Demo</title><script type="module" crossorigin src="${script}"></script></head><body><div id="root"></div></body></html>`;

export const APPS = {
  broken: {
    headers: { 'x-powered-by': 'Express', 'set-cookie': 'session=abc123; Path=/' },
    files: {
      '/': SPA_HTML('/assets/index-a1b2c3d4.js'),
      '/assets/index-a1b2c3d4.js':
        `const supabase = createClient("${SUPABASE_URL}", "${jwt('anon')}");\n` +
        `const load = () => supabase.from("orders").select("*"), avatar = supabase.storage.from("avatars");\n` +
        `const admin = createClient("${SUPABASE_URL}", "${jwt('service_role')}");\n` +
        `const Dashboard = () => import("./Dashboard-e5f6a7b8.js");\n` +
        `//# sourceMappingURL=index-a1b2c3d4.js.map\n`,
      '/assets/Dashboard-e5f6a7b8.js':
        `const openai = new OpenAI({ apiKey: "${FAKE_OPENAI}", dangerouslyAllowBrowser: true });\n` +
        `const stripe = "${FAKE_STRIPE}";\n`,
      '/assets/index-a1b2c3d4.js.map': '{"version":3,"sources":["src/App.tsx"],"mappings":""}',
      '/.env': 'SUPABASE_SERVICE_ROLE_KEY=test-only\nOPENAI_API_KEY=test-only\n',
    },
    // Unknown paths fall back to index.html, like a real SPA host.
    spaFallback: true,
  },
  clean: {
    headers: {
      'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=()',
    },
    files: {
      '/': SPA_HTML('/assets/index-0f9e8d7c.js'),
      '/assets/index-0f9e8d7c.js': `const supabase = createClient("${SUPABASE_URL}", "${jwt('anon')}");\n`,
    },
    spaFallback: true,
  },
};

// A fake Supabase project: "profiles" and "orders" are readable without a login,
// "products" is public on purpose but without personal columns, "messages" is protected by RLS.
export function serveSupabase() {
  const requests = [];
  const tables = {
    profiles: { rows: [{ id: 1, email: 'someone@example.com', full_name: 'Test Person' }], total: 42 },
    orders: { rows: [{ id: 7, amount: 900, user_id: 'u1' }], total: 3 },
    products: { rows: [{ id: 1, name: 'Mug' }], total: 12 },
    messages: { rows: [], total: 0 },
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push({ method: req.method, path: url.pathname, headers: req.headers });
    const json = (status, body, headers = {}) => res.writeHead(status, { 'content-type': 'application/json', ...headers }).end(JSON.stringify(body));
    if (!req.headers.apikey) return json(401, { message: 'No API key found in request' });
    if (url.pathname === '/rest/v1/') return json(200, { paths: { '/': {}, '/profiles': {}, '/products': {}, '/messages': {}, '/rpc/do_thing': {} } });
    if (url.pathname === '/auth/v1/settings') return json(200, { disable_signup: false, mailer_autoconfirm: true });
    const t = tables[url.pathname.replace('/rest/v1/', '')];
    if (!t) return json(404, { message: 'relation does not exist' });
    return json(200, t.rows, { 'content-range': `0-${Math.max(0, t.rows.length - 1)}/${t.total}` });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, requests })));
}

export function serve(app) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const path = new URL(req.url, 'http://x').pathname;
      let body = app.files[path];
      if (body === undefined && app.spaFallback && !path.includes('.')) body = app.files['/'];
      if (body === undefined && app.spaFallback && path.startsWith('/.')) body = app.files['/'];
      if (body === undefined) {
        res.writeHead(404).end('not found');
        return;
      }
      const type = path.endsWith('.js') ? 'text/javascript' : path === '/' || !path.includes('.') ? 'text/html' : 'text/plain';
      res.writeHead(200, { 'content-type': type, ...app.headers });
      res.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}
