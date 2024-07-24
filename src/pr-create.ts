import { execa } from 'execa'
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { sift } from 'radashi'
import { getEnv } from './env'
import { cloneRadashi } from './util/cloneRadashi'
import { cwdRelative } from './util/cwdRelative'
import { debug } from './util/debug'
import { findSources } from './util/findSources'
import { projectFolders } from './util/projectFolders'

export async function createPullRequest(flags: { breakingChange?: boolean }) {
  const env = getEnv()

  await cloneRadashi(env)

  const { default: prompts } = await import('prompts')

  const { branchName } = await prompts({
    type: 'text',
    name: 'branchName',
    message: 'Enter a name for the new branch:',
  })

  if (!branchName) {
    process.exit(1)
  }

  await execa('git', ['checkout', '-b', branchName], {
    cwd: env.radashiDir,
  })

  const pathsInside = await findSources(env, ['src', 'overrides'])

  for (const [type, files] of Object.entries(pathsInside)) {
    if (!files) {
      continue
    }
    for (const file of files) {
      const funcPath = relative(env.root, file)
        .replace(/^(overrides\/)?src\//, '')
        .replace(/\.ts$/, '')

      for (const folder of projectFolders) {
        const inPath = join(
          type === 'src' ? env.root : env.overrideDir,
          folder.name,
          funcPath + folder.extension,
        )
        if (existsSync(inPath)) {
          const outPath = join(
            env.radashiDir,
            folder.name,
            funcPath + folder.extension,
          )
          debug(`Copying ${cwdRelative(inPath)} to ${cwdRelative(outPath)}`)
          await mkdir(join(env.radashiDir, dirname(outPath)), {
            recursive: true,
          })
          await copyFile(inPath, outPath)
        }
      }
    }
  }

  let breakingChange = flags.breakingChange
  if (breakingChange == null) {
    const { response }: { response: boolean } = await prompts({
      type: 'confirm',
      name: 'response',
      message: 'Is this a breaking change?',
    })
    if (response == null) {
      process.exit(0)
    }
    breakingChange = response
  }

  await execa(
    'gh',
    sift([
      'pr',
      'create',
      '--fill',
      '--web',
      flags.breakingChange && '--base=next',
    ]),
    {
      stdio: 'inherit',
      cwd: env.radashiDir,
    },
  )

  const forkUrl = await execa('git', ['remote', 'get-url', 'fork'], {
    cwd: env.radashiDir,
    reject: false,
  }).then(({ stdout }) => stdout.trim())

  if (!forkUrl) {
    const { forkUrl } = await prompts({
      type: 'text',
      name: 'forkUrl',
      message:
        'Please enter the Github user or organization name whose Radashi fork you have push privileges for:',
      validate: value => {
        if (!value) return 'The URL cannot be empty'
        return true
      },
    })

    if (!forkUrl) {
      process.exit(0)
    }

    await execa('git', ['remote', 'add', 'fork', forkUrl], {
      cwd: env.radashiDir,
    })
  }

  await execa('git', ['push', '-u', 'fork', branchName], {
    cwd: env.radashiDir,
    stdio: 'inherit',
  })
}
