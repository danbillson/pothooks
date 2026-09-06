import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outExtensions: () => ({ js: '.js' }),
  dts: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react/jsx-runtime', '@pothooks/core'],
  // Hooks run in the browser, so the chunk has to announce itself to the
  // App Router. A source directive gets stripped by the bundler; this survives.
  outputOptions: { banner: "'use client';" },
});
