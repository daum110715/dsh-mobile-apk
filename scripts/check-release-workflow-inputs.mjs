#!/usr/bin/env node
/**
 * Guard release workflow scripts against direct dispatch-expression interpolation.
 *
 * GitHub expands expressions before bash parses the script, so a value such as
 * `0.14.8"; echo INJECTED; "` would become executable syntax. User inputs must
 * arrive through `env:` and be referenced as quoted shell variables.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const WORKFLOW = fileURLToPath(new URL('../.github/workflows/release.yml', import.meta.url))

/** @param {string} text @returns {string[]} offending lines */
export function directVersionInterpolations(text) {
  return text.split(/\r?\n/).flatMap((line, index) =>
    /\$\{\{\s*inputs\.version\s*\}\}/.test(line)
      && !/^\s*(?:name|path):/.test(line)
      && !/^\s*VERSION:\s*\$\{\{\s*inputs\.version\s*\}\}\s*$/.test(line)
      ? [String(index + 1) + ': ' + line.trim()]
      : [])
}

/** @param {string} text @returns {boolean} */
export function hasSafeEnvHandoff(text) {
  return /env:\s*\n\s+VERSION:\s*\$\{\{\s*inputs\.version\s*\}\}/.test(text)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = readFileSync(WORKFLOW, 'utf8')
  const offenders = directVersionInterpolations(source)
  if (offenders.length > 0 || !hasSafeEnvHandoff(source)) {
    console.error('release.yml 的 version 输入必须经 env 传递，不得直接内插到 shell：')
    for (const line of offenders) console.error('  ' + line)
    process.exit(1)
  }
  console.log('release workflow version input: env-only')
}
