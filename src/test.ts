import { execa } from 'execa'
import glob from 'fast-glob'
import { getEnv } from './env'

export async function startTestRunner(
  globs: string[],
  flags: Record<string, any>,
) {
  console.log('test', { globs, flags })

  const files = await glob(
    globs.map(glob => `src/**/${glob}*`),
    {
      cwd: process.cwd(),
    },
  )

  const extraArgs: string[] = []

  // If a single file was matched, only check coverage for that file.
  if (files.length === 1) {
    extraArgs.push('--coverage.include', files[0])
  }

  const env = getEnv()
  const args = [
    '-s',
    'vitest',
    '--coverage',
    ...globs,
    ...arrifyFlags(flags),
    ...extraArgs,
  ]

  console.log(['pnpm', ...args])

  await execa('pnpm', args, {
    cwd: env.root,
  })
}

function arrifyFlags(flags: Record<string, any>) {
  return Object.entries(flags).flatMap(([key, value]) => {
    if (key === '--') {
      return []
    }
    const name = value === false ? 'no-' + key : key
    const flag = name.length === 1 ? `-${name}` : `--${name}`
    return value === true ? [flag] : [flag, value]
  })
}
