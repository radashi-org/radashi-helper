import { join, relative } from 'path'
import { sift } from 'radashi'
import { getEnv } from './env'
import { findSources } from './util/findSources'
import { queryFuncs } from './util/queryFuncs'

interface Flags {
  source?: boolean
  test?: boolean
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

  console.log({ sources, funcPath, funcName, flags })
}
