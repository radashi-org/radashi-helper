import { BuildOptions, build, context as createContext } from 'esbuild'
import { execa } from 'execa'
import { join, resolve } from 'node:path'
import { sift } from 'radashi'
import { rimraf } from 'rimraf'
import { getEnv } from './env'
import { esbuildRadashi } from './esbuild/plugin'

export default async function (flags?: { watch?: boolean; outDir?: string }) {
  const env = getEnv()
  const { root, config } = env

  const outDir = resolve(
    process.env.RADASHI_OUT_DIR ?? flags?.outDir ?? env.outDir,
  )
  await rimraf(outDir)

  const options: BuildOptions = {
    entryPoints: [env.modPath],
    external: ['radashi'],
    bundle: true,
    outfile: join(outDir, 'radashi.js'),
    platform: 'node',
    target: 'node16',
    format: 'esm',
    plugins: [esbuildRadashi({ env })],
    logLevel: 'info',
  }

  const cjsOptions = {
    ...options,
    format: 'cjs' as const,
    outfile: join(outDir, 'radashi.cjs'),
  }

  if (flags?.watch) {
    const ctx = await createContext(
      config.formats.includes('esm') ? options : cjsOptions,
    )
    await ctx.watch()
  } else {
    // ESM
    if (config.formats.includes('esm')) {
      await build(options)
    }

    // CJS
    if (config.formats.includes('cjs')) {
      await build(cjsOptions)
    }
  }

  // DTS
  if (config.dts) {
    await emitDeclarationTypes(root, join(outDir, 'types'), flags)
  }
}

async function emitDeclarationTypes(
  root: string,
  outDir: string,
  flags?: { watch?: boolean },
) {
  const result = execa(
    'pnpm',
    sift([
      'tsc',
      flags?.watch && '--watch',
      flags?.watch && '--preserveWatchOutput',
      '--emitDeclarationOnly',
      '--outDir',
      outDir,
      '--project',
      'tsconfig.dts.json',
    ]),
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
  if (!flags?.watch) {
    await result
  }
}
