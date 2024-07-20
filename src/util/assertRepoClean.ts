import { isRepoClean } from './isRepoClean'
import { fatal } from './logger'

export async function assertRepoClean(cwd: string) {
  if (!(await isRepoClean(cwd))) {
    fatal(
      'Your repository has uncommitted changes.' +
        ' Please commit or stash them before overriding.',
    )
  }
}
