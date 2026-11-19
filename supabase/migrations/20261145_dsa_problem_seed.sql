-- ============================================================
-- ConnectToCampus — 20261145 DSA PROBLEM SEED
--
-- The Daily Challenge and the solve workspace need more than the
-- three starter problems: with three active rows the rotation repeats
-- every third day, and the problem list looks empty.
--
-- Twenty additional problems, all on the same stdin/stdout contract as
-- 015_dsa_compete.sql: each test case is {input, output}, the program
-- reads stdin and prints the answer. Examples are the public cases the
-- Run button executes; test_cases are hidden and only the judge reads them.
--
-- Idempotent: ON CONFLICT (slug) DO NOTHING, so re-running never
-- overwrites an edited problem or duplicates rows.
-- ============================================================

WITH starters AS (
  SELECT $sc${
    "python": "import sys\ndata = sys.stdin.read().splitlines()\n# TODO: compute and print the answer\n",
    "javascript": "const data = require(\"fs\").readFileSync(0, \"utf8\").trim().split(\"\\n\");\n// TODO: compute and print the answer\n",
    "cpp": "#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  string line;\n  while (getline(cin, line)) {\n    // TODO\n  }\n  return 0;\n}\n",
    "java": "import java.util.*;\n\npublic class Main {\n  public static void main(String[] args) {\n    Scanner sc = new Scanner(System.in);\n    // TODO\n  }\n}\n"
  }$sc$::jsonb AS starter
)
INSERT INTO public.dsa_problems
  (slug, title, difficulty, topics, description, constraints, examples, starter_code, test_cases)
SELECT
  v.slug, v.title, v.difficulty, v.topics, v.description, v.constraints,
  v.examples, s.starter, v.test_cases
