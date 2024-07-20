import glob from 'fast-glob'
import { Env } from '../env'

export async function findSources(env: Env) {
  const [sourceFiles, overrides, rewired] = await Promise.all([
    glob(['src/**/*.ts', '!src/*.ts'], {
      cwd: env.root,
      absolute: true,
    }),
    glob('overrides/src/**/*.ts', {
      cwd: env.root,
      absolute: true,
    }),
    glob('overrides/rewired/**/*.ts', {
      cwd: env.root,
      absolute: true,
    }),
  ])

  return {
    sourceFiles,
    overrides,
    rewired,
  }
}
