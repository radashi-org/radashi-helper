import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defer } from 'radashi'
import { botCommit } from './bot'
import { Env, getEnv } from './env'
import { rewireDependents } from './rewired/rewireDependents'
import { assertRepoClean } from './util/assertRepoClean'
import { cloneRadashi } from './util/cloneRadashi'
import { cwdRelative } from './util/cwdRelative'
import { debug } from './util/debug'
import { getRadashiFuncPaths } from './util/getRadashiFuncPaths'
import { info } from './util/logger'
import { projectFolders } from './util/projectFolders'
import { queryFuncs } from './util/queryFuncs'

export async function addOverride(
  query: string,
  options: {
    exactMatch?: boolean
    fromBranch?: string
    env?: Env
  } = {},
) {
  const env = options.env ?? getEnv()
  await assertRepoClean(env.root)
  await cloneRadashi(env)

  let bestMatch: string
  let bestMatchName: string

  await defer(async defer => {
    if (options.fromBranch) {
      // Checkout the specified branch.
      await execa('git', ['checkout', options.fromBranch], {
        cwd: env.radashiDir,
        stdio: 'inherit',
      })

      // Checkout the previous branch when copying is done.
      defer(async () => {
        await execa('git', ['checkout', '-'], {
          cwd: env.radashiDir,
        })
      })
    }

    const funcPaths = await getRadashiFuncPaths(env)
    const { funcPath, funcName } = await queryFuncs(query, funcPaths, {
      exactMatch: options.exactMatch,
      message: 'Which function do you want to copy?',
      confirmMessage: 'Is "{funcPath}" the function you want to copy?',
    })

    bestMatch = funcPath
    bestMatchName = funcName

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

  const { default: build } = await import('./build')
  await build()

  console.log()

  // Commit the override to the current branch, using radashi-bot as
  // the author.
  await botCommit(`chore: override ${bestMatchName!}`, {
    cwd: env.root,
    add: ['package/mod.ts', 'overrides'],
  })
  info('\nOverride committed to the current branch.')
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
