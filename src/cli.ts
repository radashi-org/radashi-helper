import cac from 'cac'
import { dedent } from './util/dedent'

const app = cac('radashi')

app
  .command('functions add', 'Scaffold the files for a custom function')
  .option('--ai', 'Use AI to generate a first draft of the function')
  .action(async () => {})

app.command('override rm', 'Remove an override').action(async () => {})

app
  .command('override <query>', 'Add an override')
  .action(async (query: string) => {
    const { addOverride } = await import('./override')
    await addOverride(query)
  })

app
  .command('build')
  .option('--watch', 'Watch for changes')
  .option('--esm', 'Execute the ESM build only')
  .action(async flags => {
    const { default: build } = await import('./build')
    await build(flags)
  })

app.command('workflows add').action(async () => {
  // TODO
})

app.command('pr create').action(async () => {
  // const { createPullRequest } = await import('./pr-create')
  // createPullRequest()
})

app.command('lint [...files]').action(async files => {
  const { lintBrowserCompatibility } = await import('./lint')
  await lintBrowserCompatibility(files)
})

app.command('init').action(async () => {
  const envFile = `
    # Place your OpenAI, Deepseek, or Claude API keys here.
    # Then use the --ai flag when running \`pnpm functions add\`.
    OPENAI_API_KEY=""
    DEEPSEEK_API_KEY=""
    CLAUDE_API_KEY=""
  `
  const { writeFile } = await import('node:fs/promises')
  await writeFile('.env.development', dedent(envFile))
})

export function run(args: string[]) {
  if (args.length === 2) {
    app.outputHelp()
    process.exit(0)
  }
  app.parse(args, { run: true })
}
