// ═══════════════════════════════════════════════════════════════════════════
// Hidden test driver ("LeetCode style").
//
// The student sees and edits only a function stub. `wrapForJudge` appends a
// generated driver — reading the hidden test input, calling that function and
// printing the normalized result — **on the server**, so the driver and the
// hidden inputs are never part of the code sent to the browser.
//
// `buildStarter` produces the visible stub from the same contract, so the two
// halves can never disagree about the entry point or its signature.
// ═══════════════════════════════════════════════════════════════════════════

import type { JudgeContract, ParamType, ReturnType } from './contracts'

export type JudgeLanguage = 'python' | 'javascript' | 'cpp' | 'java'

const PY_TYPE: Record<ParamType | ReturnType, string> = {
  int: 'int',
  string: 'str',
  int_list: 'List[int]',
  int_matrix: 'List[List[int]]',
  bool: 'bool',
  float: 'float',
}

const JS_DOC: Record<ParamType | ReturnType, string> = {
  int: 'number',
  string: 'string',
  int_list: 'number[]',
  int_matrix: 'number[][]',
  bool: 'boolean',
  float: 'number',
}

const CPP_TYPE: Record<ParamType | ReturnType, string> = {
  int: 'int',
  string: 'string',
  int_list: 'vector<int>',
  int_matrix: 'vector<vector<int>>',
  bool: 'bool',
  float: 'double',
}

const JAVA_TYPE: Record<ParamType | ReturnType, string> = {
  int: 'int',
  string: 'String',
  int_list: 'int[]',
  int_matrix: 'int[][]',
  bool: 'boolean',
  float: 'double',
}

const TODO = 'Write your solution here'

// ─── Visible starter stubs ─────────────────────────────────────────────────

function pythonStarter(c: JudgeContract): string {
  const args = c.names.map((n, i) => `${n}: ${PY_TYPE[c.params[i]]}`).join(', ')
  return [
    'from typing import List',
    '',
    '',
    'class Solution:',
    `    def ${c.entry}(${args ? 'self, ' + args : 'self'}) -> ${PY_TYPE[c.returns]}:`,
    `        # ${TODO}`,
    '        pass',
    '',
  ].join('\n')
}

function javascriptStarter(c: JudgeContract): string {
  const doc = [
    '/**',
    ...c.names.map((n, i) => ` * @param {${JS_DOC[c.params[i]]}} ${n}`),
    ` * @returns {${JS_DOC[c.returns]}}`,
    ' */',
  ].join('\n')
  return `${doc}\nvar ${c.entry} = function (${c.names.join(', ')}) {\n  // ${TODO}\n};\n`
}

function cppStarter(c: JudgeContract): string {
  const args = c.names.map((n, i) => `${CPP_TYPE[c.params[i]]}& ${n}`).join(', ')
  return [
    'class Solution {',
    'public:',
    `    ${CPP_TYPE[c.returns]} ${c.entry}(${args}) {`,
    `        // ${TODO}`,
    '        return {};',
    '    }',
    '};',
    '',
  ].join('\n')
}

function javaStarter(c: JudgeContract): string {
  const args = c.names.map((n, i) => `${JAVA_TYPE[c.params[i]]} ${n}`).join(', ')
  return [
    'class Solution {',
    `    public ${JAVA_TYPE[c.returns]} ${c.entry}(${args}) {`,
    `        // ${TODO}`,
    '        throw new UnsupportedOperationException();',
    '    }',
    '}',
    '',
  ].join('\n')
}

export function buildStarter(language: JudgeLanguage, contract: JudgeContract): string {
  switch (language) {
    case 'python':
      return pythonStarter(contract)
    case 'javascript':
      return javascriptStarter(contract)
    case 'cpp':
      return cppStarter(contract)
    case 'java':
      return javaStarter(contract)
  }
}

// ─── Hidden drivers ────────────────────────────────────────────────────────

const PY_DRIVER = `
def _ctc_main():
    import sys as _sys
    import json as _json

    _lines = _sys.stdin.read().split("\\n")
    _pos = [0]

    def _read():
        _value = _lines[_pos[0]] if _pos[0] < len(_lines) else ""
        _pos[0] += 1
        return _value

    def _as_int():
        return int(_read().strip())

    def _as_list():
        _text = _read().strip()
        if not _text:
            return []
        if _text[0] == "[":
            return _json.loads(_text)
        return [int(x) for x in _text.split(",") if x.strip()]

    def _as_matrix():
        _text = _read().strip()
        return _json.loads(_text) if _text else []

    def _fmt(_value):
        if isinstance(_value, bool):
            return "true" if _value else "false"
        if isinstance(_value, float):
            return "%g" % _value
        if isinstance(_value, (list, dict)):
            return _json.dumps(_value, separators=(",", ":"))
        return str(_value)

    _args = [__ARGS__]
    _result = Solution().__ENTRY__(*_args)
    _sys.stdout.write(_fmt(_result))


_ctc_main()
`

