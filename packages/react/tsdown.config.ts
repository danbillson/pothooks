import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outExtensions: () => ({ js: '.js' }),
  dts: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react/jsx-runtime', '@pothooks/core'],
});
