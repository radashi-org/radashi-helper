import cac from 'cac'
import { execaSync } from 'execa'
import { dedent } from './util/dedent'

const app = cac('radashi')

app
  .command('build', 'Compile and bundle the project, writing to the filesystem')
  .option('--watch', 'Watch for changes')
  .action(async flags => {
    const { default: build } = await import('./build')
    await build(flags)
  })

app.command('fn [subcommand]', 'Manage your functions').action(async () => {
  const fn = cac('radashi fn')

  fn.command('add <name>', 'Scaffold the files for a custom function').action(
    async (name: string) => {
      const { addFunction } = await import('./fn-add')
      await addFunction(name)
    },
  )

  fn.command('move [funcPath]', 'Rename a function‘s files')
    .example(
      bin =>
        dedent`
          # Rename "objectify" to "objectToArray"
          ${bin} move array/objectify objectToArray
        `,
    )
    .example(
      bin =>
        dedent`
          # Move "sum" to the array group.
          ${bin} move number/sum array/sum
        `,
    )
    .action(async (funcPath: string) => {
      const { moveFunction } = await import('./fn-move')
      await moveFunction(funcPath)
    })

  run(process.argv, fn, 1)
})

app
  .command('override [query]', 'Override a function from Radashi upstream')
  .option('-E, --exact-match', 'Only match exact function names')
  .action(async (query, flags) => {
    const { addOverride } = await import('./override')
    await addOverride(query, flags)
  })

app
  .command('pr [subcommand]', 'Create and import pull requests')
  .action(async () => {
    const pr = cac('radashi pr')

    pr.command(
      'create',
      'Create a radashi-org/radashi pull request from your current branch',
    )
      .option(
        '-b, --breaking-change',
        'Target the "next" branch instead of main',
      )
      .action(async flags => {
        const { createPullRequest } = await import('./pr-create')
        await createPullRequest(flags)
      })

    pr.command(
      'import <number>',
      'Copy files from a radashi-org/radashi pull request into your fork',
    ).action(async (prNumber: string) => {
      const { importPullRequest } = await import('./pr-import')
      await importPullRequest(prNumber)
    })

    run(process.argv, pr, 1)
  })

app
  .command('shipit', 'Publish your Radashi to NPM')
  .option('-n, --dry-run', 'Do not publish to NPM')
  .option('--debug', 'Ignore certain safety checks (implies --dry-run)')
  .action(async flags => {
    const { shipIt } = await import('./shipit')
    await shipIt(flags)
  })

app
  .command('open [query]', 'Open function files in your editor')
  .option('-s, --source', 'Open the source file')
  .option('-t, --test', 'Open the test file (and type tests)')
  .option('-T, --type-test', 'Open the type tests')
  .option('-b, --benchmark', 'Open the benchmark file')
  .option('-d, --docs', 'Open the documentation file')
  .option('-A, --all', 'Open all related files')
  .action(async (query, flags) => {
    // If the user specifies the all flag, open all related files.
    if (flags.all) {
      flags.source =
        flags.test =
        flags.typeTest =
        flags.benchmark =
        flags.docs =
          true
    }
    // If the user doesn't specify any flags, open the source file.
    else if (
      flags.test == null &&
      flags.typeTest == null &&
      flags.benchmark == null &&
      flags.docs == null
    ) {
      flags.source = true
    }
    // If the user specifies a test flag, we assume they want to open
    // the type test as well.
    else if (flags.typeTest == null) {
      flags.typeTest = flags.test
    }

    const { openFunction } = await import('./open')
    await openFunction(query, flags)
  })

app
  .command('lint [...files]', 'Check for browser compatibility issues')
  .allowUnknownOptions()
  .action(async files => {
    const { lint } = await import('./lint')
    await lint(files)
  })

app
  .command('format [...files]', 'Format files using Biome and Prettier')
  .action(async files => {
    const { format } = await import('./format')
    await format(files)
  })

const testCmd = app
  .command('test [...globs]', 'Run tests using Vitest')
  .allowUnknownOptions()
  .action(async (globs, flags) => {
    const { startTestRunner } = await import('./test')
    await startTestRunner(globs, flags)
  })

app.command('help', 'Walk through a tutorial').action(async () => {
  const { help } = await import('./help')
  help()
})

export function run(args: string[], program = app, offset = 0) {
  if (offset > 0) {
    args = args.slice()
    args.splice(2, offset)
  }
  if (args.length === 2) {
    program.outputHelp()
    process.exit(0)
  }
  program.help(sections => {
    if (args[2] === 'test') {
      execaSync('pnpm', ['-s', 'vitest', '--help'], { stdio: 'inherit' })
      return []
    }
    return sections
  })
  program.parse(args, { run: true })
}
