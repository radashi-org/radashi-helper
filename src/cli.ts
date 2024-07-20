import cac from 'cac'

const app = cac('radashi')

app
  .command('build')
  .option('--watch', 'Watch for changes')
  .action(async flags => {
    const { default: build } = await import('./build')
    await build(flags)
  })

app.command('fn <subcommand>').action(async () => {
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
  .command('override <query>', 'Add an override')
  .action(async (query: string) => {
    const { addOverride } = await import('./override')
    await addOverride(query)
  })

app.command('pr <subcommand>').action(async () => {
  const pr = cac('radashi pr')

  pr.command(
    'create',
    'Create a radashi-org/radashi pull request from your current branch',
  ).action(async () => {
    const { createPullRequest } = await import('./pr-create')
    createPullRequest()
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

app.command('lint [...files]').action(async files => {
  const { lint } = await import('./lint')
  await lint(files)
})

app.command('init').action(async () => {
  const { writeFile } = await import('node:fs/promises')
  const { dedent } = await import('./util/dedent')

  const envFile = `
    # Required for --ai flag.
    CLAUDE_API_KEY=""
  `

  await writeFile('.env.development', dedent(envFile))
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
  program.parse(args, { run: true })
}
