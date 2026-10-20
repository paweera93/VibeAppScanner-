#!/usr/bin/env python3
"""Build the guide pages (public/<slug>.html) and public/sitemap.xml from the GUIDES list.

Each guide is plain HTML in the same layout as about.html, with Article and FAQPage
structured data so search engines and AI assistants can quote it. Run after editing:
    python3 scripts/build-guides.py
"""
import html
import json
from datetime import date
from pathlib import Path

SITE = 'https://www.getleakpatrol.com'
PUBLIC = Path(__file__).resolve().parent.parent / 'public'
TODAY = date.today().isoformat()

GUIDES = [
    {
        'slug': 'supabase-october-30-change',
        'title': "Supabase's October 30 change: what it fixes for your app's security, and what it doesn't",
        'description': 'From 30 October 2026, new Supabase tables are no longer exposed to the Data API automatically. Existing tables keep their access. What breaks, what stays open, and what to check before the date.',
        'h1': "Supabase's October 30 change: what it fixes, and what it doesn't",
        'body': """
<p class="lead-p">On 30 October 2026, Supabase changes how new tables are exposed in existing projects. It's a good security change, but it's easy to misread as "my database is now safe". It isn't: tables you already have keep exactly the access they have today.</p>

<h2>What's changing</h2>
<p>Until now, every table created in the <code>public</code> schema was automatically granted to the <code>anon</code>, <code>authenticated</code> and <code>service_role</code> roles, so the Data API (REST and GraphQL, which supabase-js uses) could read and write it straight away. Row Level Security was the only thing standing in the way.</p>
<p>From 30 October, <strong>new</strong> tables in <code>public</code> won't get those grants automatically. You have to opt each one in with a Postgres <code>GRANT</code> before your app can reach it through the Data API. New projects have worked this way since May, and the Supabase CLI switched for local development in June.</p>

<h2>What doesn't change</h2>
<ul>
<li><strong>Existing tables keep their grants.</strong> If a table is readable by anyone today, it still will be on 31 October.</li>
<li><strong>Row Level Security works the same.</strong> A table with RLS off, or with a <code>using (true)</code> policy, is just as open as before.</li>
<li><strong>Direct database connections</strong> (an ORM or server using a connection string) aren't affected.</li>
</ul>
<p>So the change stops <em>new</em> accidents. It doesn't fix the leaks that are already out there.</p>

<h2>What might break</h2>
<p>If your app (or your AI tool) creates new tables after 30 October through migrations or the SQL editor, those tables won't be reachable from the browser until you grant access. Expect a permission error from the Data API on a brand-new table.</p>
<p>The fix is to grant only what the app needs, and to switch RLS on at the same time:</p>
<pre><code>alter table public.notes enable row level security;

grant select, insert, update, delete on public.notes to authenticated;

create policy "Users manage their own notes"
on public.notes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);</code></pre>
<p>Only grant to <code>anon</code> (logged-out visitors) if the table is meant to be public, like a product list, and then usually just <code>select</code>.</p>
<p><strong>Watch out for AI tools "fixing" the error the wrong way.</strong> If you paste a permission error into Lovable, Bolt or Cursor, check it doesn't respond by granting everything to <code>anon</code> or turning RLS off. That would recreate exactly the problem this change is meant to prevent.</p>

<h2>What to check before 30 October</h2>
<p>Because existing tables keep their access, this is a good moment to audit them. In the SQL editor:</p>
<p><strong>1. Which tables have RLS off:</strong></p>
<pre><code>select tablename, rowsecurity
from pg_tables
where schemaname = 'public';</code></pre>
<p><strong>2. What logged-out visitors are allowed to do:</strong></p>
<pre><code>select table_name, string_agg(privilege_type, ', ') as privileges
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name;</code></pre>
<p>Any table that appears in the second list with RLS off in the first is readable (and often writable) by anyone who has your anon key, which is in your app's JavaScript.</p>
<p><strong>3. Policies that let everyone through:</strong> look for <code>using (true)</code> in Authentication &rarr; Policies.</p>
<p>LeakPatrol's free scan checks your live app from the outside for leaked keys, public files and missing protections. The full report adds a Supabase check that reads your table, policy, view and storage settings from a query you run yourself, so we never need access to your project.</p>
""",
        'faq': [
            ('What changes in Supabase on October 30, 2026?', 'New tables created in the public schema of existing projects are no longer automatically granted to the anon, authenticated and service_role roles, so they are not reachable through the Data API until you add an explicit GRANT.'),
            ('Does the Supabase October 30 change secure my existing tables?', 'No. Existing tables keep their current grants and Row Level Security behaves the same, so tables that are open today stay open. You need to check RLS and grants on existing tables yourself.'),
            ('Why does my new Supabase table give a permission error?', 'After the change, new public tables need an explicit grant, for example grant select, insert, update, delete on public.my_table to authenticated, together with Row Level Security policies.'),
        ],
    },
    {
        'slug': 'lovable-security-check',
        'title': 'Lovable security check: is your Lovable app safe?',
        'description': 'Free security check for Lovable apps. Find leaked API keys, Supabase tables without Row Level Security, and missing protections, with fixes you can paste back into Lovable.',
        'h1': 'Lovable security check: is your Lovable app safe?',
        'body': """
<p class="lead-p">Lovable can turn an idea into a working app in an afternoon. What it can't do is notice when that app quietly hands your secrets to every visitor. This page covers the security problems we see most in Lovable apps, how to check for each one yourself, and how to fix them with a prompt.</p>

<h2>The five problems to check first</h2>

<h3>1. Secret API keys in the frontend</h3>
<p>Lovable apps are React apps built with Vite. Any environment variable starting with <code>VITE_</code> is bundled into the JavaScript that every visitor downloads. That's fine for public values like your Supabase URL, but if your OpenAI, Stripe or Resend secret key ended up in a <code>VITE_</code> variable, or was pasted straight into a component, anyone can copy it and run up your bill.</p>
<p><strong>Fix:</strong> move the call into a Supabase Edge Function that reads the key from Supabase secrets, and call that function from the app instead. Then rotate the old key.</p>

<h3>2. Supabase tables without Row Level Security</h3>
<p>Most Lovable apps use Supabase. The anon key in your app is public by design: what protects your data is Row Level Security (RLS). If a table has RLS off, or a policy like <code>using (true)</code>, anyone can read it, and often change it, without logging in.</p>
<p><strong>Fix:</strong> ask Lovable to enable RLS on every table and to write policies so each user can only read and change their own rows (for example <code>auth.uid() = user_id</code>).</p>

<h3>3. The Supabase service_role key in the browser</h3>
<p>The service_role (or <code>sb_secret_</code>) key bypasses every RLS policy. It sometimes gets added to the frontend to make an admin feature work. If it's there, your whole database is open no matter how good your policies are.</p>
<p><strong>Fix:</strong> rotate it in Supabase (Settings → API) straight away and move admin features into an Edge Function.</p>

<h3>4. Storage buckets anyone can read</h3>
<p>Supabase Storage has its own policies, separate from your tables. A public bucket is fine for avatars, but not for invoices, ID photos or exports.</p>

<h3>5. Missing security headers on your own domain</h3>
<p>When you connect a custom domain or export the app to another host, check that it sends basic security headers such as Content-Security-Policy and Strict-Transport-Security. They make whole classes of attack much harder.</p>

<h2>How to check your Lovable app</h2>
<ol>
<li>Open your live app, then your browser's DevTools → Sources, and search the JavaScript for <code>sk-</code>, <code>sk_live</code>, <code>service_role</code> and <code>sb_secret_</code>. You should find none.</li>
<li>In Supabase, open the Table Editor and check every table says RLS is enabled.</li>
<li>Look through your policies for <code>using (true)</code>.</li>
<li>In Storage, check which buckets are public.</li>
</ol>
<p>Or let LeakPatrol do it from the outside, the way an attacker would see your app. It's free, read-only and takes about a minute. Every problem comes with a prompt you can paste straight back into Lovable.</p>
""",
        'faq': [
            ('Is Lovable secure?', 'Lovable itself is a reputable platform, but the apps it generates can still contain security mistakes, such as secret API keys in the frontend or Supabase tables without Row Level Security. Each app needs checking.'),
            ('Is my Supabase anon key safe in a Lovable app?', 'Yes. The anon key is meant to be public. Your data is protected by Row Level Security policies, so check that RLS is on for every table.'),
            ('How do I check my Lovable app for leaked API keys?', 'Search your live site\'s JavaScript in DevTools for key prefixes like sk-, sk_live and service_role, or paste your app\'s URL into a free read-only scanner like LeakPatrol.'),
        ],
    },
    {
        'slug': 'supabase-security-check',
        'title': 'Supabase security check: is your anon key safe? (RLS checker)',
        'description': 'Is your Supabase anon key safe in the frontend? Yes, if Row Level Security is on. Check RLS, the service_role key, storage buckets and views, with copy-paste SQL.',
        'h1': 'Is your Supabase anon key safe in the frontend? Yes. Here\'s what isn\'t.',
        'body': """
<p class="lead-p">If you've built an app on Supabase with Lovable, Bolt, v0 or Cursor, you've probably opened DevTools, seen a long <code>eyJ...</code> key in your JavaScript, and felt your stomach drop. Good news first: <strong>that key is supposed to be there.</strong> Here's what it does, and the four things that do leak data in Supabase apps.</p>

<h2>The anon key is public by design</h2>
<table>
<thead><tr><th>Key</th><th>Starts with</th><th>Where it belongs</th></tr></thead>
<tbody>
<tr><td>anon / publishable</td><td><code>eyJ...</code> (role anon) or <code>sb_publishable_</code></td><td>The browser. Fine to ship.</td></tr>
<tr><td>service_role / secret</td><td><code>eyJ...</code> (role service_role) or <code>sb_secret_</code></td><td>Only on a server. Never in the browser.</td></tr>
</tbody>
</table>
<p>The anon key only identifies your project. What someone can do with it is decided entirely by your Row Level Security (RLS) policies. <strong>So the anon key is safe only if RLS is doing its job.</strong></p>

<h2>1. Tables with RLS turned off</h2>
<p>With RLS off, anyone who copies your anon key can read, and often write, the whole table with one request. Check every table in the SQL editor:</p>
<pre><code>select tablename, rowsecurity
from pg_tables
where schemaname = 'public';</code></pre>
<p>Anything showing <code>false</code> is open. Turn RLS on and add a policy that ties rows to their owner:</p>
<pre><code>alter table public.profiles enable row level security;

create policy "Users read their own profile"
on public.profiles for select
using (auth.uid() = user_id);</code></pre>
<p>Watch out for policies with <code>using (true)</code>. They switch RLS on but let everyone through.</p>

<h2>2. The service_role key in the browser</h2>
<p>The service_role (or <code>sb_secret_</code>) key bypasses RLS completely. AI tools sometimes put it in a <code>VITE_</code> or <code>NEXT_PUBLIC_</code> variable to make an admin feature work, and anything with those prefixes is shipped to every visitor. If you find it, rotate it in Supabase (Settings → API) and move the admin work into an Edge Function.</p>

<h2>3. Storage buckets</h2>
<p>Storage has its own policies on <code>storage.objects</code>, separate from your tables. A public bucket means anyone with a file's URL can download it.</p>

<h2>4. Views and functions that skip RLS</h2>
<ul>
<li><strong>Views</strong> run with their creator's rights by default, so a view over a protected table can expose it. On Postgres 15+, create them <code>with (security_invoker = on)</code>.</li>
<li><strong>Functions marked SECURITY DEFINER</strong> also run with their owner's rights. If one is callable through the API, make sure it only returns what the caller should see.</li>
</ul>

<h2>The 2-minute check</h2>
<ol>
<li>In DevTools → Sources on your live app, search for <code>service_role</code>, <code>sb_secret_</code>, <code>sk-</code> and <code>sk_live</code>. You should find none.</li>
<li>Run the SQL above. Every table should show <code>true</code>.</li>
<li>Look for <code>using (true)</code> in your policies.</li>
<li>Check which storage buckets are public.</li>
</ol>
<p>LeakPatrol checks the outside of your app for leaked keys for free, and once you prove you own the site, it also tests which Supabase tables can be read without logging in.</p>
""",
        'faq': [
            ('Is the Supabase anon key safe to expose?', 'Yes. The anon (or publishable) key is designed to be public. Your data is protected by Row Level Security policies, so it is only safe if RLS is enabled with correct policies on every table.'),
            ('What happens if Row Level Security is off in Supabase?', 'Anyone with your anon key, which is visible in your frontend, can read and often modify every row in that table without logging in.'),
            ('Can the service_role key be used in the browser?', 'No. The service_role or sb_secret_ key bypasses all Row Level Security. Keep it on a server or in an Edge Function and rotate it if it was ever exposed.'),
            ('How do I check if RLS is enabled on all my Supabase tables?', "Run select tablename, rowsecurity from pg_tables where schemaname = 'public'; in the SQL editor. Any table showing false has RLS off."),
        ],
    },
    {
        'slug': 'exposed-api-key-check',
        'title': 'How to check if your API key is exposed on your website',
        'description': 'Check whether OpenAI, Stripe, AWS or other secret API keys are visible in your website\'s JavaScript, what each key prefix means, and what to do if one leaked.',
        'h1': 'How to check if your API key is exposed on your website',
        'body': """
<p class="lead-p">If a secret API key is in your website's JavaScript, anyone can copy it in seconds, and bots scan new sites for exactly that. Here's how to check your own site, what the common key formats look like, and what to do if you find one.</p>

<h2>Check your site in two minutes</h2>
<ol>
<li>Open your live website in Chrome, Edge or Firefox.</li>
<li>Open DevTools (F12, or Cmd+Option+I on a Mac) and go to <strong>Sources</strong>.</li>
<li>Press Ctrl+Shift+F (Cmd+Option+F on a Mac) to search across all files.</li>
<li>Search for each of the prefixes below. A secret key should never appear.</li>
</ol>

<h2>What leaked keys look like</h2>
<table>
<thead><tr><th>Service</th><th>Secret key starts with</th><th>Risk</th></tr></thead>
<tbody>
<tr><td>OpenAI</td><td><code>sk-proj-</code>, <code>sk-</code></td><td>Usage billed to you</td></tr>
<tr><td>Anthropic</td><td><code>sk-ant-</code></td><td>Usage billed to you</td></tr>
<tr><td>Stripe</td><td><code>sk_live_</code>, <code>rk_live_</code></td><td>Refunds, payouts, customer data</td></tr>
<tr><td>AWS</td><td><code>AKIA</code>, <code>ASIA</code></td><td>Whatever the key can reach</td></tr>
<tr><td>Supabase</td><td><code>service_role</code> JWT, <code>sb_secret_</code></td><td>Your whole database</td></tr>
<tr><td>GitHub</td><td><code>ghp_</code>, <code>github_pat_</code></td><td>Your repositories</td></tr>
<tr><td>Google</td><td><code>AIza</code></td><td>Depends on restrictions</td></tr>
</tbody>
</table>
<p>Some keys are meant to be public: Stripe publishable keys (<code>pk_live_</code>) and the Supabase anon key are fine in the browser.</p>

<h2>Why keys end up in the frontend</h2>
<p>In apps built with Vite, Next.js or Create React App, environment variables starting with <code>VITE_</code>, <code>NEXT_PUBLIC_</code> or <code>REACT_APP_</code> are bundled into the JavaScript every visitor downloads. AI coding tools often use these prefixes to make a feature work quickly. Other common leaks are a public <code>.env</code> file (try opening <code>yoursite.com/.env</code>) and public source maps.</p>

<h2>If you find a leaked key</h2>
<ol>
<li><strong>Rotate it now</strong> in the provider's dashboard. Deleting it from your code is not enough: it's already been downloaded.</li>
<li><strong>Move the call to a server</strong>, such as a serverless function or Supabase Edge Function, that reads the key from a secret.</li>
<li><strong>Set a spend limit</strong> for AI providers so a future leak can't run up an unlimited bill.</li>
<li><strong>Check the provider's usage logs</strong> for anything you don't recognise.</li>
</ol>
<p>LeakPatrol does this check automatically: paste your site's address and it searches every JavaScript file it loads for more than 10 kinds of secret key, plus public <code>.env</code> files, <code>.git</code> folders and source maps. It's free and read-only, and any key it finds is masked.</p>
""",
        'faq': [
            ('How do I know if my API key is exposed?', 'Open your live website, go to DevTools, search all JavaScript files for key prefixes such as sk-, sk_live_, AKIA and service_role, or use a free read-only scanner like LeakPatrol.'),
            ('Is it safe to put an API key in frontend JavaScript?', 'Only public keys such as Stripe publishable keys or the Supabase anon key. Secret keys must stay on a server, because anything in frontend JavaScript can be read by every visitor.'),
            ('What should I do if my OpenAI API key was exposed?', 'Revoke it in the OpenAI dashboard immediately, create a new one, move OpenAI calls to a server-side function, and set a monthly spend limit.'),
        ],
    },
]

