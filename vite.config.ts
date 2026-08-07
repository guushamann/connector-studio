import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';

/** Serves guaranteed-manifold STLs via scripts/connector_export.py (manifold3d). */
function stlApi(): Plugin {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (req: any, res: any) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const params = url.searchParams.get('params') ?? '{}';
    const py = spawn('python3', ['scripts/connector_export.py', params, '-']);
    const chunks: Uint8Array[] = [];
    const errChunks: Uint8Array[] = [];
    py.stdout.on('data', (c) => chunks.push(c));
    py.stderr.on('data', (c) => errChunks.push(c));
    py.on('error', (err) => {
      res.statusCode = 500;
      res.end(`failed to run python3: ${err.message}`);
    });
    py.on('close', (code) => {
      if (code === 0) {
        res.setHeader('Content-Type', 'model/stl');
        res.end(Buffer.concat(chunks));
      } else {
        res.statusCode = 500;
        res.end(Buffer.concat(errChunks).toString() || `exited with ${code}`);
      }
    });
  };
  const attach = (server: ViteDevServer | PreviewServer): void => {
    server.middlewares.use('/api/connector.stl', handler);
  };
  return {
    name: 'connector-stl-api',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig({
  plugins: [react(), stlApi()],
});