FROM (VALUES
  (
    'reverse-string', 'Reverse String', 'easy', ARRAY['strings', 'two-pointers'],
    E'Read one line and print it reversed.\n\nINPUT\nOne line of text.\nOUTPUT\nThe same text backwards.',
    '1 <= length <= 10^4',
    $j$[{"input": "hello", "output": "olleh"}, {"input": "abc", "output": "cba"}]$j$::jsonb,
    $j$[{"input": "hello", "output": "olleh"}, {"input": "abc", "output": "cba"}, {"input": "a", "output": "a"}, {"input": "racecar", "output": "racecar"}, {"input": "hello world", "output": "dlrow olleh"}]$j$::jsonb
  ),
  (
    'palindrome-check', 'Palindrome Check', 'easy', ARRAY['strings', 'two-pointers'],
    E'Print true if the line reads the same forwards and backwards, otherwise false.\n\nINPUT\nOne line, exact characters (no case folding).\nOUTPUT\ntrue or false',
    '1 <= length <= 10^4',
    $j$[{"input": "racecar", "output": "true"}, {"input": "hello", "output": "false"}]$j$::jsonb,
    $j$[{"input": "racecar", "output": "true"}, {"input": "hello", "output": "false"}, {"input": "abba", "output": "true"}, {"input": "a", "output": "true"}, {"input": "abcba", "output": "true"}]$j$::jsonb
  ),
  (
    'count-vowels', 'Count Vowels', 'easy', ARRAY['strings'],
    E'Count how many lowercase vowels (a, e, i, o, u) appear in the line.\n\nINPUT\nOne line of lowercase text.\nOUTPUT\nA single integer.',
    '1 <= length <= 10^4',
    $j$[{"input": "hello", "output": "2"}, {"input": "xyz", "output": "0"}]$j$::jsonb,
    $j$[{"input": "hello", "output": "2"}, {"input": "aeiou", "output": "5"}, {"input": "xyz", "output": "0"}, {"input": "programming", "output": "3"}, {"input": "aeiouaeiou", "output": "10"}]$j$::jsonb
  ),
  (
    'second-largest', 'Second Largest', 'easy', ARRAY['arrays', 'sorting'],
    E'Given comma-separated integers, print the second largest DISTINCT value, or -1 if it does not exist.\n\nINPUT\nLine 1: integers separated by commas, e.g. 3,1,4,4,2\nOUTPUT\nOne integer.',
    '1 <= count <= 10^5, -10^9 <= value <= 10^9',
    $j$[{"input": "3,1,4,4,2", "output": "3"}, {"input": "5,5", "output": "-1"}]$j$::jsonb,
    $j$[{"input": "3,1,4,4,2", "output": "3"}, {"input": "5,5", "output": "-1"}, {"input": "1", "output": "-1"}, {"input": "-1,-2,-3", "output": "-2"}, {"input": "10,9,8", "output": "9"}]$j$::jsonb
  ),
  (
    'contains-duplicate', 'Contains Duplicate', 'easy', ARRAY['arrays', 'hashmap'],
    E'Print true if any value appears at least twice in the array, otherwise false.\n\nINPUT\nLine 1: array in JSON form, e.g. [1,2,3,1]\nOUTPUT\ntrue or false',
    '0 <= length <= 10^5',
    $j$[{"input": "[1,2,3,1]", "output": "true"}, {"input": "[1,2,3,4]", "output": "false"}]$j$::jsonb,
    $j$[{"input": "[1,2,3,1]", "output": "true"}, {"input": "[1,2,3,4]", "output": "false"}, {"input": "[]", "output": "false"}, {"input": "[7,7]", "output": "true"}, {"input": "[1,1,2]", "output": "true"}]$j$::jsonb
  ),
  (
    'climb-stairs', 'Climbing Stairs', 'easy', ARRAY['dynamic-programming'],
    E'You climb a staircase of n steps, taking 1 or 2 steps at a time. Print how many distinct ways you can reach the top.\n\nINPUT\nLine 1: n\nOUTPUT\nOne integer.',
    '1 <= n <= 45',
    $j$[{"input": "2", "output": "2"}, {"input": "3", "output": "3"}]$j$::jsonb,
    $j$[{"input": "2", "output": "2"}, {"input": "3", "output": "3"}, {"input": "1", "output": "1"}, {"input": "5", "output": "8"}, {"input": "10", "output": "89"}]$j$::jsonb
  ),
  (
    'single-number', 'Single Number', 'easy', ARRAY['bit-manipulation', 'arrays'],
    E'Every value appears twice except one. Print the value that appears once.\n\nINPUT\nLine 1: comma-separated integers\nOUTPUT\nOne integer.',
    '1 <= count <= 3*10^4',
    $j$[{"input": "2,2,1", "output": "1"}, {"input": "4,1,2,1,2", "output": "4"}]$j$::jsonb,
    $j$[{"input": "2,2,1", "output": "1"}, {"input": "4,1,2,1,2", "output": "4"}, {"input": "1", "output": "1"}, {"input": "-1,-1,-2", "output": "-2"}, {"input": "7,3,7", "output": "3"}]$j$::jsonb
  ),
  (
    'roman-to-integer', 'Roman to Integer', 'easy', ARRAY['strings', 'hashmap'],
    E'Convert a Roman numeral to an integer. Smaller values before larger ones are subtracted (IV = 4).\n\nINPUT\nLine 1: a valid Roman numeral\nOUTPUT\nOne integer.',
    '1 <= length <= 15',
    $j$[{"input": "III", "output": "3"}, {"input": "IV", "output": "4"}]$j$::jsonb,
    $j$[{"input": "III", "output": "3"}, {"input": "IV", "output": "4"}, {"input": "IX", "output": "9"}, {"input": "LVIII", "output": "58"}, {"input": "MCMXCIV", "output": "1994"}]$j$::jsonb
  ),
  (
    'longest-substring', 'Longest Substring Without Repeating Characters', 'medium', ARRAY['strings', 'sliding-window'],
    E'Find the length of the longest substring with no repeated character.\n\nINPUT\nLine 1: the string\nOUTPUT\nOne integer.',
    '1 <= length <= 5*10^4',
    $j$[{"input": "abcabcbb", "output": "3"}, {"input": "bbbbb", "output": "1"}]$j$::jsonb,
    $j$[{"input": "abcabcbb", "output": "3"}, {"input": "bbbbb", "output": "1"}, {"input": "pwwkew", "output": "3"}, {"input": "dvdf", "output": "3"}, {"input": "abcd", "output": "4"}]$j$::jsonb
  ),
  (
    'product-except-self', 'Product of Array Except Self', 'medium', ARRAY['arrays', 'prefix-sum'],
    E'For each position, print the product of every other element. Division is not allowed in the intended solution.\n\nINPUT\nLine 1: array in JSON form\nOUTPUT\nArray in JSON form, e.g. [24,12,8,6]',
    '2 <= length <= 10^5',
    $j$[{"input": "[1,2,3,4]", "output": "[24,12,8,6]"}, {"input": "[-1,1,0,-3,3]", "output": "[0,0,9,0,0]"}]$j$::jsonb,
    $j$[{"input": "[1,2,3,4]", "output": "[24,12,8,6]"}, {"input": "[-1,1,0,-3,3]", "output": "[0,0,9,0,0]"}, {"input": "[2,3]", "output": "[3,2]"}, {"input": "[0,0]", "output": "[0,0]"}, {"input": "[5]", "output": "[1]"}]$j$::jsonb
  ),
  (
    'kth-largest', 'Kth Largest Element', 'medium', ARRAY['arrays', 'heap'],
    E'Print the k-th largest value in the list (counting duplicates).\n\nINPUT\nLine 1: comma-separated integers\nLine 2: k\nOUTPUT\nOne integer.',
    '1 <= k <= count <= 10^5',
    $j$[{"input": "3,2,1,5,6,4\n2", "output": "5"}, {"input": "3,2,3,1,2,4,5,5,6\n4", "output": "4"}]$j$::jsonb,
    $j$[{"input": "3,2,1,5,6,4\n2", "output": "5"}, {"input": "3,2,3,1,2,4,5,5,6\n4", "output": "4"}, {"input": "1\n1", "output": "1"}, {"input": "7,7,7\n2", "output": "7"}, {"input": "-1,-2\n2", "output": "-2"}]$j$::jsonb
  ),
  (
    'coin-change', 'Coin Change', 'medium', ARRAY['dynamic-programming', 'greedy'],
    E'Find the fewest coins needed to make the amount. Print -1 if it is impossible.\n\nINPUT\nLine 1: coin denominations, comma-separated\nLine 2: amount\nOUTPUT\nOne integer.',
    '1 <= coins <= 12, 0 <= amount <= 10^4',
    $j$[{"input": "1,2,5\n11", "output": "3"}, {"input": "2\n3", "output": "-1"}]$j$::jsonb,
    $j$[{"input": "1,2,5\n11", "output": "3"}, {"input": "2\n3", "output": "-1"}, {"input": "1\n0", "output": "0"}, {"input": "1,3,4\n6", "output": "2"}, {"input": "2,5,10,1\n27", "output": "4"}]$j$::jsonb
  ),
  (
    'merge-intervals', 'Merge Intervals', 'medium', ARRAY['arrays', 'sorting'],
    E'Merge all overlapping intervals and print the result sorted by start.\n\nINPUT\nLine 1: intervals in JSON form, e.g. [[1,3],[2,6]]\nOUTPUT\nMerged intervals in JSON form',
    '0 <= count <= 10^4',
    $j$[{"input": "[[1,3],[2,6],[8,10],[15,18]]", "output": "[[1,6],[8,10],[15,18]]"}, {"input": "[[1,4],[4,5]]", "output": "[[1,5]]"}]$j$::jsonb,
    $j$[{"input": "[[1,3],[2,6],[8,10],[15,18]]", "output": "[[1,6],[8,10],[15,18]]"}, {"input": "[[1,4],[4,5]]", "output": "[[1,5]]"}, {"input": "[[1,4],[0,4]]", "output": "[[0,4]]"}, {"input": "[[1,2]]", "output": "[[1,2]]"}, {"input": "[[2,3],[4,5],[6,7],[8,9],[1,10]]", "output": "[[1,10]]"}]$j$::jsonb
  ),
  (
    'valid-anagram', 'Valid Anagram', 'medium', ARRAY['strings', 'hashmap'],
    E'Print true if the second line is an anagram of the first (same letters, same counts).\n\nINPUT\nLine 1: first word\nLine 2: second word\nOUTPUT\ntrue or false',
    '1 <= length <= 5*10^4',
    $j$[{"input": "anagram\nnagaram", "output": "true"}, {"input": "rat\ncar", "output": "false"}]$j$::jsonb,
    $j$[{"input": "anagram\nnagaram", "output": "true"}, {"input": "rat\ncar", "output": "false"}, {"input": "a\na", "output": "true"}, {"input": "ab\nba", "output": "true"}, {"input": "abc\nabd", "output": "false"}]$j$::jsonb
  ),
  (
    'rotate-array', 'Rotate Array', 'medium', ARRAY['arrays'],
    E'Rotate the array to the right by k steps and print the result.\n\nINPUT\nLine 1: array in JSON form\nLine 2: k\nOUTPUT\nRotated array in JSON form',
    '0 <= length <= 10^5, 0 <= k <= 10^5',
    $j$[{"input": "[1,2,3,4,5,6,7]\n3", "output": "[5,6,7,1,2,3,4]"}, {"input": "[-1,-100,3,99]\n2", "output": "[3,99,-1,-100]"}]$j$::jsonb,
    $j$[{"input": "[1,2,3,4,5,6,7]\n3", "output": "[5,6,7,1,2,3,4]"}, {"input": "[-1,-100,3,99]\n2", "output": "[3,99,-1,-100]"}, {"input": "[1]\n0", "output": "[1]"}, {"input": "[1,2]\n3", "output": "[2,1]"}, {"input": "[1,2,3]\n3", "output": "[1,2,3]"}]$j$::jsonb
  ),
  (
    'longest-increasing-subsequence', 'Longest Increasing Subsequence', 'medium', ARRAY['dynamic-programming', 'binary-search'],
    E'Print the length of the longest strictly increasing subsequence.\n\nINPUT\nLine 1: comma-separated integers\nOUTPUT\nOne integer.',
    '1 <= length <= 2500',
    $j$[{"input": "10,9,2,5,3,7,101,18", "output": "4"}, {"input": "7,7,7,7", "output": "1"}]$j$::jsonb,
    $j$[{"input": "10,9,2,5,3,7,101,18", "output": "4"}, {"input": "7,7,7,7", "output": "1"}, {"input": "0,1,0,3,2,3", "output": "4"}, {"input": "1", "output": "1"}, {"input": "3,10,2,1,20", "output": "3"}]$j$::jsonb
  ),
  (
    'trapping-rain-water', 'Trapping Rain Water', 'hard', ARRAY['arrays', 'two-pointers'],
    E'Given elevation bars, print how much rain water they can trap.\n\nINPUT\nLine 1: heights in JSON form\nOUTPUT\nOne integer.',
    '0 <= length <= 2*10^4, 0 <= height <= 10^5',
    $j$[{"input": "[0,1,0,2,1,0,1,3,2,1,2,1]", "output": "6"}, {"input": "[4,2,0,3,2,5]", "output": "9"}]$j$::jsonb,
    $j$[{"input": "[0,1,0,2,1,0,1,3,2,1,2,1]", "output": "6"}, {"input": "[4,2,0,3,2,5]", "output": "9"}, {"input": "[]", "output": "0"}, {"input": "[5]", "output": "0"}, {"input": "[2,0,2]", "output": "2"}]$j$::jsonb
  ),
  (
    'median-two-sorted-arrays', 'Median of Two Sorted Arrays', 'hard', ARRAY['arrays', 'binary-search'],
    E'Print the median of two sorted arrays. The intended solution runs in O(log(min(n,m))).\n\nINPUT\nLine 1: sorted integers, comma-separated\nLine 2: sorted integers, comma-separated\nOUTPUT\nOne number (fractional medians allowed)',
    '0 <= n, m <= 10^4',
    $j$[{"input": "1,3\n2", "output": "2"}, {"input": "1,2\n3,4", "output": "2.5"}]$j$::jsonb,
    $j$[{"input": "1,3\n2", "output": "2"}, {"input": "1,2\n3,4", "output": "2.5"}, {"input": "1,2\n3", "output": "2"}, {"input": "1\n2,3,4", "output": "2.5"}, {"input": "0,0\n0,0", "output": "0"}]$j$::jsonb
  ),
  (
    'edit-distance', 'Edit Distance', 'hard', ARRAY['dynamic-programming', 'strings'],
    E'Print the minimum number of insertions, deletions or replacements needed to turn the first word into the second.\n\nINPUT\nLine 1: source word\nLine 2: target word\nOUTPUT\nOne integer.',
    '0 <= length <= 500',
    $j$[{"input": "horse\nros", "output": "3"}, {"input": "intention\nexecution", "output": "5"}]$j$::jsonb,
    $j$[{"input": "horse\nros", "output": "3"}, {"input": "intention\nexecution", "output": "5"}, {"input": "abc\nabc", "output": "0"}, {"input": "abc\n", "output": "3"}, {"input": "kitten\nsitting", "output": "3"}]$j$::jsonb
  ),
  (
    'n-queens-count', 'N-Queens Count', 'hard', ARRAY['backtracking'],
    E'Place n queens on an n x n board so that no two attack each other. Print the number of distinct solutions.\n\nINPUT\nLine 1: n\nOUTPUT\nOne integer.',
    '1 <= n <= 9',
    $j$[{"input": "4", "output": "2"}, {"input": "1", "output": "1"}]$j$::jsonb,
    $j$[{"input": "4", "output": "2"}, {"input": "1", "output": "1"}, {"input": "5", "output": "10"}, {"input": "8", "output": "92"}, {"input": "2", "output": "0"}]$j$::jsonb
  )
) AS v(slug, title, difficulty, topics, description, constraints, examples, test_cases)
CROSS JOIN starters s
ON CONFLICT (slug) DO NOTHING;
