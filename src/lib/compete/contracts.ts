// ═══════════════════════════════════════════════════════════════════════════
// Function contracts for the "LeetCode-style" workspace.
//
// Problems are graded by calling a single function rather than by reading
// stdin. Each problem declares its entry point, parameter types, return type
// and parameter names; `harness.ts` turns that into a per-language driver that
// is appended to the student's code **on the server** and never sent to the
// browser. The visible starter code is only the function stub.
//
// Type vocabulary (deliberately small — enough for the seeded problems):
//   int          one integer line
//   string       one raw line, spaces preserved
//   int_list     a line of comma-separated integers or a JSON array
//   int_matrix   a JSON array of arrays, e.g. [[1,3],[2,6]]
// ═══════════════════════════════════════════════════════════════════════════

export type ParamType = 'int' | 'string' | 'int_list' | 'int_matrix'
export type ReturnType = 'int' | 'bool' | 'string' | 'float' | 'int_list' | 'int_matrix'

export type JudgeContract = {
  /** Function/method the hidden driver calls. */
  entry: string
  /** Parameter types, in call order. */
  params: ParamType[]
  /** Parameter names, same order — used only to generate readable stubs. */
  names: string[]
  returns: ReturnType
}

export const CONTRACTS: Record<string, JudgeContract> = {
  'two-sum': { entry: 'twoSum', params: ['int_list', 'int'], names: ['nums', 'target'], returns: 'int_list' },
  'valid-parentheses': { entry: 'isValid', params: ['string'], names: ['s'], returns: 'bool' },
  'max-subarray': { entry: 'maxSubArray', params: ['int_list'], names: ['nums'], returns: 'int' },
  'reverse-string': { entry: 'reverseString', params: ['string'], names: ['s'], returns: 'string' },
  'palindrome-check': { entry: 'isPalindrome', params: ['string'], names: ['s'], returns: 'bool' },
  'count-vowels': { entry: 'countVowels', params: ['string'], names: ['s'], returns: 'int' },
  'second-largest': { entry: 'secondLargest', params: ['int_list'], names: ['nums'], returns: 'int' },
  'contains-duplicate': { entry: 'containsDuplicate', params: ['int_list'], names: ['nums'], returns: 'bool' },
  'climb-stairs': { entry: 'climbStairs', params: ['int'], names: ['n'], returns: 'int' },
  'single-number': { entry: 'singleNumber', params: ['int_list'], names: ['nums'], returns: 'int' },
  'roman-to-integer': { entry: 'romanToInt', params: ['string'], names: ['s'], returns: 'int' },
  'longest-substring': {
    entry: 'lengthOfLongestSubstring',
    params: ['string'],
    names: ['s'],
    returns: 'int',
  },
  'product-except-self': {
    entry: 'productExceptSelf',
    params: ['int_list'],
    names: ['nums'],
    returns: 'int_list',
  },
  'kth-largest': { entry: 'findKthLargest', params: ['int_list', 'int'], names: ['nums', 'k'], returns: 'int' },
  'coin-change': { entry: 'coinChange', params: ['int_list', 'int'], names: ['coins', 'amount'], returns: 'int' },
  'merge-intervals': { entry: 'merge', params: ['int_matrix'], names: ['intervals'], returns: 'int_matrix' },
  'valid-anagram': { entry: 'isAnagram', params: ['string', 'string'], names: ['s', 't'], returns: 'bool' },
  'rotate-array': { entry: 'rotate', params: ['int_list', 'int'], names: ['nums', 'k'], returns: 'int_list' },
  'longest-increasing-subsequence': {
    entry: 'lengthOfLIS',
    params: ['int_list'],
    names: ['nums'],
    returns: 'int',
  },
  'trapping-rain-water': { entry: 'trap', params: ['int_list'], names: ['height'], returns: 'int' },
  'median-two-sorted-arrays': {
    entry: 'findMedianSortedArrays',
    params: ['int_list', 'int_list'],
    names: ['nums1', 'nums2'],
    returns: 'float',
  },
  'edit-distance': { entry: 'minDistance', params: ['string', 'string'], names: ['word1', 'word2'], returns: 'int' },
  'n-queens-count': { entry: 'totalNQueens', params: ['int'], names: ['n'], returns: 'int' },
}

/** Problems seeded before the function contract existed keep stdin/stdout. */
export function contractForSlug(slug: string | null | undefined): JudgeContract | null {
  if (!slug) return null
  return CONTRACTS[slug] ?? null
}
