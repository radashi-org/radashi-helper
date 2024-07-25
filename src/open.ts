import { existsSync } from 'fs'
import { join, relative } from 'path'
import { sift } from 'radashi'
import { getEnv } from './env'
import { cwdRelative } from './util/cwdRelative'
import { findSources } from './util/findSources'
import { info } from './util/logger'
import { openInEditor } from './util/openInEditor'
import { projectFolders } from './util/projectFolders'
import { queryFuncs } from './util/queryFuncs'

interface Flags {
  source?: boolean
  test?: boolean
  typeTest?: boolean
  benchmark?: boolean
  docs?: boolean
  all?: boolean
}

export async function openFunction(query: string = '', flags: Flags = {}) {
  const env = getEnv()

  const sources = await findSources(env, ['src', 'overrides'])
  const { funcPath, funcName } = await queryFuncs(
    query,
    sift(
      Object.entries(sources)
        .map(([type, paths]) => {
          const root = join(env.root, type === 'src' ? '' : type, 'src')
          return paths?.map(p => relative(root, p).replace(/\.ts$/, ''))
        })
        .flat(),
    ),
  )

  const targetFolders = flags.all
    ? projectFolders
    : projectFolders.filter(f => {
        return (
          (flags.source && f.name === 'src') ||
          (flags.test && f.extension === '.test.ts') ||
          (flags.typeTest && f.extension === '.test-d.ts') ||
          (flags.benchmark && f.name === 'benchmarks') ||
          (flags.docs && f.name === 'docs')
        )
      })

  let openedCount = 0
  for (const folder of targetFolders) {
    for (const overrideFolder of ['', 'overrides']) {
      const file = join(
        env.root,
        overrideFolder,
        folder.name,
        funcPath + folder.extension,
      )
      if (existsSync(file)) {
        await openInEditor(file, env)
        info(`\nOpening ${cwdRelative(file)}`)
        openedCount++
      }
    }
  }

  if (openedCount === 0) {
    info('\nNo files were found. Exiting.')
  }
}
