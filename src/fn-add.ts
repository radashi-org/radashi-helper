import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getEnv } from './env'
import { cloneRadashi } from './util/cloneRadashi'
import { dedent } from './util/dedent'
import { getRadashiGroups } from './util/getRadashiGroups'
import { fatal } from './util/logger'
import { openInEditor } from './util/openInEditor'

export async function addFunction(funcName: string) {
  if (funcName.includes('/')) {
    fatal('Function name cannot include slashes.')
  }

  const env = getEnv()
  await cloneRadashi(env)

  const groups = await getRadashiGroups(env)

  const { default: prompts } = await import('prompts')
  const { selectedGroup } = await prompts({
    type: 'autocomplete',
    name: 'selectedGroup',
    message: 'Select a group for the function:',
    choices: [
      { title: 'Create a new group', value: 'new' },
      ...groups.map(g => ({ title: g, value: g })),
    ],
  })

  let group: string
  if (selectedGroup === 'new') {
    const { newGroup } = await prompts({
      type: 'text',
      name: 'newGroup',
      message: 'Enter the name for the new group:',
    })

    group = newGroup as string
  } else {
    group = selectedGroup as string
  }

  if (!group || !funcName) {
    fatal('Invalid input format. Please use <group-name>/<function-name>')
  }

  const directories = {
    src: join(env.root, 'src', group),
    docs: join(env.root, 'docs', group),
    tests: join(env.root, 'tests', group),
    benchmarks: join(env.root, 'benchmarks', group),
  }

  const files = {
    src: join(directories.src, `${funcName}.ts`),
    docs: join(directories.docs, `${funcName}.mdx`),
    tests: join(directories.tests, `${funcName}.test.ts`),
    benchmarks: join(directories.benchmarks, `${funcName}.bench.ts`),
  }

  // Create docs file
  if (!existsSync(files.docs)) {
    const { default: prompts } = await import('prompts')
    const { description } = await prompts({
      type: 'text',
      name: 'description',
      message: `Enter a description for ${funcName}:`,
    })

    await createFile(files.docs, generateDocsContent(funcName, description))
  } else {
    console.warn(`Warning: ${files.docs} already exists. Skipping.`)
  }

  // Create other files
  await createFileIfNotExists(files.src, generateSrcContent(group, funcName))
  await createFileIfNotExists(files.tests, generateTestsContent(funcName))
  await createFileIfNotExists(
    files.benchmarks,
    generateBenchmarksContent(funcName),
  )

  // Open the new src file in editor.
  await openInEditor(files.src, env)

  // Update mod.ts
  const { default: build } = await import('./build')
  await build()
}

async function createFile(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, content)
}

async function createFileIfNotExists(
  file: string,
  content: string,
): Promise<void> {
  if (!existsSync(file)) {
    await createFile(file, content)
  } else {
    console.warn(`Warning: ${file} already exists. Skipping.`)
  }
}

function generateDocsContent(funcName: string, description: string): string {
  return dedent`
    ---
    title: ${funcName}
    description: ${description}
    ---

    ### Usage

    Does a thing. Returns a value.

    \`\`\`ts
    import * as _ from 'radashi'

    _.${funcName}()
    \`\`\`

  `
}

function generateSrcContent(group: string, funcName: string): string {
  return dedent`
    /**
      * Does a thing.
      *
      * @see https://radashi-org.github.io/reference/${group}/${funcName}
      * @example
      * \`\`\`ts
      * ${funcName}()
      * \`\`\`
      */
      export function ${funcName}(): void {}

  `
}

function generateTestsContent(funcName: string): string {
  return dedent`
    import * as _ from 'radashi'

    describe('${funcName}', () => {
      test('does a thing', () => {
        expect(_.${funcName}()).toBe(undefined)
      })
    })

  `
}

function generateBenchmarksContent(funcName: string): string {
  return dedent`
    import * as _ from 'radashi'
    import { bench } from 'vitest'

    describe('${funcName}', () => {
      bench('with no arguments', () => {
        _.${funcName}()
      })
    })

  `
}
