import path from 'path'

import execa from 'execa'
import fs from 'fs-extra'
import normalize from 'normalize-path'
import makeConsoleMock from 'consolemock'

import { execGit as execGitBase } from '../lib/execGit'

import {
  createTempDir,
  initializeRepo,
  readFile as readFileBase,
  appendFile as appendFileBase,
} from './utils/tempDir'

jest.unmock('execa')

let cwd, tmpDir

const globalConsoleTemp = console
const testJsFileUnfixable = `const obj = {
    'foo': 'bar'
`

// Wrap execGit to always pass `gitOps`
const execGit = async (args, options = {}) => execGitBase(args, { cwd, ...options })

const readFile = async (filename, dir = cwd) => readFileBase(filename, dir)
const appendFile = async (filename, content, dir = cwd) => appendFileBase(filename, content, dir)

const gitCommitWithExeca = async (options, args = ['-m test']) => {
  try {
    await execa('node', ['./tmp/bin/lint-staged.js', '--cwd', cwd])
  } catch (e) {
    throw new Error('lint-staged failed')
  }

  await execGit(['commit', ...args], { cwd, ...options })
}

describe('lint-staged', () => {
  beforeAll(() => {
    console = makeConsoleMock()
  })

  beforeEach(async () => {
    tmpDir = await createTempDir()
    cwd = normalize(tmpDir)
    await initializeRepo(cwd)
  })

  afterEach(async () => {
    console.clearHistory()
    await fs.remove(tmpDir)
  })

  afterAll(() => {
    console = globalConsoleTemp
  })

  it('is able to revert the git state even if pidtree throws an error', async () => {
    const pathTo = (relativePath) => {
      return path.join(__dirname, relativePath)
    }

    await fs.ensureDir(pathTo('../tmp'))
    await fs.copy(pathTo('../package.json'), pathTo('../tmp/package.json'))
    await fs.copy(pathTo('../bin'), pathTo('../tmp/bin'))
    await fs.copy(pathTo('../lib'), pathTo('../tmp/lib'))

    const changeLine = async (module, phrase, lineChangeCallback) => {
      const code = await fs.readFile(module, 'utf-8')
      await fs.writeFile(
        module,
        code
          .split('\n')
          .map((line) => (line.includes(phrase) ? lineChangeCallback(line) : line))
          .join('\n')
      )
    }

    await changeLine(
      pathTo('../tmp/lib/resolveTaskFn.js'),
      'await pidTree',
      () => 'throw new Error("some error")'
    )
    // Simulate slower machines where the process crashing could prevent the previous
    // state from being restored
    await changeLine(
      pathTo('../tmp/lib/gitWorkflow.js'),
      "execGit(['reset'",
      (line) => `await new Promise((resolve) => setTimeout(resolve, 500));` + line
    )

    // Add unfixable file to commit so `prettier --write` breaks
    await appendFile('test.js', testJsFileUnfixable)
    await appendFile('dummy', 'dummy')
    await appendFile(
      '.lintstagedrc.js',
      `
module.exports = {
  "*.js": "prettier --write",
  "dummy": () => "del dummy",
  "*.{js,ts}": () => "cmd /k cmd",
}
`
    )
    await execGit(['add', 'test.js', 'dummy'])
    const initialStatus = await execGit(['status'])

    await expect(gitCommitWithExeca()).rejects.toMatchInlineSnapshot(`[Error: lint-staged failed]`)

    // Something was wrong so the repo is returned to original state
    expect(await execGit(['status'])).toEqual(initialStatus)
    expect(await execGit(['rev-list', '--count', 'HEAD'])).toEqual('1')
    expect(await execGit(['log', '-1', '--pretty=%B'])).toMatch('initial commit')
    expect(await readFile('test.js')).toEqual(testJsFileUnfixable)

    await fs.remove(pathTo('../tmp'))
  })
})
