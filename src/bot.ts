import { execa } from 'execa'
import { dedent } from './util/dedent'

const bot = {
  name: 'Radashi Bot',
  email: '175859458+radashi-bot@users.noreply.github.com',
}

export function formatBotCommit(message: string) {
  return `git commit -m "${message}" --author='${bot.name} <${bot.email}>'`
}

export async function botCommit(
  message: string,
  opts: { cwd: string; add: string[] },
): Promise<void> {
  const script = dedent`
    set -e
    git add ${opts.add.join(' ')}
    ${formatBotCommit(message)}
  `

  await execa('bash', ['-c', script], {
    cwd: opts.cwd,
    stdio: 'inherit',
  })
}
