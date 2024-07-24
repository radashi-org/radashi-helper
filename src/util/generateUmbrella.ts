import { join, relative } from 'node:path'
import { flat } from 'radashi'
import { Env } from '../env'
import { updateRewired } from '../rewired/updateRewired'
import { dedent } from './dedent'
import { findSources } from './findSources'
import { getExportedNames } from './getExportedNames'

export async function generateUmbrella(env: Env) {
  // Update rewired files on every build.
  await updateRewired(env)

  const pathsInside = await findSources(env)
  const namesBlocked = flat(Object.values(pathsInside)).flatMap(sourcePath => {
    return getExportedNames(sourcePath)
  })

  let code = printExports(
    join(env.root, 'node_modules/radashi/dist/radashi.d.ts'),
    'radashi',
    // Don't re-export names that were defined in the custom Radashi.
    exportName => !namesBlocked.includes(exportName),
  )

  if (pathsInside.src.length) {
    code += dedent`
      \n
      // Our custom functions.
      ${pathsInside.src
        .map(file => {
          return printExports(file, './' + relative(env.root, file))
        })
        .join('\n')}
    `
  }

  if (pathsInside.overrides.length) {
    code += dedent`
      \n
      // Our overrides.
      ${pathsInside.overrides
        .map(file => {
          return printExports(file, './' + relative(env.root, file))
        })
        .join('\n')}
    `
  }

  if (pathsInside.rewired.length) {
    code += dedent`
      \n
      // Rewired to use our overrides.
      ${pathsInside.rewired
        .map(file => {
          return printExports(file, './' + relative(env.root, file))
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