const JS_DRIVER = `
const _ctcLines = require("fs").readFileSync(0, "utf8").split("\\n");
let _ctcPos = 0;
const _ctcRead = () => (_ctcPos < _ctcLines.length ? _ctcLines[_ctcPos++] : "");
const _ctcInt = () => parseInt(_ctcRead().trim(), 10);
const _ctcList = () => {
  const text = _ctcRead().trim();
  if (!text) return [];
  if (text[0] === "[") return JSON.parse(text);
  return text
    .split(",")
    .filter((part) => part.trim() !== "")
    .map((part) => parseInt(part, 10));
};
const _ctcMatrix = () => {
  const text = _ctcRead().trim();
  return text ? JSON.parse(text) : [];
};
const _ctcFormat = (value) => {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
};
__ARGS__
process.stdout.write(_ctcFormat(__RESULT__));
`

const CPP_PRELUDE = `#include <bits/stdc++.h>
using namespace std;
`

const CPP_DRIVER = `
namespace ctc_harness {
static string trim(const string& s) {
  size_t a = 0, b = s.size();
  while (a < b && isspace((unsigned char)s[a])) a++;
  while (b > a && isspace((unsigned char)s[b - 1])) b--;
  return s.substr(a, b - a);
}

struct JVal {
  bool is_list;
  long long num;
  vector<JVal> list;
  JVal() : is_list(false), num(0) {}
};

static void skip_ws(const string& s, size_t& p) {
  while (p < s.size() && isspace((unsigned char)s[p])) p++;
}

static JVal parse(const string& s, size_t& p) {
  skip_ws(s, p);
  JVal v;
  if (p < s.size() && s[p] == '[') {
    v.is_list = true;
    p++;
    skip_ws(s, p);
    if (p < s.size() && s[p] == ']') { p++; return v; }
    while (p < s.size()) {
      v.list.push_back(parse(s, p));
      skip_ws(s, p);
      if (p < s.size() && s[p] == ',') { p++; continue; }
      if (p < s.size() && s[p] == ']') p++;
      break;
    }
    return v;
  }
  long long sign = 1;
  if (p < s.size() && s[p] == '-') { sign = -1; p++; }
  long long n = 0;
  while (p < s.size() && isdigit((unsigned char)s[p])) { n = n * 10 + (s[p] - '0'); p++; }
  v.num = sign * n;
  return v;
}

static string read_line() {
  string s;
  if (!getline(cin, s)) s = "";
  return s;
}

static int as_int(const string& raw) { return stoi(trim(raw)); }

static vector<int> as_list(const string& raw) {
  string t = trim(raw);
  vector<int> out;
  if (t.empty()) return out;
  if (t[0] == '[') {
    size_t p = 0;
    JVal v = parse(t, p);
    for (const auto& e : v.list) out.push_back((int)e.num);
    return out;
  }
  string token;
  for (char ch : t) {
    if (ch == ',') {
      if (!trim(token).empty()) out.push_back(stoi(trim(token)));
      token.clear();
    } else {
      token += ch;
    }
  }
  if (!trim(token).empty()) out.push_back(stoi(trim(token)));
  return out;
}

static vector<vector<int>> as_matrix(const string& raw) {
  string t = trim(raw);
  vector<vector<int>> out;
  if (t.empty()) return out;
  size_t p = 0;
  JVal v = parse(t, p);
  for (const auto& row : v.list) {
    vector<int> r;
    for (const auto& e : row.list) r.push_back((int)e.num);
    out.push_back(r);
  }
  return out;
}

static string fmt(bool v) { return v ? "true" : "false"; }
static string fmt(int v) { return to_string(v); }
static string fmt(long long v) { return to_string(v); }
static string fmt(double v) {
  char buf[64];
  snprintf(buf, sizeof buf, "%g", v);
  return string(buf);
}
static string fmt(const string& v) { return v; }
static string fmt(const vector<int>& v) {
  string s = "[";
  for (size_t i = 0; i < v.size(); i++) {
    if (i) s += ",";
    s += to_string(v[i]);
  }
  return s + "]";
}
static string fmt(const vector<vector<int>>& v) {
  string s = "[";
  for (size_t i = 0; i < v.size(); i++) {
    if (i) s += ",";
    s += fmt(v[i]);
  }
  return s + "]";
}
}  // namespace ctc_harness

int main() {
__READS__
  auto _ctc_result = Solution().__ENTRY__(__ARGS__);
  cout << ctc_harness::fmt(_ctc_result);
  return 0;
}
`

