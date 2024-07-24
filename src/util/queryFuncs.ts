import { fatal } from './logger'
import { similarity } from './similarity'

export async function queryFuncs(
  query: string,
  funcPaths: string[],
  options: {
    exactMatch?: boolean
    message?: string
    confirmMessage?: string
  } = {},
) {
  let funcPath: string

  if (options.exactMatch) {
    funcPath = query
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
        const { selection }: { selection: string } = await prompts({
          type: 'autocomplete',
          name: 'selection',
          message: options.message || 'Select a function:',
          choices: bestMatches.map(f => ({
            title: f,
            value: f,
          })),
        })
        if (!selection) {
          process.exit(1)
        }
        funcPath = selection
      } else {
        funcPath = bestMatches[0]

        const { confirm }: { confirm: boolean } = await prompts({
          type: 'confirm',
          name: 'confirm',
          message:
            options.confirmMessage?.replace('{funcPath}', funcPath) ||
            `Is "${funcPath}" the function you wanted?`,
          initial: true,
        })

        if (!confirm) {
          process.exit(1)
        }
      }
    } else {
      funcPath = bestMatches[0]
    }
  }

  return {
    funcPath,
    funcName: funcPath.split('/').at(-1)!,
  }
}
