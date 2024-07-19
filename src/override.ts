import glob from 'fast-glob'
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { select } from 'radashi'
import { getEnv } from './env'
import { cloneRadashi } from './util/cloneRadashi'
import { similarity } from './util/similarity'

export async function addOverride(query: string) {
  const env = getEnv()
  await cloneRadashi(env)

  const srcRoot = join(env.radashiDir, 'src')
  const srcFiles = select(
    await glob('**/*.ts', { cwd: srcRoot }),
    f => f.replace(/\.ts$/, ''),
    f => f.includes('/'),
  )

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
    throw new Error(`No source file named "${query}" was found in Radashi`)
  }

  let file: string
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
      file = selection
    }

    const { confirm } = await prompts({
      type: 'confirm',
      name: 'confirm',
      message: `Is "${file}" the function you want to copy?`,
      initial: true,
    })

    if (!confirm) {
      process.exit(1)
    }
  } else {
    file = bestMatches[0]
  }

  // The destination
  const overrideDir = join(env.root, 'overrides')

  // The sources
  const directories = [
    { name: 'src', extension: '.ts' },
    { name: 'docs', extension: '.mdx' },
    { name: 'benchmarks', extension: '.bench.ts' },
    { name: 'tests', extension: '.test.ts' },
  ]

  let copied = 0
  for (const dir of directories) {
    const success = await tryCopyFile(
      join(env.radashiDir, dir.name, file + dir.extension),
      join(overrideDir, dir.name, file + dir.extension),
    )
    if (success) {
      copied++
    }
  }

  console.log(`${copied} files copied.`)
}

async function tryCopyFile(src: string, dst: string) {
  console.log(`Copying ${src} to ${dst}`)
  if (existsSync(src)) {
    try {
      await mkdir(dirname(dst), { recursive: true })
      await copyFile(src, dst)
      return true
    } catch {}
  }
  return false
}
