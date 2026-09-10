-- ============================================================
-- CampusConnect — 015 DSA COMPETE
-- Daily DSA challenges + fixed-time "Campus Clash" contests.
-- Hidden test cases live server-side; the judge (API route) runs
-- user code against them — never exposes expected outputs to UI.
--
-- CONTRACT (CodeChef-style): a program reads input from stdin and
-- prints the answer to stdout. Each test_case = {input, output}.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DSA problems
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dsa_problems (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  difficulty    TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  topics        TEXT[] NOT NULL DEFAULT '{}',
  description   TEXT NOT NULL,
  constraints   TEXT,
  examples      JSONB NOT NULL DEFAULT '[]',     -- [{input, output, explanation}]
  starter_code  JSONB NOT NULL DEFAULT '{}',     -- {python: '...', javascript: '...', cpp: '...', java: '...'}
  test_cases    JSONB NOT NULL DEFAULT '[]',     -- ★ HIDDEN [{input, output}] — never sent to client
  time_limit_ms INT NOT NULL DEFAULT 3000,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsa_problems_difficulty ON public.dsa_problems (difficulty, created_at DESC);

-- ------------------------------------------------------------
-- 2. Submissions — one row per run, verdicted by the judge
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dsa_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  problem_id    UUID NOT NULL REFERENCES public.dsa_problems(id) ON DELETE CASCADE,
  contest_id    UUID,                            -- set when part of a contest
  language      TEXT NOT NULL,
  code          TEXT NOT NULL,
  verdict       TEXT NOT NULL CHECK (verdict IN ('accepted', 'wrong_answer', 'time_limit', 'runtime_error', 'compile_error')),
  passed        INT NOT NULL DEFAULT 0,
  total         INT NOT NULL DEFAULT 0,
  runtime_ms    INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dsa_sub_user    ON public.dsa_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsa_sub_problem ON public.dsa_submissions (problem_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dsa_sub_verdict ON public.dsa_submissions (verdict, created_at DESC);

-- Anti-flood: no more than 12 submissions per user per problem per hour
CREATE OR REPLACE FUNCTION public.dsa_rate_limit(p_problem_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*) < 12 FROM public.dsa_submissions
   WHERE user_id = auth.uid() AND problem_id = p_problem_id
     AND created_at >= now() - interval '1 hour';
$$;
REVOKE EXECUTE ON FUNCTION public.dsa_rate_limit(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.dsa_rate_limit(UUID) TO authenticated;

-- A problem is "solved" by a user if any accepted submission exists
CREATE OR REPLACE FUNCTION public.dsa_solved(p_problem_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dsa_submissions
     WHERE user_id = auth.uid() AND problem_id = p_problem_id AND verdict = 'accepted'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.dsa_solved(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.dsa_solved(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. Contests — fixed time window (e.g. every Sat 9 PM, 60 min)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  problems      UUID[] NOT NULL DEFAULT '{}',    -- ordered problem ids
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_contests_status ON public.contests (status, starts_at DESC);

-- Registration (optional but drives pre-commitment)
CREATE TABLE IF NOT EXISTS public.contest_registrations (
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id)
);

-- ------------------------------------------------------------
-- 4. Daily challenge pointer — one "Today's Problem" per day
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  day        DATE PRIMARY KEY,
  problem_id UUID NOT NULL REFERENCES public.dsa_problems(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. Seed problems — stdin/stdout contract, hidden test cases
-- ------------------------------------------------------------
INSERT INTO public.dsa_problems
  (slug, title, difficulty, topics, description, constraints, examples, starter_code, test_cases)
VALUES
(
  'two-sum', 'Two Sum', 'easy', ARRAY['arrays','hashmap'],
  E'Given an array of integers and a target, return the indices of the two numbers that add up to target (any valid order).\n\nINPUT\nLine 1: array in JSON form, e.g. [2,7,11,15]\nLine 2: target integer\n\nOUTPUT\nPrint the two indices as [i,j]\n\nEXAMPLE\nInput:\n[2,7,11,15]\n9\nOutput:\n[0,1]',
  '2 <= len <= 10^4, -10^9 <= nums[i] <= 10^9',
  '[{"input": "[2,7,11,15]\\n9", "output": "[0,1]"}, {"input": "[3,2,4]\\n6", "output": "[1,2]"}]',
  '{"python": "import sys\\nnums = eval(sys.stdin.readline().strip())\\ntarget = int(sys.stdin.readline())\\n# TODO: solve and print result", "javascript": "const input = require(\"fs\").readFileSync(0, \"utf8\").trim().split(\"\\n\");\\nconst nums = JSON.parse(input[0]);\\nconst target = Number(input[1]);\\n// TODO: solve and print result", "cpp": "#include <bits/stdc++.h>\\nusing namespace std;\\nint main(){ string line; getline(cin, line); /* TODO */ }", "java": "import java.util.*;\\npublic class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); /* TODO */ } }"}',
  '[{"input": "[2,7,11,15]\\n9", "output": "[0,1]"}, {"input": "[3,2,4]\\n6", "output": "[1,2]"}, {"input": "[3,3]\\n6", "output": "[0,1]"}, {"input": "[-3,4,3,90]\\n0", "output": "[0,2]"}]'
),
(
  'valid-parentheses', 'Valid Parentheses', 'easy', ARRAY['stack','string'],
  E'Given a string of brackets ()[]{}, determine if it is valid: every open bracket is closed by the same type in the correct order.\n\nINPUT\nLine 1: the bracket string (no spaces)\n\nOUTPUT\nPrint true or false\n\nEXAMPLE\nInput:\n()[]{}\nOutput:\ntrue',
  '1 <= len <= 10^4',
  '[{"input": "()[]{}", "output": "true"}, {"input": "(]", "output": "false"}]',
  '{"python": "import sys\\ns = sys.stdin.readline().strip()\\n# TODO: solve and print result", "javascript": "const s = require(\"fs\").readFileSync(0, \"utf8\").trim();\\n// TODO: solve and print result", "cpp": "#include <bits/stdc++.h>\\nusing namespace std;\\nint main(){ string s; getline(cin, s); /* TODO */ }", "java": "import java.util.*;\\npublic class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); String s = sc.nextLine(); /* TODO */ } }"}',
  '[{"input": "()", "output": "true"}, {"input": "()[]{}", "output": "true"}, {"input": "(]", "output": "false"}, {"input": "([)]", "output": "false"}, {"input": "{[]}", "output": "true"}]'
),
(
  'max-subarray', 'Maximum Subarray', 'medium', ARRAY['arrays','dynamic-programming'],
  E'Find the contiguous subarray with the largest sum and return that sum.\n\nINPUT\nLine 1: comma-separated integers, e.g. -2,1,-3,4\n\nOUTPUT\nPrint the maximum subarray sum\n\nEXAMPLE\nInput:\n-2,1,-3,4,-1,2,1,-5,4\nOutput:\n6',
  '1 <= len <= 10^5, -10^4 <= nums[i] <= 10^4',
  '[{"input": "-2,1,-3,4,-1,2,1,-5,4", "output": "6"}, {"input": "1", "output": "1"}]',
  '{"python": "import sys\\nnums = [int(x) for x in sys.stdin.readline().strip().split(\",\")]\\n# TODO: solve and print result", "javascript": "const nums = require(\"fs\").readFileSync(0, \"utf8\").trim().split(\",\").map(Number);\\n// TODO: solve and print result", "cpp": "#include <bits/stdc++.h>\\nusing namespace std;\\nint main(){ string line; getline(cin, line); /* TODO */ }", "java": "import java.util.*;\\npublic class Main { public static void main(String[] args) { Scanner sc = new Scanner(System.in); /* TODO */ } }"}',
  '[{"input": "-2,1,-3,4,-1,2,1,-5,4", "output": "6"}, {"input": "1", "output": "1"}, {"input": "5,4,-1,7,8", "output": "23"}, {"input": "-1", "output": "-1"}]'
)
ON CONFLICT (slug) DO NOTHING;

-- Seed today's challenge with the first problem
INSERT INTO public.daily_challenges (day, problem_id)
SELECT CURRENT_DATE, id FROM public.dsa_problems WHERE slug = 'two-sum'
ON CONFLICT (day) DO NOTHING;
