import { relative } from 'node:path'
import { getEnv } from '../env'
import { generateUmbrella } from '../util/generateUmbrella'

export function vitestRadashi(): import('vite').Plugin {
  const env = getEnv()

  return {
    name: 'vitest-radashi',
    async load(id) {
      if (relative(env.root, id) === 'src/mod.ts') {
        const code = await generateUmbrella(env)
        return { code }
      }
    },
  }
}
