-- ============================================================
-- ConnectToCampus — 20261148 DSA LEETCODE STATEMENTS
--
-- The workspace now grades a function, so statements are phrased the way
-- LeetCode phrases them: a task sentence that names the parameters, worked
-- examples and a constraint list — no INPUT/OUTPUT or "print" instructions.
--
-- Example rows keep their raw input/output (the judge feeds that input to
-- the hidden driver); input_display is what the statement renders.
--
-- Data-only migration: no schema change. Idempotent (plain UPDATEs).
-- ============================================================

UPDATE public.dsa_problems SET
  description = $txt$Write a function that reverses the characters of a string `s` and returns the reversed string.$txt$,
  constraints = $txt$1 <= s.length <= 10^4
s consists of printable ASCII characters$txt$,
  examples = $ex$[{"input":"hello","output":"olleh","input_display":"s = \"hello\"","explanation":"The characters reversed are \"olleh\"."},{"input":"abc","output":"cba","input_display":"s = \"abc\"","explanation":"The characters reversed are \"cba\"."}]$ex$::jsonb
WHERE slug = 'reverse-string';

UPDATE public.dsa_problems SET
  description = $txt$Given a string `s` containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

An input string is valid if:

1. Open brackets are closed by the same type of bracket.
2. Open brackets are closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.$txt$,
  constraints = $txt$1 <= s.length <= 10^4
s consists only of the characters '()[]{}'$txt$,
  examples = $ex$[{"input":"()[]{}","output":"true","input_display":"s = \"()[]{}\"","explanation":"Each pair is opened and closed in the correct order."},{"input":"(]","output":"false","input_display":"s = \"(]\"","explanation":"A parenthesis is closed by a square bracket, so the string is invalid."}]$ex$::jsonb
WHERE slug = 'valid-parentheses';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums`, find the subarray with the largest sum and return that sum.$txt$,
  constraints = $txt$1 <= nums.length <= 10^5
-10^4 <= nums[i] <= 10^4$txt$,
  examples = $ex$[{"input":"-2,1,-3,4,-1,2,1,-5,4","output":"6","input_display":"nums = [-2,1,-3,4,-1,2,1,-5,4]","explanation":"The subarray [4,-1,2,1] has the largest sum, 6."},{"input":"1","output":"1","input_display":"nums = [1]","explanation":"The best subarray is [1], with sum 1."}]$ex$::jsonb
WHERE slug = 'max-subarray';

UPDATE public.dsa_problems SET
  description = $txt$Given a string `s`, return `true` if it reads the same forwards and backwards, otherwise return `false`.

Characters are compared exactly — no case folding and no skipping of spaces.$txt$,
  constraints = $txt$1 <= s.length <= 10^4
s consists of lowercase English letters$txt$,
  examples = $ex$[{"input":"racecar","output":"true","input_display":"s = \"racecar\"","explanation":"Reversed it is still \"racecar\", so the answer is true."},{"input":"hello","output":"false","input_display":"s = \"hello\"","explanation":"Reversed it is \"olleh\", so the answer is false."}]$ex$::jsonb
WHERE slug = 'palindrome-check';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums`, return the second largest distinct value in the array. If it does not exist, return -1.$txt$,
  constraints = $txt$1 <= nums.length <= 10^5
-10^9 <= nums[i] <= 10^9$txt$,
  examples = $ex$[{"input":"3,1,4,4,2","output":"3","input_display":"nums = [3,1,4,4,2]","explanation":"The distinct values are 4, 3, 2 and 1; the second largest is 3."},{"input":"5,5","output":"-1","input_display":"nums = [5,5]","explanation":"There is only one distinct value, so return -1."}]$ex$::jsonb
WHERE slug = 'second-largest';

UPDATE public.dsa_problems SET
  description = $txt$You are climbing a staircase with `n` steps to reach the top.

Each time you can climb either 1 or 2 steps. In how many distinct ways can you climb to the top?$txt$,
  constraints = $txt$1 <= n <= 45$txt$,
  examples = $ex$[{"input":"2","output":"2","input_display":"n = 2","explanation":"There are two ways: 1 + 1 and 2."},{"input":"3","output":"3","input_display":"n = 3","explanation":"There are three ways: 1 + 1 + 1, 1 + 2 and 2 + 1."}]$ex$::jsonb
WHERE slug = 'climb-stairs';

UPDATE public.dsa_problems SET
  description = $txt$Given a non-empty array of integers `nums`, every element appears twice except for one. Return the element that appears once.

