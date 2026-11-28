import { readFileSync } from 'node:fs';

const release = 'workspace-20261128';
const files = {};
const types = {
  html: 'text/html; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png'
};

const sources = [
  ['index.html', 'index.html'],
  ...['app.js', 'workspace-ui.js', 'style.css'].map(name => [release + '/' + name, name]),
  ...['knolquiz-mark.svg', 'knolstory-mark.svg', 'knolart-mark.svg', 'nolprint-mark-pink.png', 'nolsaju-mark.svg']
    .map(name => [release + '/' + name, '../assets/shortcuts/' + name])
];

for (const [path, source] of sources) {
  const extension = path.split('.').at(-1);
  const contents = readFileSync(new URL(source, import.meta.url), extension === 'png' ? 'base64' : 'utf8');
  files['/' + path] = [types[extension], contents];
}

const securityHeaders = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self' blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'permissions-policy': 'camera=(self), microphone=(), geolocation=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff'
};

// The KNOLCAM service binding serves the existing assets and Windows download.
process.stdout.write('const files = ' + JSON.stringify(files) + ';\n');
process.stdout.write('const securityHeaders = ' + JSON.stringify(securityHeaders) + ';\n');
process.stdout.write(`
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    const path = pathname === '/' ? '/index.html' : pathname;
    const asset = Object.hasOwn(files, path) && files[path];
    if (!asset || !['GET', 'HEAD'].includes(request.method)) return env.KNOLCAM.fetch(request);
    const [type, contents] = asset;
    const body = type === 'image/png' ? Uint8Array.from(atob(contents), char => char.charCodeAt(0)) : contents;
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { ...securityHeaders, 'Content-Type': type, 'Cache-Control': path === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' }
    });
  }
};
`);