HEADER = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} · LeakPatrol</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="LeakPatrol">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:image" content="https://www.getleakpatrol.com/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/styles.css">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <script type="application/ld+json">{jsonld}</script>
  <!-- Cloudflare Web Analytics: cookie-free visit counts -->
  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{{"token": "b05ba6abd84a41b8b96c1c0188500e6a"}}'></script>
</head>
<body>
  <div class="site-header-band">
    <header class="site-header wrap">
      <a class="brand" href="/"><img src="/favicon.svg" alt="" width="26" height="26"> LeakPatrol</a>
      <nav class="nav"><a href="/#how">How it works</a> <a href="/guides.html">Guides</a> <a href="/about.html">About</a></nav>
    </header>
  </div>
  <main class="prose guide">
    <p class="crumbs"><a href="/">LeakPatrol</a> › <a href="/guides.html">Guides</a></p>
    <h1>{h1}</h1>
    <p class="byline">By LeakPatrol · Updated {updated}</p>
"""

FOOTER = """
    <div class="guide-cta">
      <h2>Check your app in a minute</h2>
      <p>Free, read-only, no sign-up. Every problem comes with a plain-English fix and a prompt for your AI tool.</p>
      <form class="scan-form" action="/" method="get">
        <label for="guide-url" class="visually-hidden">Your app's address</label>
        <input id="guide-url" name="url" type="text" inputmode="url" placeholder="myapp.lovable.app" required>
        <input type="hidden" name="ref" value="guide-{slug}">
        <button type="submit">Scan free</button>
      </form>
    </div>
    <div class="signup-box">
      <h2>Get the 10-point checklist</h2>
      <p>Every check we run on AI-built apps, with how to do each one yourself. Straight to your inbox.</p>
      <form class="scan-form" data-signup data-source="guide-{slug}" novalidate>
        <label for="guide-email" class="visually-hidden">Your email</label>
        <input id="guide-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
        <input name="website" type="text" class="visually-hidden" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button type="submit">Email me the checklist</button>
      </form>
      <p class="fine-print signup-status" aria-live="polite">Plus an email when automatic re-checks launch, and the odd tip. Unsubscribe any time.</p>
    </div>
{faq}
    <h2>More guides</h2>
    <ul>{more}</ul>
  </main>
  <footer class="site-footer wrap">
    <a class="brand" href="/"><img src="/favicon.svg" alt="" width="20" height="20"> LeakPatrol</a>
    <nav><a href="/guides.html">Guides</a> <a href="/about.html">About</a> <a href="/privacy.html">Privacy</a> <a href="/terms.html">Terms</a> <a href="mailto:hello@getleakpatrol.com">Contact</a></nav>
  </footer>
  <script src="/signup.js" type="module"></script>
