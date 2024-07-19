import { Plugin } from 'esbuild'
import glob from 'fast-glob'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { parseImportsExports as parse } from 'parse-imports-exports'
import { Env, getEnv } from '../env'
import { dedent } from '../util/dedent'

export function esbuildRadashi(options?: { root?: string; env?: Env }): Plugin {
  const env = options?.env ?? getEnv(options?.root)

  return {
    name: 'esbuild-radashi',
    setup(build) {
      build.onLoad({ filter: /\/mod\.ts$/, namespace: 'file' }, async args => {
        if (relative(env.root, args.path) === 'src/mod.ts') {
          const code = await generateUmbrella(env)
          await writeFile(args.path, code)

          return {
            loader: 'ts',
            contents: code,
          }
        }
      })
    },
  }
}

async function generateUmbrella(env: Env) {
  const sourceFiles = await glob(['src/**/*.ts', '!src/mod.ts'], {
    cwd: env.root,
    absolute: true,
  })

  const overrides = await glob('overrides/src/**/*.ts', {
    cwd: env.root,
    absolute: true,
  })

  function getExportedNames(file: string) {
    const fileContents = readFileSync(file, 'utf8')
    const parseResult = parse(fileContents)
    return Object.keys({
      ...parseResult.declarationExports,
      ...parseResult.interfaceExports,
      ...parseResult.namedExports,
      ...parseResult.typeExports,
    })
  }

  const namesBlocked = [...sourceFiles, ...overrides].flatMap(file => {
    return getExportedNames(file)
  })

  let code = printExports(
    join(env.root, 'node_modules/@radashi/core/dist/radashi.d.ts'),
    '@radashi/core',
    // Don't re-export names that were defined in the custom Radashi.
    exportName => !namesBlocked.includes(exportName),
  )

  function printExports(
    file: string,
    specifier = file,
    filter?: (exportName: string) => boolean,
  ) {
    const fileContents = readFileSync(file, 'utf8')
    const parseResult = parse(fileContents, {
      ignoreCommonJsExports: true,
    })
    const exportedTypeNames = Object.keys({
      ...parseResult.interfaceExports,
      ...parseResult.typeExports,
    })
    const exportedNames = Object.keys({
      ...parseResult.declarationExports,
      ...parseResult.namedExports,
    }).concat(exportedTypeNames)

    const forwarded = filter ? exportedNames.filter(filter) : exportedNames
    const exports = forwarded
      .map(name => (exportedTypeNames.includes(name) ? `type ${name}` : name))
      .join(', ')

    return `export { ${exports} } from '${specifier}'`
  }

  if (sourceFiles.length) {
    code += dedent`
      \n
      // Custom functions
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
      // Overrides
      ${overrides
        .map(file => {
          return printExports(file, relative(join(env.root, 'src'), file))
        })
        .join('\n')}
    `
  }

  return code + '\n'
}