Your solution should run in linear time and use constant extra space.$txt$,
  constraints = $txt$1 <= nums.length <= 3*10^4
-3*10^4 <= nums[i] <= 3*10^4
Every element appears twice except for one, which appears once$txt$,
  examples = $ex$[{"input":"2,2,1","output":"1","input_display":"nums = [2,2,1]","explanation":"2 appears twice and 1 appears once, so return 1."},{"input":"4,1,2,1,2","output":"4","input_display":"nums = [4,1,2,1,2]","explanation":"1 and 2 appear twice; 4 appears once, so return 4."}]$ex$::jsonb
WHERE slug = 'single-number';

UPDATE public.dsa_problems SET
  description = $txt$Roman numerals use seven symbols: I (1), V (5), X (10), L (50), C (100), D (500) and M (1000).

Given a Roman numeral `s`, convert it to an integer.

Subtractive notation is used when a smaller numeral appears before a larger one: IV = 4, IX = 9, XL = 40, XC = 90, CD = 400 and CM = 900.$txt$,
  constraints = $txt$1 <= s.length <= 15
s contains only the characters 'I', 'V', 'X', 'L', 'C', 'D' and 'M'
s is a valid Roman numeral in the range [1, 3999]$txt$,
  examples = $ex$[{"input":"III","output":"3","input_display":"s = \"III\"","explanation":"III = 1 + 1 + 1 = 3."},{"input":"IV","output":"4","input_display":"s = \"IV\"","explanation":"IV = 5 - 1 = 4."}]$ex$::jsonb
WHERE slug = 'roman-to-integer';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums`, return an array `answer` such that `answer[i]` is the product of every element of `nums` except `nums[i]`.

The intended solution runs in O(n) time and does not use division.$txt$,
  constraints = $txt$2 <= nums.length <= 10^5
-30 <= nums[i] <= 30
The product of any prefix or suffix of nums fits in a 32-bit integer$txt$,
  examples = $ex$[{"input":"[1,2,3,4]","output":"[24,12,8,6]","input_display":"nums = [1,2,3,4]","explanation":"answer[0] = 2*3*4 = 24, answer[1] = 1*3*4 = 12, answer[2] = 1*2*4 = 8 and answer[3] = 1*2*3 = 6."},{"input":"[-1,1,0,-3,3]","output":"[0,0,9,0,0]","input_display":"nums = [-1,1,0,-3,3]","explanation":"Any answer that includes the zero is 0; the rest are non-zero products."}]$ex$::jsonb
WHERE slug = 'product-except-self';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums` and an integer `k`, return the k-th largest element in the array.

Note that it is the k-th largest element in sorted order, not the k-th distinct element.$txt$,
  constraints = $txt$1 <= k <= nums.length <= 10^5
-10^4 <= nums[i] <= 10^4$txt$,
  examples = $ex$[{"input":"3,2,1,5,6,4\n2","output":"5","input_display":"nums = [3,2,1,5,6,4], k = 2","explanation":"Sorted descending: 6, 5, 4, 3, 2, 1. The 2nd largest is 5."},{"input":"3,2,3,1,2,4,5,5,6\n4","output":"4","input_display":"nums = [3,2,3,1,2,4,5,5,6], k = 4","explanation":"Sorted descending: 6, 5, 5, 4, 3, 3, 2, 2, 1. The 4th largest is 4."}]$ex$::jsonb
WHERE slug = 'kth-largest';

UPDATE public.dsa_problems SET
  description = $txt$Given an array of `intervals` where `intervals[i] = [start_i, end_i]`, merge all overlapping intervals and return an array of the non-overlapping intervals that cover every input interval.$txt$,
  constraints = $txt$0 <= intervals.length <= 10^4
intervals[i].length == 2
0 <= start_i <= end_i <= 10^4$txt$,
  examples = $ex$[{"input":"[[1,3],[2,6],[8,10],[15,18]]","output":"[[1,6],[8,10],[15,18]]","input_display":"intervals = [[1,3],[2,6],[8,10],[15,18]]","explanation":"[1,3] and [2,6] overlap and merge into [1,6]; the rest do not overlap."},{"input":"[[1,4],[4,5]]","output":"[[1,5]]","input_display":"intervals = [[1,4],[4,5]]","explanation":"[1,4] and [4,5] touch, so they merge into [1,5]."}]$ex$::jsonb
