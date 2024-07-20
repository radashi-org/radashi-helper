import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { memo } from 'radashi'
import { Env } from '../env'
import { isExactCommit } from './isExactCommit'
import { info } from './logger'

export const cloneRadashi = memo<[env: Env], Promise<void>>(
  async function cloneRadashi(env) {
    const { branch } = env.config

    if (existsSync(env.radashiDir)) {
      if (isExactCommit(branch)) {
        if (await isRepoInSync(branch, { cwd: env.radashiDir })) {
          return
        }
        info('Updating radashi. Please wait...')
        // In case the ref was not found, fetch the latest changes.
        await execa('git', ['fetch', 'origin'], {
          cwd: env.radashiDir,
          stdio: 'inherit',
        })
        await execa('git', ['checkout', branch], {
          cwd: env.radashiDir,
          stdio: 'inherit',
        })
      } else {
        info('Updating radashi. Please wait...')
        await execa('git', ['pull', 'origin', branch], {
          cwd: env.radashiDir,
          stdio: 'inherit',
        })
      }
    } else {
      info('Cloning radashi. Please wait...')
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

/**
 * Resolves to `true` if the repository is in sync with the given ref name.
 */
async function isRepoInSync(ref: string, opts: { cwd: string }) {
  try {
    const { stdout: refCommit } = await execa(
      'git',
      ['rev-parse', '--verify', ref],
      opts,
    )

    const { stdout: headCommit } = await execa(
      'git',
      ['rev-parse', 'HEAD'],
      opts,
    )

    return refCommit === headCommit
  } catch (error) {
    return false
  }
}
