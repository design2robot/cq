import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
await mkdir('dist/client/assets', { recursive: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });

await Promise.all([
  cp('index.html', 'dist/client/index.html'),
  cp('styles.css', 'dist/client/styles.css'),
  cp('app.js', 'dist/client/app.js'),
  cp('assets/cui-qiang.jpg', 'dist/client/assets/cui-qiang.jpg'),
  cp('.openai/hosting.json', 'dist/.openai/hosting.json'),
]);

const worker = `
export default {
  async fetch(request, env) {
    if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);

    const url = new URL(request.url);
    const fallback = url.pathname === '/' ? '/index.html' : url.pathname;
    return new Response('Static asset unavailable: ' + fallback, { status: 404 });
  }
};
`;

await writeFile('dist/server/index.js', worker.trimStart());

const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
await writeFile('dist/_worker-meta.json', JSON.stringify({
  project_id: hosting.project_id,
  assets: { directory: 'client' },
  entrypoint: 'server/index.js'
}, null, 2));
