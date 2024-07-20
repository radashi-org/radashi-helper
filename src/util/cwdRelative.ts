import { relative } from 'node:path'

export function cwdRelative(path: string) {
  let result = relative(process.cwd(), path)
  if (!result.startsWith('..')) {
    result = `./${result}`
  }
  return result
}