</body>
</html>
"""

AUTHOR = {'@type': 'Organization', 'name': 'LeakPatrol', 'url': SITE + '/about.html'}
PUBLISHER = {'@type': 'Organization', 'name': 'LeakPatrol', 'url': SITE + '/', 'logo': SITE + '/logo.png'}


def esc(s):
    return html.escape(s, quote=True)


def build_guide(g):
    url = f"{SITE}/{g['slug']}.html"
    faq_ld = {'@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in g['faq']]}
    jsonld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', 'headline': g['h1'], 'description': g['description'], 'url': url,
         'datePublished': g.get('published', TODAY), 'dateModified': TODAY,
         'author': AUTHOR, 'publisher': PUBLISHER, 'image': SITE + '/og-image.png'},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'LeakPatrol', 'item': SITE + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Guides', 'item': SITE + '/guides.html'},
            {'@type': 'ListItem', 'position': 3, 'name': g['title'], 'item': url}]},
        faq_ld]}
    faq_html = '\n    <h2>Questions</h2>\n' + '\n'.join(
        f'    <details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in g['faq'])
    more = ''.join(f'<li><a href="/{o["slug"]}.html">{esc(o["title"])}</a></li>' for o in GUIDES if o is not g)
    page = HEADER.format(title=esc(g['title']), description=esc(g['description']), url=url, h1=esc(g['h1']),
                         updated=date.today().strftime('%-d %B %Y'),
                         jsonld=json.dumps(jsonld, ensure_ascii=False).replace('</', '<\\/'))
    page += g['body'] + FOOTER.format(faq=faq_html, more=more, slug=g['slug'])
    (PUBLIC / f"{g['slug']}.html").write_text(page)


def build_index():
    items = '\n'.join(
        f'    <li><a href="/{g["slug"]}.html"><strong>{esc(g["title"])}</strong></a><br>{esc(g["description"])}</li>' for g in GUIDES)
    page = HEADER.format(title='Security guides for AI-built apps',
                         description='Practical security guides for apps built with Lovable, Bolt, v0, Replit and Cursor: leaked API keys, Supabase Row Level Security and more.',
                         url=SITE + '/guides.html', h1='Security guides for AI-built apps', updated=date.today().strftime('%-d %B %Y'),
                         jsonld=json.dumps({'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'Security guides for AI-built apps', 'url': SITE + '/guides.html', 'publisher': PUBLISHER}))
    page = page.replace('<p class="crumbs"><a href="/">LeakPatrol</a> › <a href="/guides.html">Guides</a></p>', '<p class="crumbs"><a href="/">LeakPatrol</a></p>')
    page += f"""
    <p>Short, practical guides to the security mistakes AI coding tools make most.</p>
    <ul class="guide-list">
{items}
    </ul>
    <div class="guide-cta">
      <h2>Check your app in a minute</h2>
      <p>Free, read-only, no sign-up.</p>
      <a class="button" href="/">Scan your app free</a>
    </div>
  </main>
  <footer class="site-footer wrap">
    <a class="brand" href="/"><img src="/favicon.svg" alt="" width="20" height="20"> LeakPatrol</a>
    <nav><a href="/guides.html">Guides</a> <a href="/about.html">About</a> <a href="/privacy.html">Privacy</a> <a href="/terms.html">Terms</a> <a href="mailto:hello@getleakpatrol.com">Contact</a></nav>
  </footer>
</body>
</html>
"""
    (PUBLIC / 'guides.html').write_text(page)


def build_sitemap():
    pages = [('', '1.0'), ('guides.html', '0.8')] + [(g['slug'] + '.html', '0.8') for g in GUIDES] + \
            [('about.html', '0.5'), ('privacy.html', '0.2'), ('terms.html', '0.2')]
    urls = '\n'.join(f'  <url><loc>{SITE}/{p}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>' for p, pr in pages)
    (PUBLIC / 'sitemap.xml').write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n')


if __name__ == '__main__':
    for g in GUIDES:
        build_guide(g)
    build_index()
    build_sitemap()
    print(f'built {len(GUIDES)} guides, guides.html and sitemap.xml')
