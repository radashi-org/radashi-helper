import escalade from 'escalade/sync'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PackageJson } from 'type-fest'

// These config options don't have default values.
interface OptionalConfig {
  /**
   * The editor to use when opening a new function.
   */
  editor?: string
}

/**
 * The config located at `./radashi.json`
 */
export interface UserConfig extends OptionalConfig {
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
}

export interface Config
  extends Required<Omit<UserConfig, keyof OptionalConfig>>,
    OptionalConfig {}

export interface Env {
  pkg: PackageJson
  config: Config
  configPath: string
  root: string
  modPath: string
  outDir: string
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

  const [configPath, config] = getConfig(root)

  return {
    pkg,
    root,
    modPath: join(root, 'mod.ts'),
    config,
    configPath,
    outDir: join(root, 'dist'),
    radashiDir,
    overrideDir,
  }
}

function getConfig(root: string) {
  const configPath = join(root, 'radashi.json')

  let userConfig: UserConfig
  try {
    userConfig = JSON.parse(readFileSync(configPath, 'utf8')) as UserConfig
  } catch (error) {
    console.error('Error parsing radashi.json:', error)
    userConfig = {} as UserConfig
  }

  let editor = userConfig.editor?.replace(
    /^\$EDITOR$/,
    process.env.EDITOR ?? '',
  )
  if (editor === '!') {
    editor = ''
  }

  const userFormats = userConfig.formats?.filter(
    value => value === 'esm' || value === 'cjs',
  )

  const config: Config = {
    dts: true,
    ...userConfig,
    formats: userFormats && userFormats.length > 0 ? userFormats : ['esm'],
    editor: editor || undefined,
  }

  return [configPath, config] as const
}
