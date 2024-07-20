import { execa } from 'execa'
import { existsSync } from 'fs'
import { copyFile, mkdir } from 'fs/promises'
import globRegex from 'glob-regex'
import { yellow } from 'kleur/colors'
import { dirname, join, relative } from 'path'
import { objectify } from 'radashi'
import { getEnv } from './env'
import { addOverride } from './override'
import { undoRewire } from './rewired/undoRewire'
import { assertRepoClean } from './util/assertRepoClean'
import { checkCommand } from './util/checkCommand'
import { cloneRadashi } from './util/cloneRadashi'
import { debug } from './util/debug'
import { dedent } from './util/dedent'
import { findSources } from './util/findSources'
import { getExportedNames } from './util/getExportedNames'

export async function importPullRequest(prNumber: string) {
  if (Number.isNaN(+prNumber)) {
    console.error(`Error: Invalid PR number "${prNumber}"`)
    process.exit(1)
  }

  if (!(await checkCommand('gh'))) {
    console.error(
      dedent`
        Error: gh command is not installed.

        You can install it using Homebrew:
          brew install gh

        Or using the official website:
          https://cli.github.com/
      `,
    )
    process.exit(1)
  }

  const env = getEnv()

  await assertRepoClean(env.root)
  await cloneRadashi(env)

  // Checkout the PR.
  await execa('gh', ['pr', 'checkout', prNumber], {
    cwd: env.radashiDir,
    stdio: 'inherit',
  }).catch(error => {
    console.error(error.message)
    process.exit(1)
  })

  // Get the target branch of the PR.
  const targetBranch = await getTargetBranch({
    cwd: env.radashiDir,
  })

  // Rebase onto the upstream branch.
  await execa('git', ['rebase', targetBranch], {
    cwd: env.radashiDir,
    stdio: 'inherit',
  }).catch(error => {
    console.error(error.message)
    console.error(
      '\nError: Cannot import a PR if it cannot be rebased onto the upstream branch.',
    )
    // TODO: support resolving the rebase manually.
    process.exit(1)
  })

  // Determine which files were changed or added.
  const changes = await parseGitDiff(targetBranch, {
    cwd: env.radashiDir,
  })

  const paths = await findSources(env)
  const names = objectify(
    Object.entries(paths),
    ([name]) => name as keyof typeof paths,
    ([, files]) => files.flatMap(file => getExportedNames(file)),
  )

  // Sort source files first (for error messages).
  const srcGlob = globRegex('src/*/*.ts')
  changes.sort((a, b) => {
    return srcGlob.test(a.file) && !srcGlob.test(b.file)
      ? -1
      : srcGlob.test(b.file) && !srcGlob.test(a.file)
        ? 1
        : a.file.localeCompare(b.file)
  })

  const addedFiles: string[] = []
  const modifiedFiles: string[] = []

  debug(`Found ${changes.length} changed files in the PR:`)
  for (const change of changes) {
    debug(`    ${change.status} ${change.file}`)

    if (change.status === 'A') {
      addedFiles.push(change.file)

      if (change.file.startsWith('src/')) {
        const srcPath = join(env.root, change.file)
        if (names.sourceFiles.includes(srcPath)) {
          console.error(
            `Error: Cannot import PR. File named "${change.file}" is already a source file created by you.`,
          )
          process.exit(1)
        }
      }
    } else if (change.status === 'M') {
      modifiedFiles.push(change.file)

      if (change.file.startsWith('src/')) {
        const overridePath = join(
          env.root,
          change.file.replace('src/', 'overrides/src/'),
        )
        if (names.overrides.includes(overridePath)) {
          console.error(
            `Error: Cannot import PR. File named "${change.file}" already exists in the overrides folder.`,
          )
          process.exit(1)
        }

        const funcPath = relative(env.overrideDir, overridePath).slice(0, -3)
        const rewiredPath = overridePath.replace('/src/', '/rewired/')

        if (names.rewired.includes(rewiredPath)) {
          // Remove rewired files that were modified by the PR.
          await undoRewire(funcPath, env)
        }

        // Override the file before applying the PR modifications.
        await addOverride(funcPath, env, {
          exactMatch: true,
          fromBranch: targetBranch,
        })
      }
    }
  }

  for (const file of addedFiles) {
    debug(`Adding "${file}" to project`)
    await tryCopyFile(join(env.radashiDir, file), join(env.root, file))
  }
  for (const file of modifiedFiles) {
    debug(`Modifying "${file}" override in project`)
    await tryCopyFile(
      join(env.radashiDir, file),
      join(env.root, 'overrides', file),
    )
  }

  let prTitle = await execa(
    'gh',
    ['pr', 'view', '--json', 'title', '--jq', '.title'],
    { cwd: env.radashiDir },
  ).then(result => result.stdout.trim())

  const validTitleRE =
    /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^):]+\))?: /

  if (!validTitleRE.test(prTitle)) {
    console.log()
    console.log(
      yellow('ATTN'),
      'The PR title does not follow the Conventional Commits format.',
    )
    console.log('Please select the type of change this PR introduces:\n')

    const { default: prompts } = await import('prompts')
    const { type } = await prompts({
      type: 'select',
      name: 'type',
      message: 'Select the type of change:',
      choices: getConventionalCommitTypes(),
    })

    const { description } = await prompts({
      type: 'text',
      name: 'description',
      message: 'Enter a short description of the change:',
    })

    prTitle = `${type}: ${description}`
  }

  const commitScript = dedent`
    set -e
    git add -A
    git commit -m "${prTitle}"
    git push
  `
  await execa('bash', ['-c', commitScript], {
    cwd: env.root,
    stdio: 'inherit',
  })
}

