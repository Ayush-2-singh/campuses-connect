import { describe, expect, it } from 'vitest'
import {
  CSV_TEMPLATE,
  JSON_TEMPLATE,
  csvToPreview,
  jsonToPreview,
  parseCorrectIndexes,
  parseCsv,
  parseImportFile,
  validRows,
  validateDraft,
  type DraftQuestion,
} from '@/lib/liveBattle/questionImport'

const draft = (over: Partial<DraftQuestion> = {}): DraftQuestion => ({
  question: 'Which data structure is used for BFS?',
  options: [
    { text: 'Stack', correct: false },
    { text: 'Queue', correct: true },
  ],
  explanation: '',
  difficulty: 'easy',
  subject: 'DSA',
  topic: null,
  tags: [],
  marks: 100,
  timeLimit: 20,
  type: 'single',
  imageUrl: null,
  ...over,
})

describe('parseCsv', () => {
  it('keeps commas and newlines inside quoted fields', () => {
    const rows = parseCsv('a,b\n"has, comma","line\nbreak"\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['has, comma', 'line\nbreak'],
    ])
  })

  it('unescapes doubled quotes and drops a BOM', () => {
    const rows = parseCsv('\uFEFFq\n"say ""hi"""\n')
    expect(rows).toEqual([['q'], ['say "hi"']])
  })
})

describe('parseCorrectIndexes', () => {
  const texts = ['A text', 'B text', 'C text', 'D text']
  it('reads letters', () => {
    expect(parseCorrectIndexes('B', texts)).toEqual([1])
    expect(parseCorrectIndexes('A; C', texts)).toEqual([0, 2])
  })
  it('reads 1-based numbers', () => {
    expect(parseCorrectIndexes('2,3', texts)).toEqual([1, 2])
  })
  it('reads the option text', () => {
    expect(parseCorrectIndexes('b text', texts)).toEqual([1])
  })
  it('returns null when nothing matches', () => {
    expect(parseCorrectIndexes('E', texts)).toBeNull()
  })
})

describe('validateDraft', () => {
  it('accepts a well-formed question', () => {
    expect(validateDraft(draft())).toEqual([])
  })

  it('rejects a question with no correct option', () => {
    const errors = validateDraft(
      draft({
        options: [
          { text: 'A', correct: false },
          { text: 'B', correct: false },
        ],
      })
    )
    expect(errors).toContain('no correct answer marked')
  })

  it('rejects two correct options on a single-answer question', () => {
    const errors = validateDraft(
      draft({
        options: [
          { text: 'A', correct: true },
          { text: 'B', correct: true },
        ],
      })
    )
    expect(errors).toContain('single-answer question has more than one correct option')
  })

  it('requires exactly two options and one answer for true/false', () => {
    const errors = validateDraft(
      draft({
        type: 'true_false',
        options: [
          { text: 'True', correct: true },
          { text: 'False', correct: false },
          { text: 'Maybe', correct: false },
        ],
      })
    )
    expect(errors).toContain('true/false needs exactly two options')
  })

  it('rejects out-of-range marks and time limits', () => {
    const errors = validateDraft(draft({ marks: 5000, timeLimit: 1 }))
    expect(errors.some((e) => e.startsWith('marks must be'))).toBe(true)
    expect(errors.some((e) => e.startsWith('time limit must be'))).toBe(true)
  })
})