const JAVA_PRELUDE = `import java.util.*;
import java.io.*;
`

const JAVA_DRIVER = `
class Main {
  static String[] lines = new String[0];
  static int pos = 0;

  static String read() {
    return pos < lines.length ? lines[pos++] : "";
  }

  static int asInt() {
    return Integer.parseInt(read().trim());
  }

  static int[] asList(String raw) {
    String t = raw.trim();
    if (t.isEmpty()) return new int[0];
    if (t.charAt(0) == '[') {
      List<Integer> nums = parseInts(t, 0, new int[]{0});
      int[] out = new int[nums.size()];
      for (int i = 0; i < out.length; i++) out[i] = nums.get(i);
      return out;
    }
    String[] parts = t.split(",");
    int[] out = new int[parts.length];
    int n = 0;
    for (String part : parts) {
      if (!part.trim().isEmpty()) out[n++] = Integer.parseInt(part.trim());
    }
    return Arrays.copyOf(out, n);
  }

  static List<Integer> parseInts(String t, int start, int[] cursor) {
    List<Integer> out = new ArrayList<>();
    int i = start;
    while (i < t.length() && t.charAt(i) != '[') i++;
    i++;
    StringBuilder num = new StringBuilder();
    while (i < t.length()) {
      char ch = t.charAt(i);
      if (ch == ']') { i++; break; }
      if (ch == ',') {
        if (num.toString().trim().length() > 0) out.add(Integer.parseInt(num.toString().trim()));
        num.setLength(0);
      } else if (ch == '[') {
        List<Integer> inner = parseInts(t, i, cursor);
        out.addAll(inner);
        i = cursor[0];
        continue;
      } else {
        num.append(ch);
      }
      i++;
    }
    if (num.toString().trim().length() > 0) out.add(Integer.parseInt(num.toString().trim()));
    cursor[0] = i;
    return out;
  }

  static int[][] asMatrix(String raw) {
    String t = raw.trim();
    if (t.isEmpty()) return new int[0][];
    List<int[]> rows = new ArrayList<>();
    int i = t.indexOf('[');
    if (i < 0) return new int[0][];
    i++;
    while (i < t.length()) {
      while (i < t.length() && t.charAt(i) != '[' && t.charAt(i) != ']') i++;
      if (i >= t.length() || t.charAt(i) == ']') break;
      int depth = 0;
      int j = i;
      for (; j < t.length(); j++) {
        if (t.charAt(j) == '[') depth++;
        else if (t.charAt(j) == ']') {
          depth--;
          if (depth == 0) break;
        }
      }
      if (j >= t.length()) break;
      rows.add(asList(t.substring(i, j + 1)));
      i = j + 1;
    }
    return rows.toArray(new int[0][]);
  }

  static int[] readList() {
    return asList(read());
  }

  static int[][] readMatrix() {
    return asMatrix(read());
  }

  static String fmt(boolean v) { return v ? "true" : "false"; }
  static String fmt(int v) { return Integer.toString(v); }
  static String fmt(long v) { return Long.toString(v); }
  static String fmt(double v) {
    if (v == Math.rint(v) && Math.abs(v) < 1e15) return Long.toString((long) v);
    return Double.toString(v);
  }
  static String fmt(String v) { return v; }
  static String fmt(int[] v) {
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < v.length; i++) {
      if (i > 0) sb.append(',');
      sb.append(v[i]);
    }
    return sb.append(']').toString();
  }
  static String fmt(int[][] v) {
    StringBuilder sb = new StringBuilder("[");
    for (int i = 0; i < v.length; i++) {
      if (i > 0) sb.append(',');
      sb.append(fmt(v[i]));
    }
    return sb.append(']').toString();
  }

  public static void main(String[] args) throws Exception {
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder all = new StringBuilder();
    String line;
    while ((line = br.readLine()) != null) {
      if (all.length() > 0) all.append('\\n');
      all.append(line);
    }
    lines = all.toString().split("\\n", -1);
__READS__
    Object _ctc_result = new Solution().__ENTRY__(__ARGS__);
    System.out.print(_ctc_result instanceof Boolean ? fmt((boolean) (Boolean) _ctc_result)
        : _ctc_result instanceof Integer ? fmt((int) (Integer) _ctc_result)
        : _ctc_result instanceof Long ? fmt((long) (Long) _ctc_result)
        : _ctc_result instanceof Double ? fmt((double) (Double) _ctc_result)
        : _ctc_result instanceof String ? fmt((String) _ctc_result)
        : _ctc_result instanceof int[][] ? fmt((int[][]) _ctc_result)
        : _ctc_result instanceof int[] ? fmt((int[]) _ctc_result)
        : String.valueOf(_ctc_result));
  }
}
`

