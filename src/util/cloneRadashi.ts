import { execa } from 'execa'
import { Env } from '../env'
import { existsSync } from 'node:fs'

export async function cloneRadashi(env: Env, branch = 'main') {
  if (existsSync(env.radashiDir)) {
    await execa('git', ['pull', 'origin', branch], {
      cwd: env.radashiDir,
    })
  } else {
    await execa('git', [
      'clone',
      'https://github.com/radashi-org/radashi.git',
      '--depth',
      '1',
      '--branch',
      branch,
      '--single-branch',
      env.radashiDir,
    ])
  }
}
