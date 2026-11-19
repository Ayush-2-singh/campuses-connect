/**
 * The hidden test driver: what the student sees, and what the judge runs.
 *
 * These assertions pin the security-relevant split — the visible stub is only
 * the solution function, and the driver that reads hidden inputs exists only
 * in the string handed to the runner.
 */
import { describe, expect, it } from 'vitest'
import { CONTRACTS } from '@/lib/compete/contracts'
import { buildStarter, contractFromStarter, wrapForJudge } from '@/lib/compete/harness'

const twoSum = CONTRACTS['two-sum']
const reverse = CONTRACTS['reverse-string']
const median = CONTRACTS['median-two-sorted-arrays']
const merge = CONTRACTS['merge-intervals']

describe('visible starter code', () => {
  it('shows a python Solution method and nothing that reads stdin', () => {
    const stub = buildStarter('python', twoSum)
    expect(stub).toContain('class Solution:')
    expect(stub).toContain('def twoSum(self, nums: List[int], target: int) -> List[int]:')
    expect(stub).not.toContain('stdin')
    expect(stub).not.toContain('_ctc')
  })

  it('shows javascript, cpp and java signatures that match the contract', () => {
    const js = buildStarter('javascript', twoSum)
    expect(js).toContain('var twoSum = function (nums, target)')
    expect(js).not.toContain('readFileSync')

    const cpp = buildStarter('cpp', merge)
    expect(cpp).toContain('vector<vector<int>> merge(vector<vector<int>>& intervals)')
    expect(cpp).not.toContain('int main')

    const java = buildStarter('java', median)
    expect(java).toContain('public double findMedianSortedArrays(int[] nums1, int[] nums2)')
    expect(java).not.toContain('class Main')
  })
})

describe('wrapForJudge', () => {
  it('appends a python driver that reads the input and calls the entry point', () => {
    const program = wrapForJudge(
      'python',
      reverse,
      'class Solution:\n    def reverseString(self, s):\n        return s[::-1]'
    )
    expect(program).toContain('class Solution:')
    expect(program).toContain('_ctc_main()')
    expect(program).toContain('Solution().reverseString(*_args)')
    expect(program).toContain('_sys.stdin.read()')
  })

  it('appends a javascript driver with the right arity', () => {
    const program = wrapForJudge('javascript', twoSum, 'var twoSum = function (a, b) { return [0, 1]; };')
    expect(program).toContain('const _ctcA0 = _ctcList();')
    expect(program).toContain('const _ctcA1 = _ctcInt();')
    expect(program).toContain('twoSum(_ctcA0, _ctcA1)')
  })

  it('appends cpp and java drivers that read the matrix and print JSON', () => {
    const cpp = wrapForJudge(
      'cpp',
      merge,
      'class Solution { public: vector<vector<int>> merge(vector<vector<int>>& x) { return x; } };'
    )
    expect(cpp).toContain('#include <bits/stdc++.h>')
    expect(cpp).toContain('int main()')
    expect(cpp).toContain('ctc_harness::as_matrix(ctc_harness::read_line())')
    expect(cpp).toContain('Solution().merge(_ctcA0)')

    const java = wrapForJudge('java', merge, 'class Solution { public int[][] merge(int[][] x) { return x; } }')
    expect(java).toContain('class Main')
    expect(java).toContain('new Solution().merge(_ctcA0)')
    expect(java).toContain('readMatrix()')
  })

  it('formats booleans and floats the way the stored expected outputs are written', () => {
    const py = wrapForJudge('python', median, 'class Solution: pass')
    expect(py).toContain('return "true" if _value else "false"')
    expect(py).toContain('"%g" % _value')
  })
})

describe('contractFromStarter', () => {
  it('reads the contract written next to the starter code', () => {
    expect(contractFromStarter({ _meta: twoSum })).toEqual(twoSum)
  })

  it('returns null for legacy rows and malformed metadata', () => {
    expect(contractFromStarter({ python: 'print(1)' })).toBeNull()
    expect(contractFromStarter(null)).toBeNull()
    expect(contractFromStarter({ _meta: { entry: '', params: [] } })).toBeNull()
    expect(contractFromStarter({ _meta: { entry: 'x', params: [] } })).toBeNull()
  })
})
