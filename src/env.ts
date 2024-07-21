import escalade from 'escalade/sync'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { PackageJson } from 'type-fest'

/**
 * The config located at `./radashi.json`
 */
export interface UserConfig {
  /**
   * Whether to emit TypeScript declaration files.
   *
   * @default false
   */
  dts?: boolean
  /**
   * Control which bundle formats are used.
   *
   * @default ['esm']
   */
  formats?: ('esm' | 'cjs')[]
  /**
   * The directory to output the bundles to.
   *
   * @default 'dist'
   */
  outDir?: string
}

export interface Config extends Required<UserConfig> {}

export interface Env {
  pkg: PackageJson
  config: Config
  root: string
  radashiDir: string
  overrideDir: string
}

export function getEnv(root?: string | void): Env {
  root ??= escalade(process.cwd(), (dir, files) => {
    return files.includes('package.json') && dir
  })

  if (typeof root !== 'string') {
    throw Error('No package.json found in current directory or its parents')
  }

  const pkg = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8'),
  ) as PackageJson

  const radashiDir = join(root, '.radashi/upstream')
  const overrideDir = join(root, 'overrides')

  return {
    pkg,
    root,
    config: getConfig(root),
    radashiDir,
    overrideDir,
  }
}

function getConfig(root: string): Config {
  let config: UserConfig
  try {
    config = JSON.parse(
      readFileSync(join(root, 'radashi.json'), 'utf8'),
    ) as UserConfig
  } catch (error) {
    console.error('Error parsing radashi.json:', error)
    config = {} as UserConfig
  }
  return {
    dts: true,
    formats: ['esm'],
    branch: 'main',
    ...config,
    outDir: resolve(root, config.outDir ?? 'dist'),
  }
}
