import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defer } from 'radashi'
import { botCommit } from './bot'
import { getEnv } from './env'
import { rewireDependents } from './rewired/rewireDependents'
import { assertRepoClean } from './util/assertRepoClean'
import { cloneRadashi } from './util/cloneRadashi'
import { cwdRelative } from './util/cwdRelative'
import { debug } from './util/debug'
import { getRadashiFuncPaths } from './util/getRadashiFuncPaths'
import { fatal, info } from './util/logger'
import { projectFolders } from './util/projectFolders'
import { similarity } from './util/similarity'

export async function addOverride(
  query: string,
  env = getEnv(),
  options: {
    exactMatch?: boolean
    fromBranch?: string
  } = {},
) {
  await assertRepoClean(env.root)
  await cloneRadashi(env)

  let bestMatch: string
  let bestMatchName: string

  await defer(async defer => {
    if (options.fromBranch) {
      // Checkout the specified branch.
      await execa('git', ['checkout', options.fromBranch], {
        cwd: env.radashiDir,
      })

      // Checkout the previous branch when copying is done.
      defer(async () => {
        await execa('git', ['checkout', '-'], {
          cwd: env.radashiDir,
        })
      })
    }

    const funcPaths = await getRadashiFuncPaths(env)

    if (options.exactMatch) {
      bestMatch = query
    } else {
      const loweredQuery = query.toLowerCase()
      const scores = funcPaths.map(funcPath => {
        const funcName = funcPath.split('/').at(-1)!
        return Math.min(
          similarity(loweredQuery, funcName.toLowerCase()),
          similarity(loweredQuery, funcPath.toLowerCase()),
        )
      })

      const bestScore = Math.min(...scores)
      const bestMatches = funcPaths.filter((_file, i) => {
        return scores[i] === bestScore
      })

      if (!bestMatches.length) {
        fatal(`No source file named "${query}" was found in Radashi`)
      }

      if (bestScore > 0) {
        const prompts = (await import('prompts')).default

        if (bestMatches.length > 1) {
          const { selection } = await prompts({
            type: 'select',
            name: 'selection',
            message: 'Which function do you want to copy?',
            choices: bestMatches.map(f => ({
              title: f,
              value: f,
            })),
          })
          if (!selection) {
            process.exit(1)
          }
          bestMatch = selection
        } else {
          bestMatch = bestMatches[0]
        }

        const { confirm } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message: `Is "${bestMatch}" the function you want to copy?`,
          initial: true,
        })

        if (!confirm) {
          process.exit(1)
        }
      } else {
        bestMatch = bestMatches[0]
      }
    }

    bestMatchName = bestMatch.split('/').at(-1)!

    let copied = 0

    async function override(file: string) {
      for (const folder of projectFolders) {
        const success = await tryCopyFile(
          join(env.radashiDir, folder.name, file + folder.extension),
          join(env.overrideDir, folder.name, file + folder.extension),
        )
        if (success) {
          copied++
        }
      }
    }

    await override(bestMatch)
    copied += (await rewireDependents(bestMatchName, env, funcPaths)).length

    console.log(`${copied} files copied.`)
  })

  // Commit the override to the current branch, using radashi-bot as
  // the author.
  await botCommit(`chore: override ${bestMatchName!}`, {
    cwd: env.root,
    add: ['overrides'],
  })
  info('\nOverride committed to the current branch.')

  const { default: build } = await import('./build')
  await build()
}

async function tryCopyFile(src: string, dst: string) {
  debug(`Copying ${cwdRelative(src)} to ${cwdRelative(dst)}`)
  if (existsSync(src)) {
    try {
      await mkdir(dirname(dst), { recursive: true })
      await copyFile(src, dst)
      return true
    } catch {}
  }
  return false
}
