import os from 'os'
import path from 'path'

import fs from 'fs-extra'

import { execGit } from '../../lib/execGit'

import { normalizeWindowsNewlines, isWindowsActions } from './crossPlatform'

const osTmpDir = fs.realpathSync(process.env.RUNNER_TEMP || os.tmpdir())

const ensureDir = async (inputPath) => fs.ensureDir(path.dirname(inputPath))

/**
 * Create temporary random directory and return its path
 * @returns {Promise<String>}
 */
export const createTempDir = async () => {
  const random = Date.now().toString(36) + Math.random().toString(36).substr(2)
  const dirname = path.resolve(osTmpDir, `lint-staged-${random}`)
  await fs.ensureDir(dirname)
  return dirname
}

export const initializeRepo = async (cwd) => {
  await execGit('init', { cwd })
  await execGit(['config', 'user.name', '"test"'], { cwd })
  await execGit(['config', 'user.email', '"test@test.com"'], { cwd })
  if (isWindowsActions()) await execGit(['config', 'core.autocrlf', 'input'], { cwd })
  await appendFile('README.md', '# Test\n', cwd)
  await execGit(['add', 'README.md'], { cwd })
  await execGit(['commit', '-m initial commit'], { cwd })
}

// Get file content, coercing Windows `\r\n` newlines to `\n`
export const readFile = async (filename, dir) => {
  const filepath = path.isAbsolute(filename) ? filename : path.join(dir, filename)
  const file = await fs.readFile(filepath, { encoding: 'utf-8' })
  return normalizeWindowsNewlines(file)
}

// Append to file, creating if it doesn't exist
export const appendFile = async (filename, content, dir) => {
  const filepath = path.isAbsolute(filename) ? filename : path.join(dir, filename)
  await ensureDir(filepath)
  await fs.appendFile(filepath, content)
}

// Write (over) file, creating if it doesn't exist
export const writeFile = async (filename, content, dir) => {
  const filepath = path.isAbsolute(filename) ? filename : path.join(dir, filename)
  await ensureDir(filepath)
  await fs.writeFile(filepath, content)
}
