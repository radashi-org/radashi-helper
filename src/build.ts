import { build, BuildOptions } from 'esbuild'
import { Env, getEnv } from './env'
import { join } from 'node:path'
import { esbuildRadashi } from './esbuild/plugin'
import { execa } from 'execa'

export default async function (flags?: { watch?: boolean; esm?: boolean }) {
  const env = getEnv()
  const { pkg, root } = env

  const options: BuildOptions = {
    entryPoints: [join(root, 'src/mod.ts')],
    external: ['@radashi/core'],
    bundle: true,
    outfile: join(root, `dist/esm/radashi.js`),
    platform: 'node',
    target: 'node16',
    format: 'esm',
    plugins: [esbuildRadashi({ env })],
    logLevel: 'info',
  }

  // ESM
  await build(options)

  if (flags?.esm !== true) {
    // CJS
    options.format = 'cjs'
    options.outfile = join(root, `dist/cjs/${pkg.name}.cjs`)
    await build(options)
  }

  await execa(
    'pnpm',
    [
      'tsc',
      '--emitDeclarationOnly',
      '--outDir',
      'dist/dts',
      '--project',
      'src/tsconfig.json',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
}
