import cac from 'cac'

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

  run(process.argv, fn, 1)
})

app
  .command('override <query>', 'Override a function from Radashi upstream')
  .action(async (query: string) => {
    const { addOverride } = await import('./override')
    await addOverride(query)
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
        createPullRequest(flags)
      })

    pr.command(
      'import <number>',
      'Copy files from a radashi-org/radashi pull request into your fork',
    ).action(async (prNumber: string) => {
      const { importPullRequest } = await import('./pr-import')
      importPullRequest(prNumber)
    })

    run(process.argv, pr, 1)
  })

app
  .command('lint [...files]', 'Check for browser compatibility issues')
  .action(async files => {
    const { lint } = await import('./lint')
    await lint(files)
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
  program.help()
  program.parse(args, { run: true })
}
