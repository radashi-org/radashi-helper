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

  const { sourceFiles, overrides } = await findSources(env, [
    'src',
    'overrides',
  ])

  for (const { files, type } of [
    { files: sourceFiles, type: 'src' },
    { files: overrides, type: 'overrides' },
  ]) {
    for (const file of files) {
      const funcPath = relative(env.root, file)
        .replace(/^(overrides\/)?src\//, '')
        .replace(/\.ts$/, '')

      for (const folder of projectFolders) {
        const inPath = join(
          env.root,
          type === 'overrides' ? 'overrides' : '',
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
}