async function tryCopyFile(src: string, dst: string) {
  if (existsSync(src)) {
    try {
      await mkdir(dirname(dst), { recursive: true })
      await copyFile(src, dst)
      return true
    } catch {}
  }
  return false
}

async function parseGitDiff(targetBranch: string, opts: { cwd: string }) {
  const { stdout: nameStatus } = await execa(
    'git',
    ['diff', targetBranch, '--name-status'],
    opts,
  )
  return nameStatus
    .trim()
    .split('\n')
    .map(line => {
      const [status, file] = line.split('\t')
      return { status, file }
    })
}

/**
 * Get the remote branch being targeted by the currently checked-out pull request.
 */
async function getTargetBranch(opts: { cwd: string }) {
  const { stdout: targetBranch } = await execa(
    'gh',
    ['pr', 'view', '--json', 'baseRefName', '--jq', '.baseRefName'],
    opts,
  )
  return targetBranch?.trim() ?? 'main'
}

function getConventionalCommitTypes() {
  return [
    {
      title: 'feat',
      description: 'A new feature',
      value: 'feat',
    },
    {
      title: 'fix',
      description: 'A bug fix',
      value: 'fix',
    },
    {
      title: 'docs',
      description: 'Documentation only changes',
      value: 'docs',
    },
    {
      title: 'style',
      description: 'Changes that do not affect the meaning of the code',
      value: 'style',
    },
    {
      title: 'refactor',
      description: 'A code change that neither fixes a bug nor adds a feature',
      value: 'refactor',
    },
    {
      title: 'perf',
      description: 'A code change that improves performance',
      value: 'perf',
    },
    {
      title: 'test',
      description: 'Adding missing tests or correcting existing tests',
      value: 'test',
    },
    {
      title: 'build',
      description:
        'Changes that affect the build system or external dependencies',
      value: 'build',
    },
    {
      title: 'ci',
      description: 'Changes to our CI configuration files and scripts',
      value: 'ci',
    },
    {
      title: 'chore',
      description: "Other changes that don't modify src or test files",
      value: 'chore',
    },
    {
      title: 'revert',
      description: 'Reverts a previous commit',
      value: 'revert',
    },
  ]
}
