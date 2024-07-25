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
import { fatal, info } from './util/logger'
import { projectFolders } from './util/projectFolders'

export async function createPullRequest(flags: { breakingChange?: boolean }) {
  const env = getEnv()

  const currentBranch = await execa(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: env.root },
  ).then(({ stdout }) => stdout.trim())

  if (currentBranch === 'main') {
    fatal('Cannot create a PR from your main branch')
  }

  await cloneRadashi(env)

  await execa('git', ['checkout', '-b', currentBranch], {
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
    const { default: prompts } = await import('prompts')
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

  const remotes = await execa('git', ['remote', '-v'], {
    cwd: env.radashiDir,
  }).then(({ stdout }) =>
    stdout
      .trim()
      .split('\n')
      .map(line => line.split(/\s+/)),
  )

  console.log('remotes', remotes)

  const forkUrl = remotes.find(remote => remote[0] === 'fork')?.[1]
  if (!forkUrl) {
    const { default: prompts } = await import('prompts')

    const { forkUrl } = await prompts({
      type: 'text',
      name: 'forkUrl',
      message: 'Please enter the Git URL for your personal Radashi fork:',
      validate: value => {
        if (!value) return 'The URL cannot be empty'
        try {
          new URL(value)
        } catch {
          return 'Please enter a valid URL'
        }
        if (!value.includes('github.com'))
          return 'Please enter a valid GitHub URL'
        return true
      },
    })

    if (!forkUrl) {
      process.exit(0)
    }

    await execa('git', ['remote', 'add', 'pr', forkUrl], {
      cwd: env.radashiDir,
    })

    info(`Added 'pr' remote with URL: ${forkUrl}`)
  }

  // await execa(
  //   'gh',
  //   sift([
  //     'pr',
  //     'create',
  //     '--fill',
  //     '--web',
  //     flags.breakingChange && '--base=next',
  //   ]),
  //   {
  //     stdio: 'inherit',
  //     cwd: env.radashiDir,
  //   },
  // )
}
