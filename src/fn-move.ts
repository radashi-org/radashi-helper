import { yellow } from 'kleur/colors'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rename } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { objectify } from 'radashi'
import { rimraf } from 'rimraf'
import { getEnv } from './env'
import { cwdRelative } from './util/cwdRelative'
import { findSources } from './util/findSources'
import { getRadashiGroups } from './util/getRadashiGroups'
import { fatal, info } from './util/logger'
import { projectFolders } from './util/projectFolders'

export async function moveFunction(funcPath?: string) {
  const env = getEnv()

  if (!funcPath) {
    const pathsInside = await findSources(env, ['src', 'overrides'])

    console.log(pathsInside)

    const { src: sourceFuncs = [], overrides: overrideFuncs = [] } = objectify(
      Object.entries(pathsInside),
      ([type]) => type,
      ([type, sourcePaths]) => {
        const sourceRoot = join(
          type === 'src' ? env.root : env.overrideDir,
          'src',
        )
        const funcPaths = sourcePaths?.map(sourcePath =>
          relative(sourceRoot, sourcePath).replace(/\.ts$/, ''),
        )
        console.log({ type, sourceRoot, sourcePaths, funcPaths })
        return funcPaths
      },
    )

    console.log({ sourceFuncs, overrideFuncs })

    const { default: prompts } = await import('prompts')

    const { selectedFunc }: { selectedFunc: string } = await prompts({
      type: 'autocomplete',
      name: 'selectedFunc',
      message: 'Select a function to move:',
      choices: [...sourceFuncs, ...overrideFuncs].sort().map(funcPath => ({
        title: funcPath,
        value: funcPath,
      })),
    })

    if (!selectedFunc) {
      process.exit(0)
    }

    funcPath = selectedFunc
  }

  if (!existsSync(join(env.root, 'src', funcPath + '.ts'))) {
    fatal(`Function ${funcPath} was not found in ${env.root}/src`)
  }

  const { default: prompts } = await import('prompts')

  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: 'Move function to a new group', value: 'move' },
      { title: 'Rename function', value: 'rename' },
      { title: 'Both move and rename', value: 'both' },
    ],
  })

  if (!action) {
    process.exit(0)
  }

  const [prevGroup, prevFuncName] = funcPath.split('/')

  let [group, funcName] = [prevGroup, prevFuncName]

  if (action === 'move' || action === 'both') {
    const groups = await getRadashiGroups(env)
    const { selectedGroup }: { selectedGroup: string } = await prompts({
      type: 'autocomplete',
      name: 'selectedGroup',
      message: 'Select a group for the function:',
      choices: [
        { title: 'Create a new group', value: 'new' },
        ...groups.map(g => ({ title: g, value: g })),
      ],
    })
    if (!selectedGroup) {
      process.exit(0)
    }
    if (selectedGroup === 'new') {
      const { newGroup }: { newGroup: string } = await prompts({
        type: 'text',
        name: 'newGroup',
        message: 'Enter the new group name:',
      })
      if (!newGroup) {
        process.exit(0)
      }
      group = newGroup
    } else {
      group = selectedGroup
    }
  }

  if (action === 'rename' || action === 'both') {
    const { name }: { name: string } = await prompts({
      type: 'text',
      name: 'name',
      message: 'Enter the new function name:',
    })
    if (!name) {
      process.exit(0)
    }
    funcName = name
  }

  for (const folder of projectFolders) {
    const prevPath = join(
      env.root,
      folder.name,
      prevGroup,
      prevFuncName + folder.extension,
    )
    if (!existsSync(prevPath)) {
      continue
    }
    const dest = join(env.root, folder.name, group, funcName + folder.extension)
    if (existsSync(dest)) {
      const { overwrite }: { overwrite: boolean } = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `File ${cwdRelative(dest)} already exists. Do you want to overwrite it?`,
        initial: false,
      })
      if (overwrite == null) {
        process.exit(0)
      }
      if (!overwrite) {
        continue
      }
    }

    info(`Renaming ${cwdRelative(prevPath)} to ${cwdRelative(dest)}`)
    await mkdir(dirname(dest), { recursive: true })
    await rename(prevPath, dest)

    // Remove the directory if it's empty after moving the file
    const prevDir = dirname(prevPath)
    if ((await readdir(prevDir)).length === 0) {
      info(`Removing empty directory: ${cwdRelative(prevDir)}`)
      await rimraf(prevDir)
    }
  }

  console.log()
  console.log(
    yellow('ATTN') +
      'This command has only renamed the files.\n' +
      '     It didn‘t edit the codebase or commit the changes.',
  )
  console.log()
}
