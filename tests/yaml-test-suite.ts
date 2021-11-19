/* eslint-disable no-empty */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

import { CST, Document, Lexer, parseAllDocuments, Parser } from 'yaml'
// @ts-ignore
import { testEvents } from 'yaml/test-events'

const skip: Record<string, boolean | string[]> = {
  B63P: ['errors'], // allow ... after directives
  SF5V: ['errors'] // allow duplicate %YAML directives
}

function testJsonMatch(docs: Document[], json: string) {
  if (!json) return
  const received = docs[0] ? docs.map(doc => doc.toJS()) : null
  const expected =
    docs.length > 1
      ? json
          .replace(/\n$/, '')
          .split('\n')
          .map(line => JSON.parse(line))
      : [JSON.parse(json)]
  expect(received).toEqual(expected)
}

const testRoot = resolve(__dirname, 'yaml-test-suite')
const testDirs = readdirSync(testRoot).filter(dir => /^[A-Z0-9]{4}$/.test(dir))

for (const dir of testDirs) {
  const load = (filename: string) => {
    const path = resolve(testRoot, dir, filename)
    try {
      return readFileSync(path, 'utf8')
    } catch (_) {
      return ''
    }
  }
  const test_ = (name: string, cb: () => void) => {
    const sd = skip[dir]
    if (sd === true || (sd && sd.includes(name))) test.skip(name, cb)
    else test(name, cb)
  }

  const name = load('===').trim()
  describe(`${dir}: ${name}`, () => {
    const yaml = load('in.yaml')
    test('lexer completes', () => {
      let n = 0
      for (const lex of new Lexer().lex(yaml.replace(/(?<!\r)\n/g, '\r\n'))) {
        expect(typeof lex).toBe('string')
        if (++n === 9000) throw new Error('Lexer should produce fewer tokens')
      }
    })

    test('cst stringify', () => {
      let res = ''
      for (const tok of new Parser().parse(yaml)) res += CST.stringify(tok)
      expect(res).toBe(yaml)
    })

    const error = existsSync(resolve(testRoot, dir, 'error'))
    const events = error ? '' : load('test.event') // Too much variance in event stream length for error cases
    if (events) {
      test_('test.event', () => {
        const res = testEvents(yaml)
        const exp = events.replace(/\r\n/g, '\n')
        expect(res.events.join('\n') + '\n').toBe(exp)
        expect(res.error).toBeNull()
      })
    }

    describe('document parsing', () => {
      let docs: Document.Parsed[]
      beforeAll(() => {
        docs = parseAllDocuments(yaml, { resolveKnownTags: false })
      })

      const json = load('in.json')
      if (json) test_('in.json', () => testJsonMatch(docs, json))

      test_('errors', () => {
        let errors: Error[] = []
        for (const doc of docs) errors = errors.concat(doc.errors)
        if (error) {
          expect(errors).not.toHaveLength(0)
        } else {
          expect(errors).toHaveLength(0)
        }
      })

      if (!error) {
        if (json) {
          test_('stringfy+re-parse', () => {
            const src2 =
              docs.map(doc => String(doc).replace(/\n$/, '')).join('\n...\n') +
              '\n'
            const docs2 = parseAllDocuments(src2, { resolveKnownTags: false })
            testJsonMatch(docs2, json)
          })

          test('stringify+re-parse when preserving indentation', () => {
            const roundTripDocuments = parseAllDocuments(yaml, {
              resolveKnownTags: false,
              preserveCollectionIndentation: true
            })
            testJsonMatch(roundTripDocuments, json)

            const src2 =
              docs.map(doc => String(doc).replace(/\n$/, '')).join('\n...\n') +
              '\n'
            const docs2 = parseAllDocuments(src2, { resolveKnownTags: false })
            testJsonMatch(docs2, json)
          })
        }

        const outYaml = load('out.yaml')
        if (outYaml) {
          test_('out.yaml', () => {
            const resDocs = parseAllDocuments(yaml)
            const resJson = resDocs.map(doc => doc.toJS({ mapAsMap: true }))
            const expDocs = parseAllDocuments(outYaml)
            const expJson = expDocs.map(doc => doc.toJS({ mapAsMap: true }))
            expect(resJson).toEqual(expJson)
          })
        }
      }
    })
  })
}