function pythonArgs(c: JudgeContract): string {
  return c.params
    .map((p) =>
      p === 'string' ? '_read()' : p === 'int' ? '_as_int()' : p === 'int_list' ? '_as_list()' : '_as_matrix()'
    )
    .join(', ')
}

function jsArgs(c: JudgeContract): string {
  const reads = c.params.map((p, i) => {
    const reader =
      p === 'string' ? '_ctcRead()' : p === 'int' ? '_ctcInt()' : p === 'int_list' ? '_ctcList()' : '_ctcMatrix()'
    return `const _ctcA${i} = ${reader};`
  })
  return `${reads.join('\n')}\nconst __RESULT__ = ${c.entry}(${c.params.map((_, i) => `_ctcA${i}`).join(', ')});`
}

function cppReads(c: JudgeContract): { reads: string[]; args: string[] } {
  const reads: string[] = []
  const args: string[] = []
  c.params.forEach((p, i) => {
    const expr =
      p === 'string'
        ? 'ctc_harness::read_line()'
        : p === 'int'
          ? 'ctc_harness::as_int(ctc_harness::read_line())'
          : p === 'int_list'
            ? 'ctc_harness::as_list(ctc_harness::read_line())'
            : 'ctc_harness::as_matrix(ctc_harness::read_line())'
    reads.push(`  auto _ctcA${i} = ${expr};`)
    args.push(`_ctcA${i}`)
  })
  return { reads, args }
}

function javaReads(c: JudgeContract): { reads: string[]; args: string[] } {
  const reads: string[] = []
  const args: string[] = []
  c.params.forEach((p, i) => {
    const expr = p === 'string' ? 'read()' : p === 'int' ? 'asInt()' : p === 'int_list' ? 'readList()' : 'readMatrix()'
    reads.push(`    ${JAVA_TYPE[p]} _ctcA${i} = ${expr};`)
    args.push(`_ctcA${i}`)
  })
  return { reads, args }
}

/**
 * Read the function contract stored alongside the starter code. Problems
 * seeded before the contract existed have none and keep stdin/stdout.
 */
export function contractFromStarter(starter: unknown): JudgeContract | null {
  if (!starter || typeof starter !== 'object') return null
  const meta = (starter as Record<string, unknown>)['_meta']
  if (!meta || typeof meta !== 'object') return null
  const { entry, params, returns } = meta as Partial<JudgeContract>
  if (typeof entry !== 'string' || !entry) return null
  if (!Array.isArray(params) || params.length === 0) return null
  if (typeof returns !== 'string') return null
  return {
    entry,
    params,
    names: Array.isArray((meta as JudgeContract).names)
      ? (meta as JudgeContract).names
      : params.map((_, i) => `arg${i + 1}`),
    returns,
  }
} /**
 * Full program = hidden prelude + the student's code + the hidden driver.
 * The driver is generated here, server-side, and is never returned to the
 * browser (only the submission's own `code` is echoed back).
 */
export function wrapForJudge(language: JudgeLanguage, contract: JudgeContract, code: string): string {
  switch (language) {
    case 'python':
      return `${code}\n${PY_DRIVER.replace('__ARGS__', pythonArgs(contract)).replace('__ENTRY__', contract.entry)}`
    case 'javascript':
      return `${code}\n${JS_DRIVER.replace('__ARGS__', jsArgs(contract)).replace('__ENTRY__', contract.entry)}`
    case 'cpp': {
      const { reads, args } = cppReads(contract)
      return `${CPP_PRELUDE}\n${code}\n${CPP_DRIVER.replace('__READS__', reads.join('\n'))
        .replace('__ARGS__', args.join(', '))
        .replace('__ENTRY__', contract.entry)}`
    }
    case 'java': {
      const { reads, args } = javaReads(contract)
      return `${JAVA_PRELUDE}\n${code}\n${JAVA_DRIVER.replace('__READS__', reads.join('\n'))
        .replace('__ARGS__', args.join(', '))
        .replace('__ENTRY__', contract.entry)}`
    }
  }
}
