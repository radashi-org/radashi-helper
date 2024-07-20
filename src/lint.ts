import { execa } from 'execa'
import glob from 'fast-glob'
import { dirname, join, relative } from 'node:path'
import { getEnv } from './env'

export async function lint(files: string[]) {
  const env = getEnv()

  const binFiles = glob.sync('*', {
    cwd: join(env.root, 'node_modules/.bin'),
  })

  for (const binFile of binFiles) {
    if (binFile === 'biome') {
      const biomeGlobs = ['./src', './tests', './benchmarks'].flatMap(
        rootGlob => [rootGlob, rootGlob.replace('./', './overrides/')],
      )
      await execa('pnpm', ['biome', 'check', ...biomeGlobs], {
        cwd: env.root,
        stdio: 'inherit',
      }).catch(error => {
        console.error(error.message)
        console.error('Biome failed to lint.')
        process.exit(1)
      })
    }
  }

  const dir = dirname(import.meta.url)
  const configFilePath = relative(dir, '../config/eslint.config.ts')

  const lintOutput = await execa(
    'pnpm',
    [
      ...(binFiles.includes('eslint') ? ['eslint'] : ['dlx', 'eslint@^9']),
      '--no-eslintrc',
      '-c',
      configFilePath,
      ...files,
    ],
    {
      cwd: env.root,
      stdio: 'inherit',
    },
  ).catch(error => {
    console.error(error.message)
    console.error('ESLint failed to lint.')
    process.exit(1)
  })

  if (lintOutput.exitCode !== 0) {
    process.exit(lintOutput.exitCode)
  }
}
