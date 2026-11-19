import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      {
        name: 'pdfjs-runtime-assets',
        configureServer(server) {
          const pdfjsDirs = ['cmaps', 'standard_fonts', 'iccs', 'wasm'];
          const mimeTypes: Record<string, string> = {
            '.bcmap': 'application/octet-stream',
            '.pfb': 'application/octet-stream',
            '.ttf': 'font/ttf',
            '.otf': 'font/otf',
            '.icc': 'application/vnd.iccprofile',
            '.wasm': 'application/wasm',
            '.js': 'application/javascript',
            '.mjs': 'application/javascript',
            '.json': 'application/json',
          };
          server.middlewares.use('/pdfjs', (req, res, next) => {
            const urlPath = (req.url || '').split('?')[0].replace(/^\/+/, '');
            const [dirName, ...rest] = urlPath.split('/');
            if (!pdfjsDirs.includes(dirName) || rest.length === 0) {
              next();
              return;
            }
            const relFile = rest.join('/');
            if (relFile.includes('..')) {
              next();
              return;
            }
            const absFile = path.resolve(__dirname, 'node_modules/pdfjs-dist', dirName, relFile);
            if (!fs.existsSync(absFile) || !fs.statSync(absFile).isFile()) {
              next();
              return;
            }
            const ext = path.extname(absFile).toLowerCase();
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            fs.createReadStream(absFile).pipe(res);
          });
        },
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const pdfjsOut = path.resolve(distDir, 'pdfjs');
          const pdfjsDirs = ['cmaps', 'standard_fonts', 'iccs', 'wasm'];
          for (const dirName of pdfjsDirs) {
            const srcDir = path.resolve(__dirname, 'node_modules/pdfjs-dist', dirName);
            const destDir = path.resolve(pdfjsOut, dirName);
            if (fs.existsSync(srcDir)) {
              fs.cpSync(srcDir, destDir, {recursive: true, force: true});
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
