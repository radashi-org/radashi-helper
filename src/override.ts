import { parse } from '@babel/parser'
import { execa } from 'execa'
import glob from 'fast-glob'
import { cyan } from 'kleur/colors'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { defer, flat, memo, select, traverse, unique } from 'radashi'
import { getEnv } from './env'
import { loadRewired } from './rewired/loadRewired'
import { rewire } from './rewired/rewire'
import { assertRepoClean } from './util/assertRepoClean'
import { cloneRadashi } from './util/cloneRadashi'
import { cwdRelative } from './util/cwdRelative'
import { debug } from './util/debug'
import { dedent } from './util/dedent'
import { isBabelNode } from './util/isBabelNode'
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

    const srcRoot = join(env.radashiDir, 'src')
    const srcFiles = select(
      await glob('**/*.ts', { cwd: srcRoot }),
      f => f.replace(/\.ts$/, ''),
      f => f.includes('/'),
    )

    if (options.exactMatch) {
      bestMatch = query
    } else {
      const loweredQuery = query.toLowerCase()
      const scores = srcFiles.map(file => {
        const fn = file.split('/').at(-1)!
        return Math.min(
          similarity(loweredQuery, fn.toLowerCase()),
          similarity(loweredQuery, file.toLowerCase()),
        )
      })

      const bestScore = Math.min(...scores)
      const bestMatches = srcFiles.filter((_file, i) => {
        return scores[i] === bestScore
      })

      if (!bestMatches.length) {
        console.error(
          `Error: No source file named "${query}" was found in Radashi`,
        )
        process.exit(1)
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

    const parseImports = memo((filename: string) => {
      const fileContents = readFileSync(filename, 'utf8')
      const parseResult = parse(fileContents, {
        plugins: [['typescript', { dts: false }]],
        sourceType: 'module',
        sourceFilename: filename,
      })

      const importedNames = new Set<string>()
      traverse(parseResult.program, (node, _key, _parent, context) => {
        if (isBabelNode(node)) {
          // Do not traverse past the top-level nodes.
          context.skip()

          // Add to names if this node is an import from "radashi"
          if (
            node.type === 'ImportDeclaration' &&
            node.source.value === 'radashi'
          ) {
            for (const specifier of node.specifiers) {
              importedNames.add(
                specifier.imported?.name ?? specifier.local.name,
              )
            }
          }
        }
      })

      return importedNames
    })

    // Get the "radashi" imports of every source file, so we can
    // determine if any functions rely on the override target. If they
    // do, they too will need an override.
    const findDependentFiles: (funcName: string, stack?: string[]) => string[] =
      memo(
        (funcName, stack = []) => {
          const selected = select(
            srcFiles,
            (srcFile: string): string[] | null => {
              const filename = join(env.radashiDir, 'src', srcFile + '.ts')
              const importedNames = parseImports(filename)

              if (importedNames.has(funcName)) {
                let dependents: string[] = []
                if (!stack.includes(srcFile)) {
                  stack.push(srcFile)
                  const srcFuncName = srcFile.split('/').at(-1)!
                  dependents = findDependentFiles(srcFuncName, stack)
                  stack.pop()
                }
                dependents.unshift(srcFile)
                return dependents
              }

              return null
            },
          )

          return unique(flat(selected))
        },
        {
          key: bestMatchName => bestMatchName,
        },
      )

    const prevRewired = await loadRewired(env)
    const dependentFiles = findDependentFiles(bestMatchName)
      .filter(file => {
        // Skip files that have already been rewired or overridden.
        return (
          !prevRewired.includes(file) &&
          !existsSync(join(env.overrideDir, 'src', file + '.ts'))
        )
      })
      .sort()

    async function override(file: string) {
      // The sources
      const directories = [
        { name: 'src', extension: '.ts' },
        { name: 'docs', extension: '.mdx' },
        { name: 'benchmarks', extension: '.bench.ts' },
        { name: 'tests', extension: '.test.ts' },
      ]

      for (const dir of directories) {
        const success = await tryCopyFile(
          join(env.radashiDir, dir.name, file + dir.extension),
          join(env.overrideDir, dir.name, file + dir.extension),
        )
        if (success) {
          copied++
        }
      }
    }

    await override(bestMatch)

    if (dependentFiles.length) {
      await writeFile(
        join(env.overrideDir, 'rewired.json'),
        JSON.stringify([...prevRewired, ...dependentFiles], null, 2),
      )
      await tryCopyFile(
        join(env.root, 'src/tsconfig.json'),
        join(env.root, 'overrides/rewired/tsconfig.json'),
      )
      for (const file of dependentFiles) {
        if (await rewire(file, env)) {
          copied++
        }
      }
    }

    console.log(`${copied} files copied.`)
  })

  // Commit the override to the current branch, using radashi-bot as
  // the author.
  const script = dedent`
    set -e
    git add overrides
    git commit -m "chore: override ${bestMatchName!}" --author='radashi-bot <175859458+radashi-bot@users.noreply.github.com>'
  `

  await execa('bash', ['-c', script], {
    cwd: env.root,
    stdio: 'inherit',
  })

  console.log(cyan('\nOverride committed to the current branch.'))

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
