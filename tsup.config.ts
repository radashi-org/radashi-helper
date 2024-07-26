import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/cli.ts', 'src/vitest/plugin.ts', 'src/esbuild/plugin.ts'],
    format: ['esm'],
    splitting: true,
    dts: true,
  },
  {
    entry: ['config/eslint.config.ts'],
    format: ['esm'],
    bundle: true,
    outDir: 'config/dist',
    external: [/^[a-z]/],
  },
])