WHERE slug = 'merge-intervals';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums`, return the length of the longest strictly increasing subsequence.$txt$,
  constraints = $txt$1 <= nums.length <= 2500
-10^4 <= nums[i] <= 10^4$txt$,
  examples = $ex$[{"input":"10,9,2,5,3,7,101,18","output":"4","input_display":"nums = [10,9,2,5,3,7,101,18]","explanation":"The longest increasing subsequence is [2,3,7,101], with length 4."},{"input":"7,7,7,7","output":"1","input_display":"nums = [7,7,7,7]","explanation":"The subsequence must be strictly increasing, so only one element can be chosen."}]$ex$::jsonb
WHERE slug = 'longest-increasing-subsequence';

UPDATE public.dsa_problems SET
  description = $txt$Given `n` non-negative integers `height` representing an elevation map where each bar has width 1, return how much water it can trap after raining.$txt$,
  constraints = $txt$0 <= height.length <= 2*10^4
0 <= height[i] <= 10^5$txt$,
  examples = $ex$[{"input":"[0,1,0,2,1,0,1,3,2,1,2,1]","output":"6","input_display":"height = [0,1,0,2,1,0,1,3,2,1,2,1]","explanation":"The map traps 6 units of water."},{"input":"[4,2,0,3,2,5]","output":"9","input_display":"height = [4,2,0,3,2,5]","explanation":"The map traps 9 units of water."}]$ex$::jsonb
WHERE slug = 'trapping-rain-water';

UPDATE public.dsa_problems SET
  description = $txt$Given two sorted arrays `nums1` and `nums2` of sizes `m` and `n`, return the median of the two sorted arrays.

The overall run time complexity should be O(log (m+n)).$txt$,
  constraints = $txt$0 <= m, n <= 10^4
1 <= m + n <= 2*10^4
-10^6 <= nums1[i], nums2[i] <= 10^6$txt$,
  examples = $ex$[{"input":"1,3\n2","output":"2","input_display":"nums1 = [1,3], nums2 = [2]","explanation":"The merged array is [1,2,3], so the median is 2."},{"input":"1,2\n3,4","output":"2.5","input_display":"nums1 = [1,2], nums2 = [3,4]","explanation":"The merged array is [1,2,3,4], so the median is (2 + 3) / 2 = 2.5."}]$ex$::jsonb
WHERE slug = 'median-two-sorted-arrays';

UPDATE public.dsa_problems SET
  description = $txt$The n-queens puzzle asks you to place `n` queens on an `n x n` chessboard so that no two queens attack each other.

Given an integer `n`, return the number of distinct solutions to the puzzle.$txt$,
  constraints = $txt$1 <= n <= 9$txt$,
  examples = $ex$[{"input":"4","output":"2","input_display":"n = 4","explanation":"There are two distinct solutions for a 4 x 4 board."},{"input":"1","output":"1","input_display":"n = 1","explanation":"A single queen alone on a 1 x 1 board is a valid solution."}]$ex$::jsonb
WHERE slug = 'n-queens-count';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.

You may assume that each input has exactly one solution, and you may not use the same element twice.

You can return the answer in any order.$txt$,
  constraints = $txt$2 <= nums.length <= 10^4
-10^9 <= nums[i] <= 10^9
-10^9 <= target <= 10^9
Exactly one valid answer exists$txt$,
  examples = $ex$[{"input":"[2,7,11,15]\n9","output":"[0,1]","input_display":"nums = [2,7,11,15], target = 9","explanation":"Because nums[0] + nums[1] == 9, we return [0,1]."},{"input":"[3,2,4]\n6","output":"[1,2]","input_display":"nums = [3,2,4], target = 6","explanation":"nums[1] + nums[2] == 6, so we return [1,2]."}]$ex$::jsonb
WHERE slug = 'two-sum';

UPDATE public.dsa_problems SET
  description = $txt$Given a string `s`, return the number of lowercase vowels ('a', 'e', 'i', 'o', 'u') it contains.$txt$,
  constraints = $txt$1 <= s.length <= 10^4
s consists of lowercase English letters$txt$,
  examples = $ex$[{"input":"hello","output":"2","input_display":"s = \"hello\"","explanation":"'e' and 'o' are vowels, so the answer is 2."},{"input":"xyz","output":"0","input_display":"s = \"xyz\"","explanation":"There are no vowels, so the answer is 0."}]$ex$::jsonb
WHERE slug = 'count-vowels';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums`, return `true` if any value appears at least twice in the array, and `false` if every element is distinct.$txt$,
  constraints = $txt$0 <= nums.length <= 10^5
