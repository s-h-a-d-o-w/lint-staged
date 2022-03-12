import path from 'path'

import fs from 'fs-extra'

import { withGitIntegration } from './utils/gitIntegration'
import { prettierListDifferent } from './fixtures/configs'
import { prettyJS, uglyJS } from './fixtures/files'

jest.unmock('execa')
jest.setTimeout(20000)
jest.retryTimes(2)

describe('integration', () => {
  test(
    'does not resurrect removed files due to git bug when tasks pass',
    withGitIntegration(async ({ cwd, execGit, gitCommit, removeFile, writeFile }) => {
      await writeFile('.lintstagedrc.json', JSON.stringify(prettierListDifferent))

      await removeFile('README.md') // Remove file from previous commit
      await writeFile('test.js', prettyJS)
      await execGit(['add', 'test.js'])

      await gitCommit()

      expect(await fs.exists(path.join(cwd, 'README.md'))).toEqual(false)
    })
  )

  test(
    'does not resurrect removed files in complex case',
    withGitIntegration(async ({ cwd, execGit, gitCommit, readFile, removeFile, writeFile }) => {
      await writeFile('.lintstagedrc.json', JSON.stringify(prettierListDifferent))

      // Add file to index, and remove it from disk
      await writeFile('test.js', prettyJS)
      await execGit(['add', 'test.js'])
      await removeFile('test.js')

      // Rename file in index, and remove it from disk
      const readme = await readFile('README.md')
      await removeFile('README.md')
      await execGit(['add', 'README.md'])
      await writeFile('README_NEW.md', readme)
      await execGit(['add', 'README_NEW.md'])
      await removeFile('README_NEW.md')

      expect(await execGit(['status', '--porcelain'])).toMatchInlineSnapshot(`
        "RD README.md -> README_NEW.md
        AD test.js
        ?? .lintstagedrc.json"
      `)

      await gitCommit()

      expect(await execGit(['status', '--porcelain'])).toMatchInlineSnapshot(`
        " D README_NEW.md
         D test.js
        ?? .lintstagedrc.json"
      `)

      expect(await fs.exists(path.join(cwd, 'test.js'))).toEqual(false)
      expect(await fs.exists(path.join(cwd, 'README_NEW.md'))).toEqual(false)
    })
  )

  test(
    'does not resurrect removed files due to git bug when tasks fail',
    withGitIntegration(async ({ cwd, execGit, gitCommit, removeFile, writeFile }) => {
      await writeFile('.lintstagedrc.json', JSON.stringify(prettierListDifferent))

      await removeFile('README.md') // Remove file from previous commit
      await writeFile('test.js', uglyJS)
      await execGit(['add', 'test.js'])

      expect(await execGit(['status', '--porcelain'])).toMatchInlineSnapshot(`
        " D README.md
        A  test.js
        ?? .lintstagedrc.json"
      `)

      await expect(gitCommit({ lintStaged: ['--allow-empty'] })).rejects.toThrowError(
        'Reverting to original state because of errors...'
      )

      expect(await execGit(['status', '--porcelain'])).toMatchInlineSnapshot(`
        " D README.md
        A  test.js
        ?? .lintstagedrc.json"
      `)

      expect(await fs.exists(path.join(cwd, 'README.md'))).toEqual(false)
    })
  )
})
