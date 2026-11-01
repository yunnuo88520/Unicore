// Author: yunnuo <ymz@ebox.vip>
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { featureBuild } from '../../scripts/build-features.mjs';

const features = featureBuild();
const apiURL = process.env.UNICORE_API_URL ?? 'http://127.0.0.1:8080';
function administratorEntry(): Plugin {
  return {
    name: 'administrator-entry',
    configureServer(server) {
      server.middlewares.use(async (request, _response, next) => {
        const pathname = request.url?.split('?')[0];
        if (request.method === 'GET' && pathname && !pathname.includes('.') && !pathname.startsWith('/api/')) {
          try {
            const response = await fetch(`${apiURL}/api/v1/admin/bootstrap`, { signal: AbortSignal.timeout(1500) });
            if (response.ok) {
              const adminPath: string = bootstrapPath(await response.json());
              // History routing: serve the administrator entry for the prefix and any deep link under it.
              if (adminPath && (pathname === adminPath || pathname.startsWith(`${adminPath}/`))) request.url = '/admin.html';
            }
          } catch { /* The shared shell reports API startup and connection failures. */ }
        }
        next();
      });
    },
  };
}
function bootstrapPath(payload: unknown): string {
  const path = (payload as { data?: { admin_path?: string } })?.data?.admin_path;
  return typeof path === 'string' && path.startsWith('/') ? path.replace(/\/$/, '') : '';
}
export default defineConfig({
  plugins: [react(), tailwindcss(), features.plugin, administratorEntry()], define: features.define,
  server: { port: 5173, strictPort: true, proxy: { '/api': apiURL } },
  build: { rollupOptions: { input: { client: 'index.html', administrator: 'admin.html' } }, outDir: 'static', emptyOutDir: false },
});