-10^9 <= nums[i] <= 10^9$txt$,
  examples = $ex$[{"input":"[1,2,3,1]","output":"true","input_display":"nums = [1,2,3,1]","explanation":"1 appears twice, so the answer is true."},{"input":"[1,2,3,4]","output":"false","input_display":"nums = [1,2,3,4]","explanation":"All values are distinct, so the answer is false."}]$ex$::jsonb
WHERE slug = 'contains-duplicate';

UPDATE public.dsa_problems SET
  description = $txt$Given a string `s`, find the length of the longest substring without repeating characters.$txt$,
  constraints = $txt$1 <= s.length <= 5*10^4
s consists of English letters, digits, symbols and spaces$txt$,
  examples = $ex$[{"input":"abcabcbb","output":"3","input_display":"s = \"abcabcbb\"","explanation":"The longest substring without repeating characters is \"abc\", with length 3."},{"input":"bbbbb","output":"1","input_display":"s = \"bbbbb\"","explanation":"The longest substring is \"b\", with length 1."}]$ex$::jsonb
WHERE slug = 'longest-substring';

UPDATE public.dsa_problems SET
  description = $txt$You are given an integer array `coins` of coin denominations and an integer `amount`.

Return the fewest number of coins needed to make up `amount`. If the amount cannot be made up by any combination of the coins, return -1.

You may assume you have an infinite number of each kind of coin.$txt$,
  constraints = $txt$1 <= coins.length <= 12
1 <= coins[i] <= 2^31 - 1
0 <= amount <= 10^4$txt$,
  examples = $ex$[{"input":"1,2,5\n11","output":"3","input_display":"coins = [1,2,5], amount = 11","explanation":"11 = 5 + 5 + 1, so three coins are needed."},{"input":"2\n3","output":"-1","input_display":"coins = [2], amount = 3","explanation":"3 cannot be made from 2-coins, so return -1."}]$ex$::jsonb
WHERE slug = 'coin-change';

UPDATE public.dsa_problems SET
  description = $txt$Given two strings `s` and `t`, return `true` if `t` is an anagram of `s`, and `false` otherwise.

An anagram is a word formed by rearranging the letters of another word, using all the original letters exactly once.$txt$,
  constraints = $txt$1 <= s.length, t.length <= 5*10^4
s and t consist of lowercase English letters$txt$,
  examples = $ex$[{"input":"anagram\nnagaram","output":"true","input_display":"s = \"anagram\", t = \"nagaram\"","explanation":"Both words use the same letters with the same counts."},{"input":"rat\ncar","output":"false","input_display":"s = \"rat\", t = \"car\"","explanation":"The letter counts differ, so the answer is false."}]$ex$::jsonb
WHERE slug = 'valid-anagram';

UPDATE public.dsa_problems SET
  description = $txt$Given an integer array `nums`, rotate the array to the right by `k` steps and return the rotated array.$txt$,
  constraints = $txt$0 <= nums.length <= 10^5
-2^31 <= nums[i] <= 2^31 - 1
0 <= k <= 10^5$txt$,
  examples = $ex$[{"input":"[1,2,3,4,5,6,7]\n3","output":"[5,6,7,1,2,3,4]","input_display":"nums = [1,2,3,4,5,6,7], k = 3","explanation":"Rotating right by 3 gives [5,6,7,1,2,3,4]."},{"input":"[-1,-100,3,99]\n2","output":"[3,99,-1,-100]","input_display":"nums = [-1,-100,3,99], k = 2","explanation":"Rotating right by 2 gives [3,99,-1,-100]."}]$ex$::jsonb
WHERE slug = 'rotate-array';

UPDATE public.dsa_problems SET
  description = $txt$Given two strings `word1` and `word2`, return the minimum number of operations required to convert `word1` into `word2`.

The following three operations are permitted on a word:

- Insert a character
- Delete a character
- Replace a character$txt$,
  constraints = $txt$0 <= word1.length, word2.length <= 500
word1 and word2 consist of lowercase English letters$txt$,
  examples = $ex$[{"input":"horse\nros","output":"3","input_display":"word1 = \"horse\", word2 = \"ros\"","explanation":"horse → rorse (replace) → rose (delete) → ros (delete): 3 operations."},{"input":"intention\nexecution","output":"5","input_display":"word1 = \"intention\", word2 = \"execution\"","explanation":"Five operations are required."}]$ex$::jsonb
WHERE slug = 'edit-distance';
