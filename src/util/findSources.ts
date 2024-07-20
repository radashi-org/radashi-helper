import glob from 'fast-glob'
import { Env } from '../env'

const fileTypes = ['src', 'overrides', 'rewired'] as const

type FileType = (typeof fileTypes)[number]

export async function findSources<Only extends FileType = FileType>(
  env: Env,
  only?: Only[],
): Promise<{
  sourceFiles: 'src' extends Only ? string[] : undefined
  overrides: 'overrides' extends Only ? string[] : undefined
  rewired: 'rewired' extends Only ? string[] : undefined
}>

export async function findSources(
  env: Env,
  only?: FileType[],
): Promise<{
  sourceFiles: string[] | undefined
  overrides: string[] | undefined
  rewired: string[] | undefined
}> {
  const [sourceFiles, overrides, rewired] = await Promise.all([
    only?.includes('src') !== false
      ? glob(['src/**/*.ts', '!src/*.ts'], {
          cwd: env.root,
          absolute: true,
        })
      : undefined,
    only?.includes('overrides') !== false
      ? glob('overrides/src/**/*.ts', {
          cwd: env.root,
          absolute: true,
        })
      : undefined,
    only?.includes('rewired') !== false
      ? glob('overrides/rewired/**/*.ts', {
          cwd: env.root,
          absolute: true,
        })
      : undefined,
  ])

  return {
    sourceFiles,
    overrides,
    rewired,
  }
}
