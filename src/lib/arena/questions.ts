/**
 * PROGRAMMING ARENA — MCQ question bank + round picker.
 *
 * One reusable engine, different question data (spec §10): every topic runs
 * through the same ArenaQuiz component. This is the single question source
 * for the Programming Arena — a future compiler/judge phase can add a
 * `kind: 'code'` variant without touching the UI flow.
 *
 * Practice-only by design: results render in the UI and nothing is written
 * to the DB, so no existing scoring/leaderboard system is bypassed or faked.
 */

export type ArenaTopicKey = 'java' | 'python' | 'dsa' | 'cpp' | 'javascript' | 'dbms'

export interface ArenaQuestion {
  q: string
  options: string[]
  answer: number // index into options
}

export interface ArenaTopic {
  key: ArenaTopicKey
  title: string
  desc: string
  icon: string
  questions: ArenaQuestion[]
}

export const ARENA_TOPICS: ArenaTopic[] = [
  {
    key: 'java',
    title: 'Java',
    desc: 'Core Java & JVM',
    icon: '/icons/java.svg',
    questions: [
      {
        q: 'Which keyword is used to inherit a class in Java?',
        options: ['implements', 'extends', 'inherits', 'super'],
        answer: 1,
      },
      { q: 'What is the default value of an int field in Java?', options: ['null', 'undefined', '0', '-1'], answer: 2 },
      {
        q: 'Which collection guarantees insertion order?',
        options: ['HashSet', 'LinkedHashSet', 'TreeSet', 'Hashtable'],
        answer: 1,
      },
      {
        q: 'JVM stands for?',
        options: ['Java Virtual Machine', 'Java Verified Module', 'Just-in Virtual Memory', 'Java Variable Manager'],
        answer: 0,
      },
      {
        q: 'Which is NOT an OOP pillar?',
        options: ['Encapsulation', 'Polymorphism', 'Compilation', 'Inheritance'],
        answer: 2,
      },
      { q: 'Strings in Java are…', options: ['mutable', 'immutable', 'volatile', 'transient'], answer: 1 },
      {
        q: 'Which method is the entry point of a Java program?',
        options: ['start()', 'init()', 'main()', 'run()'],
        answer: 2,
      },
      {
        q: 'final variable means…',
        options: ['can be reassigned once', 'cannot be reassigned', 'thread-safe', 'garbage collected first'],
        answer: 1,
      },
      {
        q: 'Which exception is checked at compile time?',
        options: ['NullPointerException', 'IOException', 'ArithmeticException', 'ClassCastException'],
        answer: 1,
      },
      {
        q: 'interface methods are by default…',
        options: ['private', 'protected', 'public abstract', 'static'],
        answer: 2,
      },
    ],
  },
  {
    key: 'python',
    title: 'Python',
    desc: 'Python concepts & stdlib',
    icon: '/icons/python.svg',
    questions: [
      { q: 'Which is a mutable collection?', options: ['tuple', 'str', 'list', 'bytes'], answer: 2 },
      { q: 'What does len("hello") return?', options: ['4', '5', '6', 'Error'], answer: 1 },
      { q: 'Which keyword defines a function?', options: ['func', 'def', 'fn', 'lambda'], answer: 1 },
      {
        q: 'Python dictionaries are…',
        options: ['ordered by insertion (3.7+)', 'always sorted', 'unordered forever', 'immutable'],
        answer: 0,
      },
      { q: 'What is PEP 8?', options: ['A framework', 'Style guide', 'A package manager', 'A debugger'], answer: 1 },
      {
        q: 'Which creates a list of squares 0-4?',
        options: ['[x**2 for x in range(5)]', '[x^2 in range(5)]', 'map(x**2, 5)', 'list(x**2 while x<5)'],
        answer: 0,
      },
      { q: 'pip is used for…', options: ['package management', 'testing', 'linting', 'compiling'], answer: 0 },
      {
        q: 'What does `with open(f) as x:` ensure?',
        options: ['faster IO', 'file gets closed', 'file is read-only', 'async read'],
        answer: 1,
      },
      { q: 'None is…', options: ['an empty string', 'zero', 'a singleton object', 'an error'], answer: 2 },
      { q: 'Which is NOT a Python data type?', options: ['set', 'frozenset', 'char', 'complex'], answer: 2 },
    ],
  },
  {
    key: 'dsa',
    title: 'DSA',
    desc: 'Algorithms & data structures',
    icon: '/icons/dsa.svg',
    questions: [
      { q: 'Time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], answer: 1 },
      { q: 'Which structure is LIFO?', options: ['Queue', 'Stack', 'Heap', 'Trie'], answer: 1 },
      { q: 'Worst case of quicksort?', options: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'], answer: 1 },
      { q: 'BFS uses which structure?', options: ['Stack', 'Queue', 'Heap', 'Set'], answer: 1 },
      { q: 'A hash map gives average lookup of…', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answer: 0 },
      { q: 'Which sort is stable?', options: ['Quick sort', 'Heap sort', 'Merge sort', 'Selection sort'], answer: 2 },
      { q: 'A binary heap is stored best in a…', options: ['linked list', 'array', 'graph', 'string'], answer: 1 },
      {
        q: 'Detecting a cycle in a linked list: classic approach?',
        options: ['Two pointers', 'Sorting', 'DP table', 'Backtracking'],
        answer: 0,
      },
      {
        q: 'DP is mainly…',
        options: ['recursion without memory', 'memoized subproblems', 'random sampling', 'graph coloring'],
        answer: 1,
      },
      { q: 'Height-balanced BST example?', options: ['AVL tree', 'Trie', 'Segment list', 'Stack'], answer: 0 },
    ],
  },
  {
    key: 'cpp',
    title: 'C++',
    desc: 'C++ core & STL',
    icon: '/icons/cpp.svg',
    questions: [
      { q: 'Which header gives std::vector?', options: ['<vector>', '<array>', '<list>', '<stdio>'], answer: 0 },
      {
        q: 'RAII stands for…',
        options: [
          'Resource Acquisition Is Initialization',
          'Random Access Iteration Interface',
          'Runtime Allocation In Intervals',
          'Reusable Abstract Inline Items',
        ],
        answer: 0,
      },
      {
        q: 'std::map is typically a…',
        options: ['hash table', 'balanced BST', 'linked list', 'dynamic array'],
        answer: 1,
      },
      { q: 'Which deletes a single heap object?', options: ['free(p)', 'delete p', 'remove(p)', 'clear p'], answer: 1 },
      {
        q: 'A virtual function enables…',
        options: ['static binding', 'runtime polymorphism', 'compile-time consts', 'memory pooling'],
        answer: 1,
      },
      {
        q: 'STL stands for…',
        options: ['Standard Template Library', 'System Type Layer', 'Static Typed Language', 'Stream Template List'],
        answer: 0,
      },
      { q: 'What is a reference in C++?', options: ['a copy', 'an alias', 'a pointer type', 'a macro'], answer: 1 },
      {
        q: 'Which cast is safest for downcasting?',
        options: ['(T)x', 'static_cast', 'dynamic_cast', 'reinterpret_cast'],
        answer: 2,
      },
      {
        q: 'const member function means…',
        options: ['returns const', 'does not modify the object', 'is private', 'is static'],
        answer: 1,
      },
      {
        q: 'Templates provide…',
        options: ['runtime polymorphism', 'generic programming', 'manual memory', 'exceptions'],
        answer: 1,
      },
    ],
  },
  {
    key: 'javascript',
    title: 'JavaScript',
    desc: 'JS language & browser',
    icon: '/icons/javascript.svg',
    questions: [
      { q: '`typeof null` returns…', options: ['"null"', '"object"', '"undefined"', '"boolean"'], answer: 1 },
      { q: 'Which declares a block-scoped constant?', options: ['var', 'let', 'const', 'static'], answer: 2 },
      {
        q: 'Arrow functions…',
        options: ['have their own this', 'inherit this lexically', 'cannot take args', 'are hoisted'],
        answer: 1,
      },
      {
        q: 'Promise.all resolves when…',
        options: ['first settles', 'all resolve', 'any rejects', 'never rejects'],
        answer: 1,
      },
      {
        q: '== vs === : which is true? "5" == 5',
        options: ['true', 'false', 'throws', 'depends on engine'],
        answer: 0,
      },
      {
        q: 'Event loop processes…',
        options: ['microtasks before macrotasks', 'macrotasks first', 'randomly', 'only sync code'],
        answer: 0,
      },
      { q: 'Array.map returns…', options: ['same array', 'a new array', 'undefined', 'a promise'], answer: 1 },
      {
        q: 'Closures capture…',
        options: ['copies of values only', 'the lexical scope', 'global scope only', 'nothing'],
        answer: 1,
      },
      {
        q: 'JSON.stringify(undefined) returns…',
        options: ['"undefined"', 'null', '"null"', 'undefined (omitted)'],
        answer: 3,
      },
      { q: 'async function always returns…', options: ['a value', 'a Promise', 'a generator', 'void'], answer: 1 },
    ],
  },
  {
    key: 'dbms',
    title: 'DBMS',
    desc: 'Databases & SQL',
    icon: '/icons/db.svg',
    questions: [
      {
        q: 'PRIMARY KEY enforces…',
        options: ['uniqueness + not null', 'uniqueness only', 'not null only', 'nothing'],
        answer: 0,
      },
      { q: 'Which JOIN keeps all left rows?', options: ['INNER', 'LEFT OUTER', 'CROSS', 'RIGHT'], answer: 1 },
      { q: 'ACID\u2019s D stands for…', options: ['Distribution', 'Durability', 'Density', 'Determinism'], answer: 1 },
      { q: 'GROUP BY is used with…', options: ['aggregates', 'joins only', 'indexes', 'views'], answer: 0 },
      { q: 'An index speeds up…', options: ['writes', 'reads', 'both equally', 'neither'], answer: 1 },
      {
        q: 'DELETE vs TRUNCATE: TRUNCATE…',
        options: ['logs row-by-row', 'resets faster without row logging', 'is DML', 'fires row triggers'],
        answer: 1,
      },
      {
        q: 'Third normal form removes…',
        options: ['partial dependency', 'transitive dependency', 'all joins', 'foreign keys'],
        answer: 1,
      },
      {
        q: 'A foreign key references…',
        options: ['any column', 'a key in another table', 'an index', 'a view'],
        answer: 1,
      },
      {
        q: 'RLS (Row Level Security) filters…',
        options: ['columns', 'rows per policy', 'tables', 'schemas'],
        answer: 1,
      },
      {
        q: 'COUNT(*) vs COUNT(col): the latter…',
        options: ['counts all rows', 'skips NULLs', 'is slower always', 'counts distinct'],
        answer: 1,
      },
    ],
  },
]

export function getTopic(key: string): ArenaTopic | undefined {
  return ARENA_TOPICS.find((t) => t.key === key)
}

/** Deterministic per-session shuffle so retries differ without a DB round-trip. */
export function pickRound(topic: ArenaTopic, count = 5): ArenaQuestion[] {
  const pool = [...topic.questions]
  const out: ArenaQuestion[] = []
  while (out.length < count && pool.length > 0) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  }
  return out
}
