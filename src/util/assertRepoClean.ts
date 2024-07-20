import { isRepoClean } from './isRepoClean'

export async function assertRepoClean(cwd: string) {
  if (!(await isRepoClean(cwd))) {
    console.error(
      'Error: Your repository has uncommitted changes.' +
        ' Please commit or stash them before overriding.',
    )
    process.exit(1)
  }
}
