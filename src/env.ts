import type { PackageJson } from 'type-fest'
import escalade from 'escalade/sync'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

export interface Env {
  pkg: PackageJson
  root: string
  radashiDir: string
}

export function getEnv(root?: string | void) {
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

  return { pkg, root, radashiDir }
}
