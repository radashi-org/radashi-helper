import { join, relative } from 'node:path'
import { rimraf } from 'rimraf'
import { botCommit } from '../bot'
import { Env } from '../env'
import { findSources } from '../util/findSources'
import { getRadashiFuncPaths } from '../util/getRadashiFuncPaths'
import { isFileDirty } from '../util/isFileDirty'
import { info } from '../util/logger'
import { rewireDependents } from './rewireDependents'

export async function resetRewired(env: Env) {
  // Collect the function paths in the upstream Radashi repo.
  const radashiFuncPaths = await getRadashiFuncPaths(env)

  // Collect the files in the local "overrides" folder.
  const { overrides } = await findSources(env, ['overrides'])

  // Convert override file paths to function paths.
  const overrideFuncPaths = overrides.map(file => {
    return relative(env.overrideDir, file).replace(/\.ts$/, '')
  })

  // Clear the rewired state.
  await rimraf(join(env.root, 'overrides/rewired'))
  await rimraf(join(env.root, 'overrides/rewired.json'))

  // Rewire the dependents of each override function.
  for (const funcPath of overrideFuncPaths) {
    const funcName = funcPath.split('/').at(-1)!
    await rewireDependents(funcName, env, radashiFuncPaths)
  }

  // Commit the changes.
  const rewiredStatePath = 'overrides/rewired.json'
  if (await isFileDirty(join(env.root, rewiredStatePath))) {
    await botCommit('chore: update overrides/rewired.json', {
      cwd: env.root,
      add: [rewiredStatePath],
    })
  } else {
    info('The rewired functions were up-to-date, skipping commit.')
  }
}
