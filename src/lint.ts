import { execa } from 'execa'
import { getEnv } from './env'
import { dirname, relative } from 'path'

export async function lintBrowserCompatibility(files: string[]) {
  const context = getEnv()

  const dir = dirname(import.meta.url)
  const configFilePath = relative(dir, '../config/eslint.config.ts')
  console.log(configFilePath)

  const lintOutput = await execa(
    'pnpm',
    ['dlx', 'eslint@^9', '--no-eslintrc', '-c', configFilePath, ...files],
    {
      cwd: context.root,
      stdio: 'inherit',
    },
  )

  if (lintOutput.exitCode !== 0) {
    process.exit(lintOutput.exitCode)
  }
}