describe('csvToPreview', () => {
  it('parses the shipped template into importable rows', () => {
    const preview = csvToPreview(CSV_TEMPLATE)
    expect(preview.fileError).toBeNull()
    expect(preview.rows).toHaveLength(3)
    expect(preview.rows.every((r) => r.errors.length === 0)).toBe(true)

    const [bfs, sorts, tf] = preview.rows.map((r) => r.draft)
    expect(bfs.options[1].correct).toBe(true)
    expect(sorts.type).toBe('multiple')
    expect(sorts.options.filter((o) => o.correct)).toHaveLength(2)
    expect(tf.type).toBe('true_false')
    expect(tf.options).toHaveLength(2)
    expect(tf.timeLimit).toBe(15)
  })

  it('reports the spreadsheet row number for a bad answer column', () => {
    const csv = 'question,option_a,option_b,correct\n"What is 2+2?","3","4","Z"\n'
    const preview = csvToPreview(csv)
    expect(preview.rows[0].row).toBe(2)
    expect(preview.rows[0].errors[0]).toMatch(/correct answer could not be read/)
  })

  it('rejects a file without the required header columns', () => {
    const preview = csvToPreview('foo,bar\n1,2\n')
    expect(preview.fileError).toMatch(/header row/)
  })

  it('flags an empty file', () => {
    expect(csvToPreview('   ').fileError).toBe('The file is empty.')
  })

  it('defaults subject/marks/time when the columns are absent', () => {
    const preview = csvToPreview('question,option_a,option_b,correct\n"Pick one","x","y","B"\n')
    const row = preview.rows[0].draft
    expect(row.subject).toBe('General')
    expect(row.marks).toBe(100)
    expect(row.timeLimit).toBe(20)
    expect(row.difficulty).toBe('medium')
  })
})

describe('jsonToPreview', () => {
  it('parses the shipped template', () => {
    const preview = jsonToPreview(JSON_TEMPLATE)
    expect(preview.fileError).toBeNull()
    expect(preview.rows).toHaveLength(2)
    expect(preview.rows[0].draft.options[1].correct).toBe(true)
    expect(preview.rows[1].draft.type).toBe('true_false')
  })

  it('accepts { questions: [...] } and string options, with 0-based indexes', () => {
    const preview = jsonToPreview(
      JSON.stringify({ questions: [{ question: 'Pick B', options: ['A', 'B'], correct: [1] }] })
    )
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0].draft.options[1].correct).toBe(true)
    expect(preview.rows[0].errors).toEqual([])
  })

  it('supports flags on option objects', () => {
    const preview = jsonToPreview(
      JSON.stringify([
        {
          question: 'Pick A',
          options: [
            { text: 'A', correct: true },
            { text: 'B', correct: false },
          ],
        },
      ])
    )
    expect(preview.rows[0].draft.options[0].correct).toBe(true)
  })

  it('reports invalid JSON instead of throwing', () => {
    const preview = jsonToPreview('{ not json')
    expect(preview.fileError).toMatch(/not valid JSON/)
  })

  it('rejects a payload that is neither an array nor a questions object', () => {
    expect(jsonToPreview('{"a":1}').fileError).toMatch(/Expected an array/)
  })

  it('keeps invalid rows in the preview with their errors', () => {
    const preview = jsonToPreview(JSON.stringify([{ question: 'Too short?', options: ['A'], correct: [0] }]))
    expect(preview.rows[0].errors.length).toBeGreaterThan(0)
    expect(validRows(preview)).toHaveLength(0)
  })
})

describe('parseImportFile', () => {
  it('detects JSON by extension and by content', () => {
    expect(parseImportFile('bank.json', '[]').fileError).toBe('The file contains no questions.')
    expect(parseImportFile('bank.csv', JSON_TEMPLATE).rows).toHaveLength(2)
  })

  it('clamps marks and time into the database range', () => {
    const preview = csvToPreview(
      'question,option_a,option_b,correct,marks,time_limit\n"What is 2+2?","a","b","A",9999,1\n'
    )
    const row = preview.rows[0].draft
    expect(row.marks).toBe(1000)
    expect(row.timeLimit).toBe(5)
    expect(preview.rows[0].errors).toEqual([])
  })

  it('drops a non-http image reference rather than importing a broken one', () => {
    const preview = csvToPreview(
      'question,option_a,option_b,correct,image_url\n"Q?","a","b","A","javascript:alert(1)"\n'
    )
    expect(preview.rows[0].draft.imageUrl).toBeNull()
  })
})
