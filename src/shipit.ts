import { execa } from 'execa'
import { readFile, rename, writeFile } from 'fs/promises'
import { Module } from 'module'
import { join, sep } from 'path'
import { omit } from 'radashi'
import { rimraf } from 'rimraf'
import { getEnv } from './env'
import { cwdRelative } from './util/cwdRelative'
import { fatal, info } from './util/logger'

export async function shipIt(flags: { dryRun?: boolean; debug?: boolean }) {
  const env = getEnv()

  flags = {
    ...flags,
    dryRun: flags.dryRun ?? flags.debug,
  }

  if (!flags.debug) {
    if (env.pkg.name === '@yourname/radashi') {
      fatal(
        'Please update the "name" field in your package.json to include your NPM username.\n\n' +
          `You might want to search-and-replace the entire project with "${env.pkg.name}" as the query.`,
      )
    }

    try {
      const { stdout } = await execa('git', ['status', '--porcelain'], {
        cwd: env.root,
      })
      if (stdout.trim() !== '') {
        fatal(
          'There are uncommitted changes in the repository. Please commit or stash them first.',
        )
      }
    } catch (error) {
      fatal(`Failed to check git status: ${error}`)
    }
  }

  // Run pnpm build
  if (env.pkg.scripts?.build) {
    await rimraf(env.outDir)
    await execa('pnpm', ['build'], {
      cwd: env.root,
      stdio: 'inherit',
      env: {
        RADASHI_OUT_DIR: join(env.outDir, 'dist'),
      },
    })
  }

  if (!env.pkg.name) {
    fatal(
      `Missing "name" field in ${cwdRelative(join(env.root, 'package.json'))}`,
    )
  }

  let needBump = false

  // Check if the current package version is already published
  const { stdout, exitCode, stderr } = await execa(
    'npm',
    ['view', env.pkg.name!, 'version'],
    {
      cwd: env.root,
      reject: false,
    },
  )

  if (exitCode === 0) {
    const publishedVersion = stdout.trim()

    if (publishedVersion === env.pkg.version) {
      needBump = true
      info(
        `Version ${env.pkg.version} is already published. Please bump the version before publishing.`,
      )
    }
  } else if (exitCode === 1 && stderr.includes('npm ERR! 404')) {
    // Package not found on npm, this might be the first publication
  } else {
    fatal(`Failed to check npm version: ${stderr}`)
  }

  if (needBump) {
    const bumpp = resolveDependency('bumpp', import.meta.url)
    const bumppBin = join(bumpp, 'bin/bumpp.js')

    console.log('')
    const { exitCode } = await execa('node', [bumppBin], {
      cwd: env.root,
      stdio: 'inherit',
      reject: false,
    })
    if (exitCode !== 0) {
      process.exit(exitCode)
    }

    // Reload env.pkg after bumping
    env.pkg = JSON.parse(await readFile(join(env.root, 'package.json'), 'utf8'))
  }

  const distPackageJson = omit(env.pkg, [
    'private',
    'scripts',
    'devDependencies',
  ])

  const exports = (distPackageJson.exports as Record<string, any>)['.']

  if (!env.config.formats.includes('esm')) {
    if (exports) {
      exports.default = exports.require
      delete exports.require
    }
    delete distPackageJson.module
  }

  if (!env.config.formats.includes('cjs')) {
    if (exports) {
      delete exports.require
    }
    distPackageJson.main = distPackageJson.module
    delete distPackageJson.module
  }

  await writeFile(
    join(env.outDir, 'package.json'),
    JSON.stringify(distPackageJson, null, 2),
  )

  info(
    flags.dryRun
      ? '\nWould publish to NPM (dry run)\n'
      : '\nPublishing to NPM\n',
  )

  // Publish to NPM
  await execa(
    'pnpm',
    [
      'publish',
      ...(flags.dryRun ? ['--dry-run'] : []),
      ...(flags.debug ? ['--no-git-checks'] : []),
    ],
    {
      cwd: env.outDir,
      stdio: 'inherit',
    },
  )

  if (flags.dryRun) {
    info('\nDry run complete. No changes were published.')
  } else {
    info('\nReverting ./dist/ to original state.')
    // Move files from {outDir}/dist into {outDir}
    const tmpDir = env.outDir + '-tmp'
    await rename(join(env.outDir, 'dist'), tmpDir)
    await rimraf(env.outDir)
    await rename(tmpDir, env.outDir)
    info('Reverted.')
  }
}

function resolveDependency(name: string, importer: string) {
  const require = Module.createRequire(importer)
  const entryPath = require.resolve(name)
  const entryPathArray = entryPath.split(sep)
  const lastNodeModulesIndex = entryPathArray.lastIndexOf('node_modules')
  return entryPathArray.slice(0, lastNodeModulesIndex + 2).join(sep)
}
