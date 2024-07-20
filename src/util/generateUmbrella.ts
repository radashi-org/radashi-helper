import { copyFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { Env } from '../env'
import { loadRewired } from '../rewired/loadRewired'
import { rewire } from '../rewired/rewire'
import { debug } from './debug'
import { dedent } from './dedent'
import { findSources } from './findSources'
import { getExportedNames } from './getExportedNames'

export async function generateUmbrella(env: Env) {
  // Update rewired files on every build.
  const prevRewired = await loadRewired(env)
  if (prevRewired.length) {
    debug(`Updating ${prevRewired.length} rewired files...`)
    await Promise.all(
      prevRewired.map(async funcPath => {
        await rewire(funcPath, env)
      }),
    )
    await copyFile(
      join(env.root, 'overrides/src/tsconfig.json'),
      join(env.root, 'overrides/rewired/tsconfig.json'),
    )
  }

  const { sourceFiles, overrides, rewired } = await findSources(env)

  const namesBlocked = [...sourceFiles, ...overrides, ...rewired].flatMap(
    file => {
      return getExportedNames(file)
    },
  )

  let code = printExports(
    join(env.root, 'node_modules/@radashi/core/dist/radashi.d.ts'),
    '@radashi/core',
    // Don't re-export names that were defined in the custom Radashi.
    exportName => !namesBlocked.includes(exportName),
  )

  if (sourceFiles.length) {
    code += dedent`
      \n
      // Our custom functions.
      ${sourceFiles
        .map(file => {
          return printExports(
            file,
            './' + relative(join(env.root, 'src'), file),
          )
        })
        .join('\n')}
    `
  }

  if (overrides.length) {
    code += dedent`
      \n
      // Our overrides.
      ${overrides
        .map(file => {
          return printExports(file, relative(join(env.root, 'src'), file))
        })
        .join('\n')}
    `
  }

  if (rewired.length) {
    code += dedent`
      \n
      // Rewired to use our overrides.
      ${rewired
        .map(file => {
          return printExports(file, relative(join(env.root, 'rewired'), file))
        })
        .join('\n')}
    `
  }

  return code + '\n'
}

function printExports(
  file: string,
  specifier = file,
  filter?: (exportName: string) => boolean,
) {
  const exportedTypeNames = getExportedNames(file, { types: 'only' })
  const exportedNames = getExportedNames(file)

  const forwarded = filter ? exportedNames.filter(filter) : exportedNames
  const exports = forwarded.map(name =>
    exportedTypeNames.includes(name) ? `type ${name}` : name,
  )

  return `export { ${exports.join(', ')} } from '${specifier}'`
}
