import { execa, Result } from 'execa'
import onExit from 'exit-hook'
import glob from 'fast-glob'
import { existsSync, unlinkSync } from 'node:fs'
import { copyFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { defer } from 'radashi'
import { getEnv } from './env'
import { fatal, info } from './util/logger'

export async function lint(files: string[] = []) {
  const env = getEnv()

  const binFiles = glob.sync('*', {
    cwd: join(env.root, 'node_modules/.bin'),
  })

  for (const binFile of binFiles) {
    if (binFile === 'biome' && existsSync(join(env.root, 'biome.json'))) {
      const biomeGlobs = ['./src', './tests', './benchmarks'].flatMap(
        rootGlob => [rootGlob, rootGlob.replace('./', './overrides/')],
      )
      await execa('pnpm', ['biome', 'check', ...biomeGlobs], {
        cwd: env.root,
        stdio: 'inherit',
      }).catch(error => {
        console.error(error.message)
        fatal('Biome failed to lint.')
      })
    } else if (
      binFile === 'eslint' &&
      (await glob('eslint.config.*', { cwd: env.root })).length > 0
    ) {
      await execa('pnpm', ['eslint', ...files], {
        cwd: env.root,
        stdio: 'inherit',
      }).catch(error => {
        console.error(error.message)
        fatal('ESLint failed to lint.')
      })
    }
  }

  const missingDeps: string[] = []

  if (!env.pkg.devDependencies?.['eslint-plugin-compat']) {
    missingDeps.push('eslint-plugin-compat')
  }

  if (!env.pkg.devDependencies?.['@typescript-eslint/parser']) {
    missingDeps.push('@typescript-eslint/parser')
  }

  if (missingDeps.length > 0) {
    info(
      `Missing required devDependencies: ${missingDeps.join(', ')}. Please install them and try again.`,
    )
  } else {
    let lintOutput: Result | undefined

    await defer(async defer => {
      const thisDir = dirname(new URL(import.meta.url).pathname)
      const configFilePath = resolve(thisDir, '../config/dist/eslint.config.js')

      const tmpFilePath = resolve(env.root, 'eslint-compat.config.js')
      await copyFile(configFilePath, tmpFilePath)

      const preventUnlink = onExit(() => {
        unlinkSync(tmpFilePath)
      })

      defer(() => {
        unlinkSync(tmpFilePath)
        preventUnlink()
      })

      lintOutput = await execa(
        'pnpm',
        [
          ...(binFiles.includes('eslint') ? ['eslint'] : ['dlx', 'eslint@^9']),
          '-c',
          tmpFilePath,
          ...files,
        ],
        {
          cwd: env.root,
          stdio: 'inherit',
        },
      ).catch(error => {
        console.error(error.message)
        fatal('ESLint failed to lint.')
      })
    })

    if (lintOutput && lintOutput.exitCode !== 0) {
      process.exit(lintOutput.exitCode)
    }
  }
}
