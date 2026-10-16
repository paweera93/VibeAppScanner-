// Copy-paste prompts for AI coding tools (Lovable, Bolt, v0, Cursor, Claude Code).
// These are the main thing the full report adds: each finding becomes an instruction
// the person can paste straight into the tool that built their app.

const SECRET_PROMPT = (f) =>
  `My app's front-end JavaScript contains a secret: ${f.title.replace(' is visible in your JavaScript', '')}. ` +
  `Anyone who opens the site can read it. Please:\n` +
  `1. Find every place this key is used in the front-end code.\n` +
  `2. Move those calls into a server-side function (for example a Supabase Edge Function or an API route) ` +
  `that reads the key from an environment variable or secret, never from code.\n` +
  `3. Change the front-end to call that function instead.\n` +
  `4. Make sure no environment variable holding this key starts with VITE_, NEXT_PUBLIC_ or REACT_APP_, because those are bundled into the browser.\n` +
  `Do not print the key in your reply. I will rotate the old key myself after this change.`;

const PROMPTS = {
  'supabase-service-key': () =>
    `My app's front-end JavaScript contains the Supabase service_role (or sb_secret_) key, which bypasses Row Level Security. Please:\n` +
    `1. Remove the service key from all front-end code and from any VITE_/NEXT_PUBLIC_ environment variables.\n` +
    `2. Make the browser Supabase client use only the anon/publishable key.\n` +
    `3. Move anything that really needs admin access into a Supabase Edge Function that reads the service key from Supabase secrets.\n` +
    `4. Check that Row Level Security is enabled on every table, with policies that only let users read and write their own rows.\n` +
    `Do not print any keys in your reply. I will rotate the service key in Supabase (Settings > API) myself.`,
  'supabase-detected': () =>
    `My app uses Supabase. Please review every table in my Supabase project and:\n` +
    `1. Enable Row Level Security on every table.\n` +
    `2. Write policies so a logged-in user can only read and change their own rows (for example using auth.uid() = user_id).\n` +
    `3. Make sure no table is readable by the anon role unless it is meant to be public, and list any that are.\n` +
    `4. Check storage buckets the same way.\n` +
    `Show me the SQL for each policy before applying it.`,
  'exposed-env': () =>
    `My site serves its .env file publicly. Please make sure no .env file is inside the public/ or static folder, ` +
    `add .env* to .gitignore, and add a rule at the host that returns 404 for any path starting with /.env. ` +
    `List every variable name in the file (not the values) so I know which keys to rotate.`,
  'exposed-git': () =>
    `My site serves its .git folder publicly, so the whole source history can be downloaded. Please change the build ` +
    `and deploy so the .git folder is never uploaded, and add a host rule that returns 404 for any path starting with /.git.`,
  'public-source-map': () =>
    `My production build publishes source maps (.map files), which expose my original source code. Please turn off ` +
    `production source maps (for Vite set build.sourcemap to false in vite.config; for Next.js set productionBrowserSourceMaps to false) and rebuild.`,
  'no-https': () =>
    `My site is served over plain HTTP. Please set it up so it is only served over HTTPS and every http:// request redirects to https://.`,
  'no-https-redirect': () =>
    `The http:// version of my site does not redirect to https://. Please add a permanent (301) redirect from http to https at the host or in the server config.`,
  'cookie-flags': (f) =>
    `${f.title}. Please set this cookie with Secure, HttpOnly and SameSite=Lax, unless the front-end genuinely needs to read it, and explain any flag you leave off.`,
};

// All missing headers are fixed together, so they share one prompt.
export const HEADERS_PROMPT = (titles) =>
  `My site is missing these security headers:\n${titles.map((t) => `- ${t}`).join('\n')}\n\n` +
  `Please add them for every page, in the right place for my host (for example vercel.json, netlify.toml, _headers, ` +
  `or the server/middleware config). Use these values, adjusting connect-src for the APIs my app really calls (such as my Supabase URL):\n` +
  `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'\n` +
  `Strict-Transport-Security: max-age=31536000; includeSubDomains\n` +
  `X-Content-Type-Options: nosniff\n` +
  `Referrer-Policy: strict-origin-when-cross-origin\n` +
  `Permissions-Policy: camera=(), microphone=(), geolocation=()\n` +
  `Then load the app and check the browser console for anything the Content-Security-Policy blocks, and allow only what is needed.`;

export function promptFor(finding) {
  if (finding.category === 'headers') return null; // grouped into HEADERS_PROMPT
  if (finding.category === 'secrets' && !PROMPTS[finding.id]) return SECRET_PROMPT(finding);
  return PROMPTS[finding.id]?.(finding) ?? null;
}
