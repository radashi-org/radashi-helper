import { execa } from 'execa'
import { cyan } from 'kleur/colors'
import { existsSync } from 'node:fs'
import { memo } from 'radashi'
import { Env } from '../env'

export const cloneRadashi = memo<[env: Env, branch?: string], Promise<void>>(
  async function cloneRadashi(env, branch = 'main') {
    if (existsSync(env.radashiDir)) {
      console.log(cyan('Updating radashi. Please wait...'))
      await execa('git', ['pull', 'origin', branch], {
        cwd: env.radashiDir,
        stdio: 'inherit',
      })
    } else {
      console.log(cyan('Cloning radashi. Please wait...'))
      await execa(
        'git',
        [
          'clone',
          'https://github.com/radashi-org/radashi.git',
          '--branch',
          branch,
          env.radashiDir,
        ],
        {
          stdio: 'inherit',
        },
      )
    }
  },
  {
    // Only run this function once per process.
    key: () => '',
  },
)
