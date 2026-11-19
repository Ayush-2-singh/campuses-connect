// ═══════════════════════════════════════════════════════════════════════════
// "Most asked at FAANG" catalogue.
//
// Source: the community Google Sheet linked from the Compete page
// (130 questions, company-by-company interview counts).
//
// This is display data, not judge data: each row keeps the company counts so
// the UI can show how often a problem was asked, and `problemSlug` points at
// the in-house problem when the same task already exists here. Everything else
// opens on LeetCode, so the sheet stays useful without inventing test cases.
// ═══════════════════════════════════════════════════════════════════════════

export type TopAskedCompany = { name: string; count: number }

export type TopAskedProblem = {
  rank: number
  title: string
  topic: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  premium: boolean
  total: number
  companies: TopAskedCompany[]
  leetcodeUrl: string
  /** Slug of the matching in-house problem, when there is one. */
  problemSlug: string | null
}

export const TOP_ASKED_SOURCE =
  'https://docs.google.com/spreadsheets/d/1hzP8j7matoUiJ15N-RhsL5Dmig8_E3aP/edit?gid=1377915986'

export const TOP_ASKED: TopAskedProblem[] = [
  {
    rank: 1,
    title: 'Number of Islands',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 229,
    companies: [
      {
        name: 'Amazon',
        count: 115,
      },
      {
        name: 'Microsoft',
        count: 44,
      },
      {
        name: 'Bloomberg',
        count: 29,
      },
      {
        name: 'Facebook',
        count: 25,
      },
      {
        name: 'Google',
        count: 16,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/number-of-islands/',
    problemSlug: null,
  },
  {
    rank: 2,
    title: 'Two Sum',
    topic: 'Array',
    difficulty: 'Easy',
    premium: false,
    total: 225,
    companies: [
      {
        name: 'Amazon',
        count: 108,
      },
      {
        name: 'Apple',
        count: 43,
      },
      {
        name: 'Google',
        count: 39,
      },
      {
        name: 'Facebook',
        count: 22,
      },
      {
        name: 'Bloomberg',
        count: 13,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/two-sum/',
    problemSlug: 'two-sum',
  },
  {
    rank: 3,
    title: 'Merge Intervals',
    topic: 'Interval',
    difficulty: 'Medium',
    premium: false,
    total: 214,
    companies: [
      {
        name: 'Facebook',
        count: 87,
      },
      {
        name: 'Amazon',
        count: 57,
      },
      {
        name: 'Google',
        count: 31,
      },
      {
        name: 'Apple',
        count: 22,
      },
      {
        name: 'Microsoft',
        count: 17,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/merge-intervals/',
    problemSlug: 'merge-intervals',
  },
  {
    rank: 4,
    title: 'LRU Cache',
    topic: 'Design',
    difficulty: 'Medium',
    premium: false,
    total: 207,
    companies: [
      {
        name: 'Amazon',
        count: 102,
      },
      {
        name: 'Microsoft',
        count: 36,
      },
      {
        name: 'Facebook',
        count: 29,
      },
      {
        name: 'Apple',
        count: 29,
      },
      {
        name: 'Google',
        count: 11,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/lru-cache/',
    problemSlug: null,
  },
  {
    rank: 5,
    title: 'Minimum Remove to Make Valid Parentheses',
    topic: 'Stack',
    difficulty: 'Medium',
    premium: false,
    total: 161,
    companies: [
      {
        name: 'Facebook',
        count: 142,
      },
      {
        name: 'Amazon',
        count: 7,
      },
      {
        name: 'Bloomberg',
        count: 5,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Google',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/minimum-remove-to-make-valid-parentheses/',
    problemSlug: null,
  },
  {
    rank: 6,
    title: 'Longest Substring Without Repeating Characters',
    topic: 'String',
    difficulty: 'Medium',
    premium: false,
    total: 149,
    companies: [
      {
        name: 'Amazon',
        count: 58,
      },
      {
        name: 'Microsoft',
        count: 30,
      },
      {
        name: 'Bloomberg',
        count: 22,
      },
      {
        name: 'Facebook',
        count: 20,
      },
      {
        name: 'Google',
        count: 19,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/',
    problemSlug: 'longest-substring',
  },
  {
    rank: 7,
    title: 'Trapping Rain Water',
    topic: 'Array',
    difficulty: 'Hard',
    premium: false,
    total: 146,
    companies: [
      {
        name: 'Amazon',
        count: 51,
      },
      {
        name: 'Goldman Sachs',
        count: 44,
      },
      {
        name: 'Bloomberg',
        count: 20,
      },
      {
        name: 'Facebook',
        count: 19,
      },
      {
        name: 'Microsoft',
        count: 12,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/trapping-rain-water/',
    problemSlug: 'trapping-rain-water',
  },
  {
    rank: 8,
    title: 'Valid Parentheses',
    topic: 'String',
    difficulty: 'Easy',
    premium: false,
    total: 146,
    companies: [
      {
        name: 'Amazon',
        count: 52,
      },
      {
        name: 'LinkedIn',
        count: 33,
      },
      {
        name: 'Facebook',
        count: 23,
      },
      {
        name: 'Microsoft',
        count: 21,
      },
      {
        name: 'Bloomberg',
        count: 17,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/valid-parentheses/',
    problemSlug: 'valid-parentheses',
  },
  {
    rank: 9,
    title: 'Roman to Integer',
    topic: 'Hashing',
    difficulty: 'Easy',
    premium: false,
    total: 141,
    companies: [
      {
        name: 'Amazon',
        count: 46,
      },
      {
        name: 'Adobe',
        count: 32,
      },
      {
        name: 'Apple',
        count: 27,
      },
      {
        name: 'Google',
        count: 25,
      },
      {
        name: 'Facebook',
        count: 11,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/roman-to-integer/',
    problemSlug: 'roman-to-integer',
  },
  {
    rank: 10,
    title: 'Meeting Rooms II',
    topic: 'Interval',
    difficulty: 'Medium',
    premium: true,
    total: 137,
    companies: [
      {
        name: 'Amazon',
        count: 58,
      },
      {
        name: 'Google',
        count: 22,
      },
      {
        name: 'Facebook',
        count: 20,
      },
      {
        name: 'Bloomberg',
        count: 19,
      },
      {
        name: 'Microsoft',
        count: 18,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/meeting-rooms-ii/',
    problemSlug: null,
  },
  {
    rank: 11,
    title: 'Merge K Sorted Lists',
    topic: 'Linked List',
    difficulty: 'Hard',
    premium: false,
    total: 131,
    companies: [
      {
        name: 'Amazon',
        count: 54,
      },
      {
        name: 'Facebook',
        count: 42,
      },
      {
        name: 'Microsoft',
        count: 17,
      },
      {
        name: 'Apple',
        count: 10,
      },
      {
        name: 'Google',
        count: 8,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/merge-k-sorted-lists/',
    problemSlug: null,
  },
  {
    rank: 12,
    title: 'Top K Frequent Elements',
    topic: 'Heap',
    difficulty: 'Medium',
    premium: false,
    total: 125,
    companies: [
      {
        name: 'Facebook',
        count: 73,
      },
      {
        name: 'Amazon',
        count: 30,
      },
      {
        name: 'Microsoft',
        count: 8,
      },
      {
        name: 'Google',
        count: 7,
      },
      {
        name: 'Uber',
        count: 7,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/top-k-frequent-elements/',
    problemSlug: null,
  },
  {
    rank: 13,
    title: 'Maximum Subarray',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 121,
    companies: [
      {
        name: 'LinkedIn',
        count: 39,
      },
      {
        name: 'Amazon',
        count: 32,
      },
      {
        name: 'Apple',
        count: 19,
      },
      {
        name: 'Microsoft',
        count: 16,
      },
      {
        name: 'Google',
        count: 15,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/maximum-subarray/',
    problemSlug: 'max-subarray',
  },
  {
    rank: 14,
    title: 'Group Anagrams',
    topic: 'String',
    difficulty: 'Medium',
    premium: false,
    total: 121,
    companies: [
      {
        name: 'Amazon',
        count: 56,
      },
      {
        name: 'Microsoft',
        count: 27,
      },
      {
        name: 'Facebook',
        count: 17,
      },
      {
        name: 'Apple',
        count: 14,
      },
      {
        name: 'Google',
        count: 7,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/group-anagrams/',
    problemSlug: null,
  },
  {
    rank: 15,
    title: 'Best Time to Buy and Sell Stock',
    topic: 'Array',
    difficulty: 'Easy',
    premium: false,
    total: 120,
    companies: [
      {
        name: 'Amazon',
        count: 62,
      },
      {
        name: 'Microsoft',
        count: 19,
      },
      {
        name: 'Bloomberg',
        count: 15,
      },
      {
        name: 'Facebook',
        count: 12,
      },
      {
        name: 'Google',
        count: 12,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',
    problemSlug: null,
  },
  {
    rank: 16,
    title: 'Kth Largest Element in an Array',
    topic: 'Heap',
    difficulty: 'Medium',
    premium: false,
    total: 112,
    companies: [
      {
        name: 'Facebook',
        count: 64,
      },
      {
        name: 'Amazon',
        count: 19,
      },
      {
        name: 'LinkedIn',
        count: 14,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Google',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/kth-largest-element-in-an-array/',
    problemSlug: 'kth-largest',
  },
  {
    rank: 17,
    title: '3 Sum',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 109,
    companies: [
      {
        name: 'Amazon',
        count: 40,
      },
      {
        name: 'Microsoft',
        count: 24,
      },
      {
        name: 'Facebook',
        count: 21,
      },
      {
        name: 'Apple',
        count: 16,
      },
      {
        name: 'Google',
        count: 8,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/3sum/',
    problemSlug: null,
  },
  {
    rank: 18,
    title: 'Race Car',
    topic: 'Dynamic Programming',
    difficulty: 'Hard',
    premium: false,
    total: 108,
    companies: [
      {
        name: 'Google',
        count: 92,
      },
      {
        name: 'Amazon',
        count: 12,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/race-car/',
    problemSlug: null,
  },
  {
    rank: 19,
    title: 'Valid Palindrome',
    topic: 'String',
    difficulty: 'Easy',
    premium: false,
    total: 103,
    companies: [
      {
        name: 'Facebook',
        count: 74,
      },
      {
        name: 'Amazon',
        count: 10,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Apple',
        count: 6,
      },
      {
        name: 'Bloomberg',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/valid-palindrome/',
    problemSlug: null,
  },
  {
    rank: 20,
    title: 'Median of Two Sorted Arrays',
    topic: 'Array',
    difficulty: 'Hard',
    premium: false,
    total: 101,
    companies: [
      {
        name: 'Amazon',
        count: 39,
      },
      {
        name: 'Apple',
        count: 20,
      },
      {
        name: 'Microsoft',
        count: 18,
      },
      {
        name: 'Google',
        count: 15,
      },
      {
        name: 'Bloomberg',
        count: 9,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/median-of-two-sorted-arrays/',
    problemSlug: 'median-two-sorted-arrays',
  },
  {
    rank: 21,
    title: 'Word Search',
    topic: 'Matrix',
    difficulty: 'Medium',
    premium: false,
    total: 100,
    companies: [
      {
        name: 'Amazon',
        count: 38,
      },
      {
        name: 'Microsoft',
        count: 19,
      },
      {
        name: 'Twitter',
        count: 17,
      },
      {
        name: 'Uber',
        count: 16,
      },
      {
        name: 'Facebook',
        count: 10,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/word-search/',
    problemSlug: null,
  },
  {
    rank: 22,
    title: 'Search in Rotated Sorted Array',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 97,
    companies: [
      {
        name: 'Amazon',
        count: 27,
      },
      {
        name: 'Facebook',
        count: 22,
      },
      {
        name: 'Microsoft',
        count: 22,
      },
      {
        name: 'LinkedIn',
        count: 21,
      },
      {
        name: 'Apple',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/search-in-rotated-sorted-array/',
    problemSlug: null,
  },
  {
    rank: 23,
    title: 'Longest Palindromic Substring',
    topic: 'String',
    difficulty: 'Medium',
    premium: false,
    total: 94,
    companies: [
      {
        name: 'Amazon',
        count: 40,
      },
      {
        name: 'Microsoft',
        count: 19,
      },
      {
        name: 'Google',
        count: 15,
      },
      {
        name: 'Adobe',
        count: 10,
      },
      {
        name: 'Apple',
        count: 10,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-palindromic-substring/',
    problemSlug: null,
  },
  {
    rank: 24,
    title: 'Letter Combinations of a Phone Number',
    topic: 'String',
    difficulty: 'Medium',
    premium: false,
    total: 92,
    companies: [
      {
        name: 'Amazon',
        count: 38,
      },
      {
        name: 'Microsoft',
        count: 27,
      },
      {
        name: 'Facebook',
        count: 10,
      },
      {
        name: 'Apple',
        count: 9,
      },
      {
        name: 'Google',
        count: 8,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/letter-combinations-of-a-phone-number/',
    problemSlug: null,
  },
  {
    rank: 25,
    title: 'Word Search II',
    topic: 'Tree',
    difficulty: 'Hard',
    premium: false,
    total: 83,
    companies: [
      {
        name: 'Amazon',
        count: 28,
      },
      {
        name: 'Uber',
        count: 28,
      },
      {
        name: 'Cisco',
        count: 12,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Google',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/word-search-ii/',
    problemSlug: null,
  },
  {
    rank: 26,
    title: 'Next Permutation',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 82,
    companies: [
      {
        name: 'Facebook',
        count: 33,
      },
      {
        name: 'Amazon',
        count: 19,
      },
      {
        name: 'Google',
        count: 12,
      },
      {
        name: 'Apple',
        count: 10,
      },
      {
        name: 'Microsoft',
        count: 8,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/next-permutation/',
    problemSlug: null,
  },
  {
    rank: 27,
    title: 'Insert Delete GetRandom O(1)',
    topic: 'Design',
    difficulty: 'Medium',
    premium: false,
    total: 82,
    companies: [
      {
        name: 'Bloomberg',
        count: 35,
      },
      {
        name: 'LinkedIn',
        count: 17,
      },
      {
        name: 'Facebook',
        count: 12,
      },
      {
        name: 'Microsoft',
        count: 11,
      },
      {
        name: 'Uber',
        count: 7,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/insert-delete-getrandom-o1/',
    problemSlug: null,
  },
  {
    rank: 28,
    title: 'Add Two Numbers',
    topic: 'Linked List',
    difficulty: 'Medium',
    premium: false,
    total: 81,
    companies: [
      {
        name: 'Amazon',
        count: 36,
      },
      {
        name: 'Apple',
        count: 17,
      },
      {
        name: 'Microsoft',
        count: 11,
      },
      {
        name: 'Facebook',
        count: 11,
      },
      {
        name: 'Google',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/add-two-numbers/',
    problemSlug: null,
  },
  {
    rank: 29,
    title: 'Find Leaves of Binary Tree',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 81,
    companies: [
      {
        name: 'Google',
        count: 52,
      },
      {
        name: 'LinkedIn',
        count: 15,
      },
      {
        name: 'Amazon',
        count: 8,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Facebook',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/find-leaves-of-binary-tree/',
    problemSlug: null,
  },
  {
    rank: 30,
    title: 'Course Schedule II',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 77,
    companies: [
      {
        name: 'Amazon',
        count: 40,
      },
      {
        name: 'Google',
        count: 14,
      },
      {
        name: 'Microsoft',
        count: 13,
      },
      {
        name: 'Apple',
        count: 6,
      },
      {
        name: 'TikTok',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/course-schedule-ii/',
    problemSlug: null,
  },
  {
    rank: 31,
    title: 'Word Ladder',
    topic: 'Hashing',
    difficulty: 'Hard',
    premium: false,
    total: 77,
    companies: [
      {
        name: 'Amazon',
        count: 53,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'LinkedIn',
        count: 7,
      },
      {
        name: 'Facebook',
        count: 6,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/word-ladder/',
    problemSlug: null,
  },
  {
    rank: 32,
    title: 'Generate Parentheses',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 76,
    companies: [
      {
        name: 'Amazon',
        count: 38,
      },
      {
        name: 'Facebook',
        count: 13,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Apple',
        count: 9,
      },
      {
        name: 'Bloomberg',
        count: 7,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/generate-parentheses/',
    problemSlug: null,
  },
  {
    rank: 33,
    title: 'Merge Sorted Array',
    topic: 'Sorting',
    difficulty: 'Easy',
    premium: false,
    total: 76,
    companies: [
      {
        name: 'Facebook',
        count: 44,
      },
      {
        name: 'Microsoft',
        count: 13,
      },
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'Apple',
        count: 6,
      },
      {
        name: 'LinkedIn',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/merge-sorted-array/',
    problemSlug: null,
  },
  {
    rank: 34,
    title: 'Copy List with Random Pointer',
    topic: 'Hashing',
    difficulty: 'Medium',
    premium: false,
    total: 75,
    companies: [
      {
        name: 'Facebook',
        count: 31,
      },
      {
        name: 'Amazon',
        count: 30,
      },
      {
        name: 'Microsoft',
        count: 7,
      },
      {
        name: 'Bloomberg',
        count: 5,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/copy-list-with-random-pointer/',
    problemSlug: null,
  },
  {
    rank: 35,
    title: 'Word Break Problem',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 72,
    companies: [
      {
        name: 'Amazon',
        count: 35,
      },
      {
        name: 'Facebook',
        count: 20,
      },
      {
        name: 'Apple',
        count: 6,
      },
      {
        name: 'Microsoft',
        count: 6,
      },
      {
        name: 'Google',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/word-break/',
    problemSlug: null,
  },
  {
    rank: 36,
    title: 'Product of Array Except Self',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 70,
    companies: [
      {
        name: 'Amazon',
        count: 34,
      },
      {
        name: 'Facebook',
        count: 13,
      },
      {
        name: 'Microsoft',
        count: 13,
      },
      {
        name: 'Apple',
        count: 8,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/product-of-array-except-self/',
    problemSlug: 'product-except-self',
  },
  {
    rank: 37,
    title: 'Course Schedule',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 67,
    companies: [
      {
        name: 'Amazon',
        count: 34,
      },
      {
        name: 'Google',
        count: 9,
      },
      {
        name: 'TikTok',
        count: 9,
      },
      {
        name: 'Microsoft',
        count: 8,
      },
      {
        name: 'Facebook',
        count: 7,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/course-schedule/',
    problemSlug: null,
  },
  {
    rank: 38,
    title: 'Longest Common Prefix',
    topic: 'String',
    difficulty: 'Easy',
    premium: false,
    total: 67,
    companies: [
      {
        name: 'Amazon',
        count: 20,
      },
      {
        name: 'Facebook',
        count: 15,
      },
      {
        name: 'Apple',
        count: 15,
      },
      {
        name: 'Google',
        count: 10,
      },
      {
        name: 'Microsoft',
        count: 7,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-common-prefix/',
    problemSlug: null,
  },
  {
    rank: 39,
    title: 'Serialize and Deserialize Binary Tree',
    topic: 'Tree',
    difficulty: 'Hard',
    premium: false,
    total: 67,
    companies: [
      {
        name: 'Amazon',
        count: 26,
      },
      {
        name: 'Microsoft',
        count: 16,
      },
      {
        name: 'LinkedIn',
        count: 15,
      },
      {
        name: 'Uber',
        count: 6,
      },
      {
        name: 'Google',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/serialize-and-deserialize-binary-tree/',
    problemSlug: null,
  },
  {
    rank: 40,
    title: 'Binary Tree Maximum Path Sum',
    topic: 'Tree',
    difficulty: 'Hard',
    premium: false,
    total: 65,
    companies: [
      {
        name: 'Amazon',
        count: 20,
      },
      {
        name: 'DoorDash',
        count: 18,
      },
      {
        name: 'Microsoft',
        count: 12,
      },
      {
        name: 'Facebook',
        count: 9,
      },
      {
        name: 'Google',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/binary-tree-maximum-path-sum/',
    problemSlug: null,
  },
  {
    rank: 41,
    title: 'Find First and Last Position of Element in Sorted Array',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 64,
    companies: [
      {
        name: 'Facebook',
        count: 23,
      },
      {
        name: 'Amazon',
        count: 21,
      },
      {
        name: 'Microsoft',
        count: 8,
      },
      {
        name: 'Bloomberg',
        count: 6,
      },
      {
        name: 'Google',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/find-first-and-last-position-of-element-in-sorted-array/',
    problemSlug: null,
  },
  {
    rank: 42,
    title: 'Sliding Window Maximum',
    topic: 'Heap',
    difficulty: 'Hard',
    premium: false,
    total: 63,
    companies: [
      {
        name: 'Amazon',
        count: 34,
      },
      {
        name: 'Google',
        count: 13,
      },
      {
        name: 'Apple',
        count: 7,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/sliding-window-maximum/',
    problemSlug: null,
  },
  {
    rank: 43,
    title: 'Logger Rate Limiter',
    topic: 'Design',
    difficulty: 'Easy',
    premium: false,
    total: 62,
    companies: [
      {
        name: 'Google',
        count: 48,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Netflix',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/logger-rate-limiter/',
    problemSlug: null,
  },
  {
    rank: 44,
    title: 'Minimum Window Substring',
    topic: 'String',
    difficulty: 'Hard',
    premium: false,
    total: 60,
    companies: [
      {
        name: 'Facebook',
        count: 18,
      },
      {
        name: 'Amazon',
        count: 16,
      },
      {
        name: 'LinkedIn',
        count: 9,
      },
      {
        name: 'Lyft',
        count: 9,
      },
      {
        name: 'Microsoft',
        count: 8,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/minimum-window-substring/',
    problemSlug: null,
  },
  {
    rank: 45,
    title: 'Container With Most Water',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 57,
    companies: [
      {
        name: 'Amazon',
        count: 31,
      },
      {
        name: 'Microsoft',
        count: 8,
      },
      {
        name: 'Facebook',
        count: 8,
      },
      {
        name: 'Apple',
        count: 5,
      },
      {
        name: 'Google',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/container-with-most-water/',
    problemSlug: null,
  },
  {
    rank: 46,
    title: 'Rotate Image',
    topic: 'Matrix',
    difficulty: 'Medium',
    premium: false,
    total: 57,
    companies: [
      {
        name: 'Cisco',
        count: 18,
      },
      {
        name: 'Apple',
        count: 11,
      },
      {
        name: 'Facebook',
        count: 10,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Amazon',
        count: 9,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/rotate-image/',
    problemSlug: null,
  },
  {
    rank: 47,
    title: 'Validate Binary Search Tree',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 57,
    companies: [
      {
        name: 'Amazon',
        count: 25,
      },
      {
        name: 'Microsoft',
        count: 12,
      },
      {
        name: 'Bloomberg',
        count: 12,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Uber',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/validate-binary-search-tree/',
    problemSlug: null,
  },
  {
    rank: 48,
    title: 'Maximum Product Subarray',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 56,
    companies: [
      {
        name: 'LinkedIn',
        count: 26,
      },
      {
        name: 'Amazon',
        count: 21,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Infosys',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/maximum-product-subarray/',
    problemSlug: null,
  },
  {
    rank: 49,
    title: 'Coin Change',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 56,
    companies: [
      {
        name: 'Amazon',
        count: 28,
      },
      {
        name: 'Microsoft',
        count: 13,
      },
      {
        name: 'Adobe',
        count: 6,
      },
      {
        name: 'Apple',
        count: 6,
      },
      {
        name: 'Google',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/coin-change/',
    problemSlug: 'coin-change',
  },
  {
    rank: 50,
    title: 'Text Justification',
    topic: 'String',
    difficulty: 'Hard',
    premium: false,
    total: 56,
    companies: [
      {
        name: 'Google',
        count: 23,
      },
      {
        name: 'LinkedIn',
        count: 17,
      },
      {
        name: 'Uber',
        count: 9,
      },
      {
        name: 'Facebook',
        count: 4,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/text-justification/',
    problemSlug: null,
  },
  {
    rank: 51,
    title: 'Find Median from Data Stream',
    topic: 'Heap',
    difficulty: 'Hard',
    premium: false,
    total: 55,
    companies: [
      {
        name: 'Amazon',
        count: 26,
      },
      {
        name: 'Microsoft',
        count: 14,
      },
      {
        name: 'Facebook',
        count: 6,
      },
      {
        name: 'Apple',
        count: 5,
      },
      {
        name: 'Google',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/find-median-from-data-stream/',
    problemSlug: null,
  },
  {
    rank: 52,
    title: 'Longest Consecutive Sequence',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 54,
    companies: [
      {
        name: 'Amazon',
        count: 21,
      },
      {
        name: 'Google',
        count: 12,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Bloomberg',
        count: 6,
      },
      {
        name: 'Apple',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-consecutive-sequence/',
    problemSlug: null,
  },
  {
    rank: 53,
    title: 'Merge Two Sorted Lists',
    topic: 'Linked List',
    difficulty: 'Easy',
    premium: false,
    total: 54,
    companies: [
      {
        name: 'Amazon',
        count: 21,
      },
      {
        name: 'Microsoft',
        count: 13,
      },
      {
        name: 'Facebook',
        count: 12,
      },
      {
        name: 'Apple',
        count: 4,
      },
      {
        name: 'Bloomberg',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/merge-two-sorted-lists/',
    problemSlug: null,
  },
  {
    rank: 54,
    title: 'Moving Average from Data Stream',
    topic: 'Design',
    difficulty: 'Easy',
    premium: false,
    total: 54,
    companies: [
      {
        name: 'Facebook',
        count: 23,
      },
      {
        name: 'Spotify',
        count: 21,
      },
      {
        name: 'Google',
        count: 4,
      },
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/moving-average-from-data-stream/',
    problemSlug: null,
  },
  {
    rank: 55,
    title: 'Spiral Matrix',
    topic: 'Matrix',
    difficulty: 'Medium',
    premium: false,
    total: 53,
    companies: [
      {
        name: 'Microsoft',
        count: 20,
      },
      {
        name: 'Amazon',
        count: 10,
      },
      {
        name: 'Apple',
        count: 8,
      },
      {
        name: 'Facebook',
        count: 8,
      },
      {
        name: 'Google',
        count: 7,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/spiral-matrix/',
    problemSlug: null,
  },
  {
    rank: 56,
    title: 'Valid Sudoku',
    topic: 'Matrix',
    difficulty: 'Medium',
    premium: false,
    total: 52,
    companies: [
      {
        name: 'Amazon',
        count: 24,
      },
      {
        name: 'Apple',
        count: 15,
      },
      {
        name: 'Uber',
        count: 7,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/valid-sudoku/',
    problemSlug: null,
  },
  {
    rank: 57,
    title: 'Contains Duplicate',
    topic: 'Array',
    difficulty: 'Easy',
    premium: false,
    total: 51,
    companies: [
      {
        name: 'Amazon',
        count: 17,
      },
      {
        name: 'Apple',
        count: 15,
      },
      {
        name: 'Google',
        count: 8,
      },
      {
        name: 'Microsoft',
        count: 6,
      },
      {
        name: 'Facebook',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/contains-duplicate/',
    problemSlug: 'contains-duplicate',
  },
  {
    rank: 58,
    title: 'Clone Graph',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 51,
    companies: [
      {
        name: 'Facebook',
        count: 28,
      },
      {
        name: 'Bloomberg',
        count: 8,
      },
      {
        name: 'Amazon',
        count: 7,
      },
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/clone-graph/',
    problemSlug: null,
  },
  {
    rank: 59,
    title: 'Max Stack',
    topic: 'Stack',
    difficulty: 'Hard',
    premium: false,
    total: 51,
    companies: [
      {
        name: 'LinkedIn',
        count: 34,
      },
      {
        name: 'Microsoft',
        count: 7,
      },
      {
        name: 'Bloomberg',
        count: 4,
      },
      {
        name: 'Lyft',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/max-stack/',
    problemSlug: null,
  },
  {
    rank: 60,
    title: 'Unique Paths',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 50,
    companies: [
      {
        name: 'Google',
        count: 17,
      },
      {
        name: 'Amazon',
        count: 10,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Facebook',
        count: 8,
      },
      {
        name: 'Apple',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/unique-paths/',
    problemSlug: null,
  },
  {
    rank: 61,
    title: 'Alien Dictionary',
    topic: 'Graph',
    difficulty: 'Hard',
    premium: true,
    total: 50,
    companies: [
      {
        name: 'Airbnb',
        count: 18,
      },
      {
        name: 'Amazon',
        count: 12,
      },
      {
        name: 'Facebook',
        count: 9,
      },
      {
        name: 'Google',
        count: 6,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/alien-dictionary/',
    problemSlug: null,
  },
  {
    rank: 62,
    title: 'House Robber',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 49,
    companies: [
      {
        name: 'Amazon',
        count: 25,
      },
      {
        name: 'Apple',
        count: 11,
      },
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
      {
        name: 'Bloomberg',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/house-robber/',
    problemSlug: null,
  },
  {
    rank: 63,
    title: 'Valid Anagram',
    topic: 'String',
    difficulty: 'Easy',
    premium: false,
    total: 44,
    companies: [
      {
        name: 'Amazon',
        count: 13,
      },
      {
        name: 'Bloomberg',
        count: 10,
      },
      {
        name: 'Spotify',
        count: 9,
      },
      {
        name: 'Facebook',
        count: 6,
      },
      {
        name: 'Apple',
        count: 6,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/valid-anagram/',
    problemSlug: 'valid-anagram',
  },
  {
    rank: 64,
    title: 'Longest Increasing Path in a Matrix',
    topic: 'Matrix',
    difficulty: 'Hard',
    premium: false,
    total: 43,
    companies: [
      {
        name: 'Google',
        count: 26,
      },
      {
        name: 'Amazon',
        count: 6,
      },
      {
        name: 'DoorDash',
        count: 5,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'TikTok',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-increasing-path-in-a-matrix/',
    problemSlug: null,
  },
  {
    rank: 65,
    title: 'Palindrome Linked List',
    topic: 'String',
    difficulty: 'Easy',
    premium: false,
    total: 42,
    companies: [
      {
        name: 'Amazon',
        count: 16,
      },
      {
        name: 'Facebook',
        count: 7,
      },
      {
        name: 'Microsoft',
        count: 7,
      },
      {
        name: 'Apple',
        count: 7,
      },
      {
        name: 'Google',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/palindrome-linked-list/',
    problemSlug: null,
  },
  {
    rank: 66,
    title: 'Regular Expression Matching',
    topic: 'Dynamic Programming',
    difficulty: 'Hard',
    premium: false,
    total: 41,
    companies: [
      {
        name: 'Microsoft',
        count: 18,
      },
      {
        name: 'Amazon',
        count: 8,
      },
      {
        name: 'Facebook',
        count: 6,
      },
      {
        name: 'Google',
        count: 6,
      },
      {
        name: 'Bloomberg',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/regular-expression-matching/',
    problemSlug: null,
  },
  {
    rank: 67,
    title: 'First Missing Positive',
    topic: 'Hashing',
    difficulty: 'Hard',
    premium: false,
    total: 39,
    companies: [
      {
        name: 'Amazon',
        count: 18,
      },
      {
        name: 'Microsoft',
        count: 10,
      },
      {
        name: 'Adobe',
        count: 5,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Apple',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/first-missing-positive/',
    problemSlug: null,
  },
  {
    rank: 68,
    title: 'Remove Nth Node From End Of List',
    topic: 'Linked List',
    difficulty: 'Medium',
    premium: false,
    total: 38,
    companies: [
      {
        name: 'Facebook',
        count: 18,
      },
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'Google',
        count: 4,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Apple',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/remove-nth-node-from-end-of-list/',
    problemSlug: null,
  },
  {
    rank: 69,
    title: 'Min Stack',
    topic: 'Stack',
    difficulty: 'Medium',
    premium: false,
    total: 38,
    companies: [
      {
        name: 'Amazon',
        count: 17,
      },
      {
        name: 'Microsoft',
        count: 11,
      },
      {
        name: 'Bloomberg',
        count: 5,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/min-stack/',
    problemSlug: null,
  },
  {
    rank: 70,
    title: 'Binary Tree Level Order Traversal',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 38,
    companies: [
      {
        name: 'Amazon',
        count: 11,
      },
      {
        name: 'LinkedIn',
        count: 11,
      },
      {
        name: 'Microsoft',
        count: 9,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/binary-tree-level-order-traversal/',
    problemSlug: null,
  },
  {
    rank: 71,
    title: 'Implement Trie (Prefix Tree)',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 38,
    companies: [
      {
        name: 'Amazon',
        count: 13,
      },
      {
        name: 'Google',
        count: 8,
      },
      {
        name: 'Twitter',
        count: 7,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
      {
        name: 'Snapchat',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/implement-trie-prefix-tree/',
    problemSlug: null,
  },
  {
    rank: 72,
    title: 'Number of Provinces',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 37,
    companies: [
      {
        name: 'Amazon',
        count: 22,
      },
      {
        name: 'DoorDash',
        count: 8,
      },
      {
        name: 'Bloomberg',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/number-of-provinces/',
    problemSlug: null,
  },
  {
    rank: 73,
    title: 'Reverse a Linked List',
    topic: 'Linked List',
    difficulty: 'Easy',
    premium: false,
    total: 37,
    companies: [
      {
        name: 'Amazon',
        count: 15,
      },
      {
        name: 'Apple',
        count: 8,
      },
      {
        name: 'Microsoft',
        count: 7,
      },
      {
        name: 'Google',
        count: 4,
      },
      {
        name: 'Facebook',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/reverse-linked-list/',
    problemSlug: null,
  },
  {
    rank: 74,
    title: 'Reverse Nodes in k-Group',
    topic: 'Linked List',
    difficulty: 'Hard',
    premium: false,
    total: 36,
    companies: [
      {
        name: 'Microsoft',
        count: 15,
      },
      {
        name: 'Amazon',
        count: 13,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/reverse-nodes-in-k-group/',
    problemSlug: null,
  },
  {
    rank: 75,
    title: 'Jump Game',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 35,
    companies: [
      {
        name: 'Amazon',
        count: 21,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Apple',
        count: 4,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'DoorDash',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/jump-game/',
    problemSlug: null,
  },
  {
    rank: 76,
    title: 'Insert Interval',
    topic: 'Interval',
    difficulty: 'Medium',
    premium: false,
    total: 35,
    companies: [
      {
        name: 'Google',
        count: 15,
      },
      {
        name: 'LinkedIn',
        count: 8,
      },
      {
        name: 'Facebook',
        count: 6,
      },
      {
        name: 'Amazon',
        count: 4,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/insert-interval/',
    problemSlug: null,
  },
  {
    rank: 77,
    title: 'Missing Number',
    topic: 'Binary-Bit Manipulation',
    difficulty: 'Easy',
    premium: false,
    total: 35,
    companies: [
      {
        name: 'Microsoft',
        count: 13,
      },
      {
        name: 'Amazon',
        count: 12,
      },
      {
        name: 'Apple',
        count: 4,
      },
      {
        name: 'Adobe',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/missing-number/',
    problemSlug: null,
  },
  {
    rank: 78,
    title: 'Longest Increasing Subsequence',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 34,
    companies: [
      {
        name: 'Google',
        count: 12,
      },
      {
        name: 'Microsoft',
        count: 10,
      },
      {
        name: 'Amazon',
        count: 6,
      },
      {
        name: 'TikTok',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-increasing-subsequence/',
    problemSlug: 'longest-increasing-subsequence',
  },
  {
    rank: 79,
    title: 'Decode Ways',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 33,
    companies: [
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'TikTok',
        count: 7,
      },
      {
        name: 'Google',
        count: 6,
      },
      {
        name: 'Microsoft',
        count: 6,
      },
      {
        name: 'Lyft',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/decode-ways/',
    problemSlug: null,
  },
  {
    rank: 80,
    title: 'Kth Smallest Element in a BST',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 32,
    companies: [
      {
        name: 'Uber',
        count: 17,
      },
      {
        name: 'Amazon',
        count: 8,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/kth-smallest-element-in-a-bst/',
    problemSlug: null,
  },
  {
    rank: 81,
    title: 'Design Tic-Tac-Toe',
    topic: 'Design',
    difficulty: 'Medium',
    premium: false,
    total: 31,
    companies: [
      {
        name: 'Amazon',
        count: 14,
      },
      {
        name: 'Facebook',
        count: 6,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
      {
        name: 'Google',
        count: 4,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/design-tic-tac-toe/',
    problemSlug: null,
  },
  {
    rank: 82,
    title: 'Number of 1 Bits',
    topic: 'Binary-Bit Manipulation',
    difficulty: 'Easy',
    premium: false,
    total: 31,
    companies: [
      {
        name: 'Box',
        count: 11,
      },
      {
        name: 'Amazon',
        count: 7,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Qualcomm',
        count: 4,
      },
      {
        name: 'Cisco',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/number-of-1-bits/',
    problemSlug: null,
  },
  {
    rank: 83,
    title: 'Sort Colors',
    topic: 'Sorting',
    difficulty: 'Medium',
    premium: false,
    total: 29,
    companies: [
      {
        name: 'Amazon',
        count: 10,
      },
      {
        name: 'Microsoft',
        count: 7,
      },
      {
        name: 'Apple',
        count: 7,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/sort-colors/',
    problemSlug: null,
  },
  {
    rank: 84,
    title: 'Climbing Stairs',
    topic: 'Dynamic Programming',
    difficulty: 'Easy',
    premium: false,
    total: 28,
    companies: [
      {
        name: 'Amazon',
        count: 16,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
      {
        name: 'Uber',
        count: 3,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/climbing-stairs/',
    problemSlug: 'climb-stairs',
  },
  {
    rank: 85,
    title: 'Add and Search Word',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 28,
    companies: [
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'Facebook',
        count: 8,
      },
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/design-add-and-search-words-data-structure/',
    problemSlug: null,
  },
  {
    rank: 86,
    title: 'Longest Repeating Character Replacement',
    topic: 'String',
    difficulty: 'Medium',
    premium: false,
    total: 27,
    companies: [
      {
        name: 'Google',
        count: 9,
      },
      {
        name: 'Uber',
        count: 7,
      },
      {
        name: 'Amazon',
        count: 5,
      },
      {
        name: 'Facebook',
        count: 4,
      },
      {
        name: 'Adobe',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-repeating-character-replacement/',
    problemSlug: null,
  },
  {
    rank: 87,
    title: 'Largest Rectangle in Histogram',
    topic: 'Stack',
    difficulty: 'Hard',
    premium: false,
    total: 27,
    companies: [
      {
        name: 'Amazon',
        count: 15,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Bloomberg',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/largest-rectangle-in-histogram/',
    problemSlug: null,
  },
  {
    rank: 88,
    title: 'Reorder List',
    topic: 'Linked List',
    difficulty: 'Medium',
    premium: false,
    total: 26,
    companies: [
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'Microsoft',
        count: 8,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Uber',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/reorder-list/',
    problemSlug: null,
  },
  {
    rank: 89,
    title: 'Palindromic Substrings',
    topic: 'String',
    difficulty: 'Medium',
    premium: false,
    total: 26,
    companies: [
      {
        name: 'Facebook',
        count: 14,
      },
      {
        name: 'Amazon',
        count: 4,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Twitter',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/palindromic-substrings/',
    problemSlug: null,
  },
  {
    rank: 90,
    title: 'Maximum Depth of Binary Tree',
    topic: 'Tree',
    difficulty: 'Easy',
    premium: false,
    total: 26,
    companies: [
      {
        name: 'LinkedIn',
        count: 8,
      },
      {
        name: 'Amazon',
        count: 5,
      },
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Spotify',
        count: 4,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/maximum-depth-of-binary-tree/',
    problemSlug: null,
  },
  {
    rank: 91,
    title: 'Symmetric Tree',
    topic: 'Tree',
    difficulty: 'Easy',
    premium: false,
    total: 26,
    companies: [
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'LinkedIn',
        count: 5,
      },
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Facebook',
        count: 4,
      },
      {
        name: 'Apple',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/symmetric-tree/',
    problemSlug: null,
  },
  {
    rank: 92,
    title: 'Find Minimum in Rotated Sorted Array',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 25,
    companies: [
      {
        name: 'Amazon',
        count: 8,
      },
      {
        name: 'Microsoft',
        count: 7,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Uber',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/find-minimum-in-rotated-sorted-array/',
    problemSlug: null,
  },
  {
    rank: 93,
    title: 'Jump Game II',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 25,
    companies: [
      {
        name: 'Amazon',
        count: 12,
      },
      {
        name: 'DoorDash',
        count: 4,
      },
      {
        name: 'Bloomberg',
        count: 3,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/jump-game-ii/',
    problemSlug: null,
  },
  {
    rank: 94,
    title: 'Lowest Common Ancestor of BST',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 25,
    companies: [
      {
        name: 'LinkedIn',
        count: 12,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/lowest-common-ancestor-of-a-binary-search-tree/',
    problemSlug: null,
  },
  {
    rank: 95,
    title: "Pascal's Triangle",
    topic: 'Dynamic Programming',
    difficulty: 'Easy',
    premium: false,
    total: 24,
    companies: [
      {
        name: 'Amazon',
        count: 13,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
      {
        name: 'Facebook',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/pascal-s-triangle/',
    problemSlug: null,
  },
  {
    rank: 96,
    title: 'Non-overlapping Intervals',
    topic: 'Interval',
    difficulty: 'Medium',
    premium: false,
    total: 24,
    companies: [
      {
        name: 'Facebook',
        count: 6,
      },
      {
        name: 'Amazon',
        count: 5,
      },
      {
        name: 'Apple',
        count: 5,
      },
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/non-overlapping-intervals/',
    problemSlug: null,
  },
  {
    rank: 97,
    title: 'House Robber II',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 23,
    companies: [
      {
        name: 'Google',
        count: 11,
      },
      {
        name: 'Amazon',
        count: 6,
      },
      {
        name: 'TikTok',
        count: 2,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Facebook',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/house-robber-ii/',
    problemSlug: null,
  },
  {
    rank: 98,
    title: 'Set Matrix Zeroes',
    topic: 'Matrix',
    difficulty: 'Medium',
    premium: false,
    total: 23,
    companies: [
      {
        name: 'Microsoft',
        count: 8,
      },
      {
        name: 'Amazon',
        count: 5,
      },
      {
        name: 'Bloomberg',
        count: 4,
      },
      {
        name: 'Facebook',
        count: 4,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/set-matrix-zeroes/',
    problemSlug: null,
  },
  {
    rank: 99,
    title: 'Binary Tree Zigzag Level Order Traversal',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 23,
    companies: [
      {
        name: 'Facebook',
        count: 8,
      },
      {
        name: 'Bloomberg',
        count: 8,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/binary-tree-zigzag-level-order-traversal/',
    problemSlug: null,
  },
  {
    rank: 100,
    title: 'Longest Common Subsequence',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 22,
    companies: [
      {
        name: 'DoorDash',
        count: 7,
      },
      {
        name: 'Amazon',
        count: 6,
      },
      {
        name: 'Google',
        count: 4,
      },
      {
        name: 'Bloomberg',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-common-subsequence/',
    problemSlug: null,
  },
  {
    rank: 101,
    title: 'Game of Life',
    topic: 'Matrix',
    difficulty: 'Medium',
    premium: false,
    total: 22,
    companies: [
      {
        name: 'Amazon',
        count: 10,
      },
      {
        name: 'Bloomberg',
        count: 5,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'DoorDash',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/game-of-life/',
    problemSlug: null,
  },
  {
    rank: 102,
    title: 'Sort List',
    topic: 'Sorting',
    difficulty: 'Medium',
    premium: false,
    total: 22,
    companies: [
      {
        name: 'Facebook',
        count: 7,
      },
      {
        name: 'Apple',
        count: 6,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
      {
        name: 'Amazon',
        count: 2,
      },
      {
        name: 'TikTok',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/sort-list/',
    problemSlug: null,
  },
  {
    rank: 103,
    title: 'Subtree of Another Tree',
    topic: 'Tree',
    difficulty: 'Easy',
    premium: false,
    total: 22,
    companies: [
      {
        name: 'Facebook',
        count: 9,
      },
      {
        name: 'Amazon',
        count: 7,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/subtree-of-another-tree/',
    problemSlug: null,
  },
  {
    rank: 104,
    title: 'High Five',
    topic: 'Heap',
    difficulty: 'Easy',
    premium: false,
    total: 22,
    companies: [
      {
        name: 'Goldman Sachs',
        count: 17,
      },
      {
        name: 'Amazon',
        count: 5,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/high-five/',
    problemSlug: null,
  },
  {
    rank: 105,
    title: 'Employee Free Time',
    topic: 'Heap',
    difficulty: 'Hard',
    premium: false,
    total: 22,
    companies: [
      {
        name: 'Google',
        count: 10,
      },
      {
        name: 'Uber',
        count: 4,
      },
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/employee-free-time/',
    problemSlug: null,
  },
  {
    rank: 106,
    title: 'Verifying an Alien Dictionary',
    topic: 'Array',
    difficulty: 'Easy',
    premium: false,
    total: 21,
    companies: [
      {
        name: 'Facebook',
        count: 10,
      },
      {
        name: 'Uber',
        count: 4,
      },
      {
        name: 'LinkedIn',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/verifying-an-alien-dictionary/',
    problemSlug: null,
  },
  {
    rank: 107,
    title: 'Pacific Atlantic Water Flow',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 21,
    companies: [
      {
        name: 'Amazon',
        count: 6,
      },
      {
        name: 'Google',
        count: 6,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Uber',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/pacific-atlantic-water-flow/',
    problemSlug: null,
  },
  {
    rank: 108,
    title: 'Find the Celebrity',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: false,
    total: 21,
    companies: [
      {
        name: 'Amazon',
        count: 5,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'LinkedIn',
        count: 4,
      },
      {
        name: 'Apple',
        count: 3,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/find-the-celebrity/',
    problemSlug: null,
  },
  {
    rank: 109,
    title: 'Flatten Binary Tree to Linked List',
    topic: 'Linked List',
    difficulty: 'Medium',
    premium: false,
    total: 21,
    companies: [
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'Microsoft',
        count: 5,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/flatten-binary-tree-to-linked-list/',
    problemSlug: null,
  },
  {
    rank: 110,
    title: 'Majority Element',
    topic: 'Sorting',
    difficulty: 'Easy',
    premium: false,
    total: 21,
    companies: [
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'Google',
        count: 4,
      },
      {
        name: 'Apple',
        count: 4,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Bloomberg',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/majority-element/',
    problemSlug: null,
  },
  {
    rank: 111,
    title: 'Longest Valid Parentheses',
    topic: 'Stack',
    difficulty: 'Hard',
    premium: false,
    total: 21,
    companies: [
      {
        name: 'Amazon',
        count: 11,
      },
      {
        name: 'Microsoft',
        count: 4,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Facebook',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/longest-valid-parentheses/',
    problemSlug: null,
  },
  {
    rank: 112,
    title: 'Fizz Buzz',
    topic: 'String',
    difficulty: 'Easy',
    premium: false,
    total: 20,
    companies: [
      {
        name: 'TikTok',
        count: 6,
      },
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Amazon',
        count: 4,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/fizzbuzz/',
    problemSlug: null,
  },
  {
    rank: 113,
    title: 'Remove Duplicates from Sorted Array',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 19,
    companies: [
      {
        name: 'Microsoft',
        count: 6,
      },
      {
        name: 'Google',
        count: 4,
      },
      {
        name: 'Facebook',
        count: 4,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/remove-duplicates-from-sorted-array/',
    problemSlug: null,
  },
  {
    rank: 114,
    title: 'Graph Valid Tree',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: true,
    total: 19,
    companies: [
      {
        name: 'LinkedIn',
        count: 9,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 2,
      },
      {
        name: 'Bloomberg',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/graph-valid-tree/',
    problemSlug: null,
  },
  {
    rank: 115,
    title: 'Detect Cycle in a Linked List',
    topic: 'Linked List',
    difficulty: 'Easy',
    premium: false,
    total: 19,
    companies: [
      {
        name: 'Amazon',
        count: 9,
      },
      {
        name: 'Spotify',
        count: 4,
      },
      {
        name: 'Apple',
        count: 2,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/linked-list-cycle/',
    problemSlug: null,
  },
  {
    rank: 116,
    title: 'Contains Duplicate II',
    topic: 'Array',
    difficulty: 'Easy',
    premium: false,
    total: 18,
    companies: [
      {
        name: 'Amazon',
        count: 6,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Bloomberg',
        count: 3,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/contains-duplicate-ii/',
    problemSlug: null,
  },
  {
    rank: 117,
    title: 'Two Sum - II',
    topic: 'Array',
    difficulty: 'Medium',
    premium: false,
    total: 18,
    companies: [
      {
        name: 'Amazon',
        count: 10,
      },
      {
        name: 'Apple',
        count: 4,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Facebook',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/',
    problemSlug: null,
  },
  {
    rank: 118,
    title: 'Same Tree',
    topic: 'Tree',
    difficulty: 'Easy',
    premium: false,
    total: 18,
    companies: [
      {
        name: 'LinkedIn',
        count: 8,
      },
      {
        name: 'Amazon',
        count: 4,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Bloomberg',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/same-tree/',
    problemSlug: null,
  },
  {
    rank: 119,
    title: 'Combination Sum',
    topic: 'Dynamic Programming',
    difficulty: 'Medium',
    premium: false,
    total: 17,
    companies: [
      {
        name: 'Amazon',
        count: 5,
      },
      {
        name: 'Apple',
        count: 4,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/combination-sum/',
    problemSlug: null,
  },
  {
    rank: 120,
    title: 'Largest Number',
    topic: 'Sorting',
    difficulty: 'Medium',
    premium: false,
    total: 17,
    companies: [
      {
        name: 'Amazon',
        count: 6,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Bloomberg',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/largest-number/',
    problemSlug: null,
  },
  {
    rank: 121,
    title: 'Invert/Flip Binary Tree',
    topic: 'Tree',
    difficulty: 'Easy',
    premium: false,
    total: 17,
    companies: [
      {
        name: 'Amazon',
        count: 5,
      },
      {
        name: 'Facebook',
        count: 5,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/invert-binary-tree/',
    problemSlug: null,
  },
  {
    rank: 122,
    title: 'Number of Connected Components in an Undirected Graph',
    topic: 'Graph',
    difficulty: 'Medium',
    premium: true,
    total: 16,
    companies: [
      {
        name: 'Amazon',
        count: 7,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Pinterest',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/number-of-connected-components-in-an-undirected-graph/',
    problemSlug: null,
  },
  {
    rank: 123,
    title: 'Meeting Rooms',
    topic: 'Interval',
    difficulty: 'Easy',
    premium: true,
    total: 15,
    companies: [
      {
        name: 'Microsoft',
        count: 6,
      },
      {
        name: 'Google',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 2,
      },
      {
        name: 'Facebook',
        count: 2,
      },
      {
        name: 'Bloomberg',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/meeting-rooms/',
    problemSlug: null,
  },
  {
    rank: 124,
    title: 'Encode and Decode Strings',
    topic: 'String',
    difficulty: 'Medium',
    premium: true,
    total: 15,
    companies: [
      {
        name: 'Google',
        count: 7,
      },
      {
        name: 'Facebook',
        count: 2,
      },
      {
        name: 'LinkedIn',
        count: 2,
      },
      {
        name: 'Square',
        count: 2,
      },
      {
        name: 'Uber',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/encode-and-decode-strings/',
    problemSlug: null,
  },
  {
    rank: 125,
    title: 'Construct Binary Tree from Preorder and Inorder Traversal',
    topic: 'Tree',
    difficulty: 'Medium',
    premium: false,
    total: 15,
    companies: [
      {
        name: 'Microsoft',
        count: 6,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Bloomberg',
        count: 2,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/construct-binary-tree-from-preorder-and-inorder-traversal/',
    problemSlug: null,
  },
  {
    rank: 126,
    title: 'Middle of the Linked-List',
    topic: 'Linked List',
    difficulty: 'Easy',
    premium: false,
    total: 14,
    companies: [
      {
        name: 'Apple',
        count: 4,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 2,
      },
      {
        name: 'Google',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/middle-of-the-linked-list/',
    problemSlug: null,
  },
  {
    rank: 127,
    title: 'Sum of Two Integers',
    topic: 'Binary-Bit Manipulation',
    difficulty: 'Medium',
    premium: false,
    total: 14,
    companies: [
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'TCS',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
      {
        name: 'Adobe',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/sum-of-two-integers/',
    problemSlug: null,
  },
  {
    rank: 128,
    title: 'Reverse Bits',
    topic: 'Binary-Bit Manipulation',
    difficulty: 'Easy',
    premium: false,
    total: 13,
    companies: [
      {
        name: 'Apple',
        count: 3,
      },
      {
        name: 'Facebook',
        count: 3,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 2,
      },
      {
        name: 'Qualcomm',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/reverse-bits/',
    problemSlug: null,
  },
  {
    rank: 129,
    title: 'Counting Bits',
    topic: 'Binary-Bit Manipulation',
    difficulty: 'Easy',
    premium: false,
    total: 12,
    companies: [
      {
        name: 'Bloomberg',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 3,
      },
      {
        name: 'Google',
        count: 2,
      },
      {
        name: 'Amazon',
        count: 2,
      },
      {
        name: 'Apple',
        count: 2,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/counting-bits/',
    problemSlug: null,
  },
  {
    rank: 130,
    title: 'Remove Interval',
    topic: 'Interval',
    difficulty: 'Medium',
    premium: false,
    total: 9,
    companies: [
      {
        name: 'Google',
        count: 5,
      },
      {
        name: 'Amazon',
        count: 3,
      },
      {
        name: 'Microsoft',
        count: 1,
      },
    ],
    leetcodeUrl: 'https://leetcode.com/problems/remove-interval/',
    problemSlug: null,
  },
]
