import { Env } from './env'

export async function sync(context: Env) {
  // Pull the latest changes from Radashi upstream.
  execa('git', ['pull', 'upstream', 'main'], {
    cwd: context.radashiDir,
  })
}
