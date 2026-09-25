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
 *
 * BATCHING: the original 60 seeded questions have no metadata and must stay
 * untouched. Batch-2 questions carry stable ids ({topic}-011..{topic}-050),
 * subtopic, explanation, difficulty and points. 50 questions per topic.
 */

export type ArenaTopicKey = 'java' | 'python' | 'dsa' | 'cpp' | 'javascript' | 'dbms'

export interface ArenaQuestion {
  q: string
  options: string[]
  answer: number // index into options
  // ── Batch-2 fields (optional so the original 60 seeded questions stay
  // valid unchanged; ArenaQuiz only reads q/options/answer) ──
  id?: string
  subtopic?: string
  explanation?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  points?: number
}

export interface ArenaTopic {
  key: ArenaTopicKey
  title: string
  desc: string
  icon: string
  questions: ArenaQuestion[]
}

const P = { easy: 10, medium: 20, hard: 30 } as const

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
      {
        id: 'java-011',
        subtopic: 'OOP',
        difficulty: 'easy',
        points: P.easy,
        q: 'Wrapping data and the methods that operate on it into a single unit is called…',
        options: ['Encapsulation', 'Inheritance', 'Abstraction', 'Polymorphism'],
        answer: 0,
        explanation:
          'Encapsulation bundles fields and methods together and restricts direct access to internal state (e.g. private fields + getters/setters).',
      },
      {
        id: 'java-012',
        subtopic: 'OOP',
        difficulty: 'easy',
        points: P.easy,
        q: 'Method overloading is resolved…',
        options: [
          'at runtime by the JVM',
          'at compile time by the compiler',
          'by the garbage collector',
          'by the class loader',
        ],
        answer: 1,
        explanation:
          'Overloading (same name, different parameter lists) is static binding — the compiler picks the signature at compile time.',
      },
      {
        id: 'java-013',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'Which is TRUE about constructors in Java?',
        options: [
          'They can be marked final',
          'They cannot be inherited by subclasses',
          'They must be public',
          'They can be static',
        ],
        answer: 1,
        explanation:
          'Constructors are not members that are inherited; a subclass defines its own constructors and chains via super(). final/static constructors are illegal.',
      },
      {
        id: 'java-014',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'class A { void m() {} } class B extends A { void m(int x) {} } — B.m(int) is…',
        options: ['an override of A.m', 'an overload relative to A.m', 'a compile error', 'field shadowing'],
        answer: 1,
        explanation:
          'Same name but a different parameter list means overloading, not overriding. Overriding requires the identical signature.',
      },
      {
        id: 'java-015',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'An explicit super(...) call inside a constructor…',
        options: [
          'may appear anywhere',
          'must be the first statement',
          'must be the last statement',
          'is only allowed in static blocks',
        ],
        answer: 1,
        explanation:
          'The superclass must be initialised before the subclass body runs, so an explicit super(...) must be the first statement of the constructor.',
      },
      {
        id: 'java-016',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'Fields declared in an interface are implicitly…',
        options: ['private', 'public static final', 'protected transient', 'package-private'],
        answer: 1,
        explanation:
          'Interface fields are constants: implicitly public, static and final, because interfaces describe a contract, not mutable state.',
      },
      {
        id: 'java-017',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'Runtime polymorphism in Java is achieved through…',
        options: [
          'method overloading',
          'method overriding with a superclass reference',
          'static methods',
          'final methods',
        ],
        answer: 1,
        explanation:
          'Dynamic dispatch: when a superclass reference points to a subclass object, the overridden method chosen is based on the actual object at runtime.',
      },
      {
        id: 'java-018',
        subtopic: 'OOP',
        difficulty: 'hard',
        points: P.hard,
        q: 'A a = new B(); a.m(); where B overrides m() — which implementation runs?',
        options: [
          "A's m(), because the reference type is A",
          "B's m(), because of dynamic dispatch",
          'Compile error',
          'Depends on the JVM version',
        ],
        answer: 1,
        explanation:
          'The compiler checks A has m(), but at runtime the JVM dispatches to the actual object type — B.m() runs (virtual method invocation).',
      },
      {
        id: 'java-019',
        subtopic: 'Collections',
        difficulty: 'easy',
        points: P.easy,
        q: 'Which collection interface stores unique key-value mappings?',
        options: ['List', 'Set', 'Map', 'Queue'],
        answer: 2,
        explanation:
          'Map stores key→value pairs with unique keys. Note: Map is not part of the Collection interface hierarchy.',
      },
      {
        id: 'java-020',
        subtopic: 'Collections',
        difficulty: 'easy',
        points: P.easy,
        q: 'Random access (get(i)) is faster in…',
        options: ['ArrayList — O(1) array indexing', 'LinkedList — O(1)', 'Both are equal', 'LinkedList — O(log n)'],
        answer: 0,
        explanation:
          'ArrayList backs onto an array so get(i) is O(1). LinkedList must traverse nodes from the nearest end: O(n).',
      },
      {
        id: 'java-021',
        subtopic: 'Collections',
        difficulty: 'easy',
        points: P.easy,
        q: 'Which Set keeps its elements in sorted order?',
        options: ['HashSet', 'LinkedHashSet', 'TreeSet', 'None of them can'],
        answer: 2,
        explanation: 'TreeSet is backed by a red-black tree and keeps elements in their natural (or Comparator) order.',
      },
      {
        id: 'java-022',
        subtopic: 'Collections',
        difficulty: 'medium',
        points: P.medium,
        q: 'How many null keys can a HashMap hold?',
        options: ['None', 'Exactly one', 'Unlimited', 'Depends on the load factor'],
        answer: 1,
        explanation: 'HashMap allows a single null key (stored in bucket 0) and any number of null values.',
      },
      {
        id: 'java-023',
        subtopic: 'Collections',
        difficulty: 'medium',
        points: P.medium,
        q: 'Modifying a HashMap while iterating it (outside the iterator) causes…',
        options: [
          'ConcurrentModificationException on the next advance',
          'Silent corruption',
          'Compilation error',
          'Nothing — iterators are snapshots',
        ],
        answer: 0,
        explanation:
          'HashMap iterators are fail-fast: they track structural modifications and throw ConcurrentModificationException when the count changes unexpectedly.',
      },
      {
        id: 'java-024',
        subtopic: 'Collections',
        difficulty: 'medium',
        points: P.medium,
        q: 'new HashMap<>(16) with default load factor 0.75 resizes when the…',
        options: ['12th entry is added', '16th entry is added', '8th entry is added', 'map is read'],
        answer: 0,
        explanation:
          'Threshold = capacity × load factor = 16 × 0.75 = 12. Adding the 13th entry triggers a resize to 32 buckets.',
      },
      {
        id: 'java-025',
        subtopic: 'Collections',
        difficulty: 'medium',
        points: P.medium,
        q: 'Which legacy collection is synchronized (thread-safe)?',
        options: ['ArrayList', 'Vector', 'LinkedList', 'PriorityQueue'],
        answer: 1,
        explanation:
          'Vector is the legacy synchronized list; ArrayList/LinkedList/PriorityQueue are not thread-safe (use CopyOnWriteArrayList or Collections.synchronizedList instead).',
      },
      {
        id: 'java-026',
        subtopic: 'Collections',
        difficulty: 'hard',
        points: P.hard,
        q: 'In a TreeSet, if compareTo returns 0 for two distinct objects, inserting the second one…',
        options: [
          'stores both',
          'is ignored — the Set treats it as a duplicate',
          'replaces the first',
          'throws ClassCastException',
        ],
        answer: 1,
        explanation:
          'TreeSet uses compareTo for both ordering AND equality. A 0 result means "same element", so the new insert is dropped.',
      },
      {
        id: 'java-027',
        subtopic: 'Collections',
        difficulty: 'hard',
        points: P.hard,
        q: 'map.computeIfAbsent(key, fn) when the key ALREADY exists…',
        options: [
          'overwrites the value with fn(key)',
          'does nothing and returns the existing value',
          'throws IllegalStateException',
          'removes the entry',
        ],
        answer: 1,
        explanation:
          'computeIfAbsent only computes and inserts when the key is absent (or mapped to null); otherwise it returns the current mapping untouched.',
      },
      {
        id: 'java-028',
        subtopic: 'Exceptions',
        difficulty: 'easy',
        points: P.easy,
        q: 'The parent class of both exceptions and errors in Java is…',
        options: ['Exception', 'Throwable', 'Error', 'RuntimeException'],
        answer: 1,
        explanation: 'Throwable is the root; Exception (recoverable) and Error (serious JVM problems) extend it.',
      },
      {
        id: 'java-029',
        subtopic: 'Exceptions',
        difficulty: 'easy',
        points: P.easy,
        q: 'The finally block runs…',
        options: [
          'only when an exception is thrown',
          'only on success',
          'in all cases except System.exit / JVM death',
          'never if there is a return in try',
        ],
        answer: 2,
        explanation:
          'finally executes whether or not an exception occurs — the only escapes are System.exit(), JVM crash, or an infinite loop in try.',
      },
      {
        id: 'java-030',
        subtopic: 'Exceptions',
        difficulty: 'medium',
        points: P.medium,
        q: 'A try block WITHOUT catch is legal when…',
        options: ['never', 'it is followed by finally', 'it is inside a loop', 'the method is static'],
        answer: 1,
        explanation: 'try-finally is valid Java: resources can be cleaned up while exceptions propagate to the caller.',
      },
      {
        id: 'java-031',
        subtopic: 'Exceptions',
        difficulty: 'medium',
        points: P.medium,
        q: 'Unchecked exceptions are subclasses of…',
        options: ['Exception directly', 'RuntimeException and Error', 'Throwable only', 'IOException'],
        answer: 1,
        explanation:
          'RuntimeException (and Error) descendants are unchecked — no throws declaration or try/catch is required by the compiler.',
      },
      {
        id: 'java-032',
        subtopic: 'Exceptions',
        difficulty: 'medium',
        points: P.medium,
        q: 'When catching IOException and its subclass FileNotFoundException, the order must be…',
        options: [
          'either order compiles',
          'subclass first — superclass first makes the subclass catch unreachable',
          'superclass first',
          'they cannot both be caught',
        ],
        answer: 1,
        explanation:
          'A catch for the superclass would consume every subclass exception, so the compiler flags the later subclass catch as unreachable code.',
      },
      {
        id: 'java-033',
        subtopic: 'Exceptions',
        difficulty: 'medium',
        points: P.medium,
        q: 'The `throws` keyword in a method signature…',
        options: [
          'throws an exception object',
          'declares exception types the method may propagate',
          'guarantees an exception occurs',
          'replaces try/catch at runtime',
        ],
        answer: 1,
        explanation:
          'throws declares checked exceptions a method can propagate, forcing callers to handle or re-declare them. throw actually raises an instance.',
      },
      {
        id: 'java-034',
        subtopic: 'Exceptions',
        difficulty: 'hard',
        points: P.hard,
        q: 'If a finally block contains a return statement, it…',
        options: [
          'is a compile error',
          'overrides any return/exception from try or catch',
          'is ignored by the JVM',
          'runs after the try return value is already delivered',
        ],
        answer: 1,
        explanation:
          'A return in finally discards the pending try/catch result (even a pending exception!) — a well-known anti-pattern that silently swallows failures.',
      },
      {
        id: 'java-035',
        subtopic: 'Multithreading',
        difficulty: 'easy',
        points: P.easy,
        q: 'A thread in Java can be created by…',
        options: [
          'only extending Thread',
          'only implementing Runnable',
          'extending Thread or implementing Runnable (with a Thread wrapper)',
          'annotations',
        ],
        answer: 2,
        explanation:
          'Both work: subclass Thread, or implement Runnable and pass it to a Thread. Runnable is preferred — it leaves the class free to extend something else.',
      },
      {
        id: 'java-036',
        subtopic: 'Multithreading',
        difficulty: 'easy',
        points: P.easy,
        q: 'The synchronized keyword prevents…',
        options: [
          'memory leaks',
          'two threads entering the same monitor-guarded section simultaneously',
          'all exceptions',
          'deadlocks',
        ],
        answer: 1,
        explanation:
          'synchronized grants mutually exclusive access to a lock/monitor. It does NOT prevent deadlocks — bad lock ordering can still deadlock.',
      },
      {
        id: 'java-037',
        subtopic: 'Multithreading',
        difficulty: 'medium',
        points: P.medium,
        q: 'Calling t.run() directly instead of t.start()…',
        options: [
          'starts the thread on a new call stack',
          'executes run() in the CURRENT thread',
          'is a compile error',
          'throws IllegalThreadStateException',
        ],
        answer: 1,
        explanation:
          'start() asks the JVM to spawn a new call stack and invoke run() there. run() alone is just a normal method call — no concurrency.',
      },
      {
        id: 'java-038',
        subtopic: 'Multithreading',
        difficulty: 'medium',
        points: P.medium,
        q: 'The volatile modifier on a field guarantees…',
        options: [
          'atomic increments',
          'visibility of writes across threads',
          'exclusive locking',
          'that the field cannot be null',
        ],
        answer: 1,
        explanation:
          'volatile establishes happens-before visibility: readers always see the latest write. It does NOT make compound actions like count++ atomic.',
      },
      {
        id: 'java-039',
        subtopic: 'Multithreading',
        difficulty: 'medium',
        points: P.medium,
        q: 'Object.wait() can legally be called…',
        options: [
          'from any method',
          "only while holding that object's monitor (inside synchronized)",
          'only from the main thread',
          'inside static blocks only',
        ],
        answer: 1,
        explanation:
          'wait() releases the monitor, so the thread must own it first — otherwise IllegalMonitorStateException is thrown.',
      },
      {
        id: 'java-040',
        subtopic: 'Multithreading',
        difficulty: 'medium',
        points: P.medium,
        q: 'Immediately after Thread.sleep(1000) completes, the thread is in the…',
        options: ['NEW state', 'RUNNABLE (ready-to-run) state', 'TERMINATED state', 'permanently BLOCKED state'],
        answer: 1,
        explanation:
          'After the sleep expires the thread leaves TIMED_WAITING and becomes runnable again — it competes for the CPU but may not run instantly.',
      },
      {
        id: 'java-041',
        subtopic: 'Multithreading',
        difficulty: 'hard',
        points: P.hard,
        q: 'Thread 1 locks A then B; Thread 2 locks B then A. This…',
        options: [
          'is always safe',
          "can deadlock — each waits for the other's lock",
          'is prevented automatically by the JVM',
          'causes a livelock, not a deadlock',
        ],
        answer: 1,
        explanation:
          'Circular wait is one of the four deadlock conditions. Fix by acquiring locks in a globally consistent order or using tryLock with timeout.',
      },
      {
        id: 'java-042',
        subtopic: 'Multithreading',
        difficulty: 'hard',
        points: P.hard,
        q: 'AtomicInteger.incrementAndGet() achieves atomicity without locks using…',
        options: [
          'operating-system mutexes',
          'hardware compare-and-swap (CAS) instructions',
          'volatile alone',
          'synchronizing on the Integer cache',
        ],
        answer: 1,
        explanation:
          'java.util.concurrent atomics use CAS loops (Unsafe/VarHandle): read a value, compute, and swap only if unchanged — retrying on contention.',
      },
      {
        id: 'java-043',
        subtopic: 'JVM & Memory',
        difficulty: 'easy',
        points: P.easy,
        q: 'Java bytecode (.class files) is executed by…',
        options: ['the operating system directly', 'the JVM', 'the CPU as native code', 'the browser'],
        answer: 1,
        explanation:
          'javac compiles source to bytecode; the JVM interprets/JIT-compiles it for the host platform — that is what makes Java portable.',
      },
      {
        id: 'java-044',
        subtopic: 'JVM & Memory',
        difficulty: 'easy',
        points: P.easy,
        q: 'The JDK contains…',
        options: [
          'only the runtime',
          'the JRE plus development tools (javac, javadoc, jdb)',
          'only the compiler',
          'a browser plugin',
        ],
        answer: 1,
        explanation: 'JDK = JRE + tooling. To just run compiled programs, the JRE (or a runtime image) is enough.',
      },
      {
        id: 'java-045',
        subtopic: 'JVM & Memory',
        difficulty: 'medium',
        points: P.medium,
        q: 'The garbage collector reclaims objects that…',
        options: [
          'have been alive over 30 seconds',
          'are no longer reachable from any live reference',
          'are primitives',
          'are stored in static fields',
        ],
        answer: 1,
        explanation:
          'GC uses reachability, not age. An object referenced by a live static field or thread stack root never becomes collectible.',
      },
      {
        id: 'java-046',
        subtopic: 'JVM & Memory',
        difficulty: 'medium',
        points: P.medium,
        q: 'StackOverflowError is typically caused by…',
        options: ['a full heap', 'deep or infinite recursion', 'too many live objects', 'oversized arrays'],
        answer: 1,
        explanation:
          'Each method call consumes a stack frame; unbounded recursion exhausts the per-thread stack. Heap pressure throws OutOfMemoryError instead.',
      },
      {
        id: 'java-047',
        subtopic: 'JVM & Memory',
        difficulty: 'medium',
        points: P.medium,
        q: 'String s1 = "hi"; String s2 = "hi"; (s1 == s2) is…',
        options: [
          'false — different objects',
          'true — both refer to the same pooled literal',
          'a compile error',
          'true only on the first call',
        ],
        answer: 1,
        explanation:
          'String literals are interned in the string pool, so identical literals share one object. Use equals() for content comparison; new String("hi") creates a separate heap object.',
      },
      {
        id: 'java-048',
        subtopic: 'JVM & Memory',
        difficulty: 'hard',
        points: P.hard,
        q: 'java.lang.OutOfMemoryError is thrown when…',
        options: [
          'the call stack is exhausted',
          'heap or metaspace cannot satisfy an allocation',
          'the GC pauses too long',
          'too many threads are created',
        ],
        answer: 1,
        explanation:
          'OOM means an allocation (heap objects or metaspace class metadata) cannot be satisfied even after GC. Stack exhaustion is the separate StackOverflowError.',
      },
      {
        id: 'java-049',
        subtopic: 'JVM & Memory',
        difficulty: 'hard',
        points: P.hard,
        q: 'Classes in Java are loaded…',
        options: [
          'all at JVM startup',
          'lazily — on first active use',
          'by the garbage collector',
          'during compilation',
        ],
        answer: 1,
        explanation:
          'The class loader loads, links and initialises a class at its first active use (new, static access, reflection), keeping startup cost proportional to what runs.',
      },
      {
        id: 'java-050',
        subtopic: 'Language Basics',
        difficulty: 'medium',
        points: P.medium,
        q: 'For objects, the == operator compares…',
        options: [
          'contents, like equals()',
          'references — whether both point to the same object',
          'hash codes',
          'class names',
        ],
        answer: 1,
        explanation:
          '== tests reference identity for objects (and values for primitives). Content equality must go through equals(), which classes like String override.',
      },
    ],
    // __PYTHON__
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
      {
        id: 'python-011',
        subtopic: 'Data Structures',
        difficulty: 'easy',
        points: P.easy,
        q: 'Which collection forbids duplicate elements?',
        options: ['list', 'tuple', 'set', 'bytearray'],
        answer: 2,
        explanation:
          'A set stores unique, hashable members — adding an existing element is a no-op. Lists and tuples keep duplicates by design.',
      },
      {
        id: 'python-012',
        subtopic: 'Data Structures',
        difficulty: 'easy',
        points: P.easy,
        q: 'Tuples are preferred over lists when the data…',
        options: ['will change often', 'is fixed-shape / read-only', 'is numeric only', 'must be sorted'],
        answer: 1,
        explanation:
          'Tuples are immutable and hashable — ideal for fixed records and dict keys. Lists suit homogeneous, mutating collections.',
      },
      {
        id: 'python-013',
        subtopic: 'Data Structures',
        difficulty: 'medium',
        points: P.medium,
        q: 'fromkeys pitfall: dict.fromkeys([1,2], []) then appending to one value…',
        options: [
          'appends to that key only',
          'appends to EVERY value — they alias one list object',
          'raises ValueError',
          'removes the key',
        ],
        answer: 1,
        explanation:
          'fromkeys evaluates the default ONCE, so every key points to the same list object. Mutable defaults shared like this are a classic bug.',
      },
      {
        id: 'python-014',
        subtopic: 'Data Structures',
        difficulty: 'medium',
        points: P.medium,
        q: 'The defaultdict(list) from the collections module…',
        options: [
          'sorts keys automatically',
          'auto-creates an empty list on first missing-key access',
          'is immutable',
          'cannot be iterated',
        ],
        answer: 1,
        explanation:
          'defaultdict calls the factory for missing keys, so d[k].append(x) works without checking membership first.',
      },
      {
        id: 'python-015',
        subtopic: 'Data Structures',
        difficulty: 'medium',
        points: P.medium,
        q: 'a = [1,2,3]; b = a; b.append(4) — what is len(a)?',
        options: ['3', '4', '1', 'raises an error'],
        answer: 1,
        explanation:
          'b = a copies the REFERENCE, not the list — both names point to one object, so the append is visible through a.',
      },
      {
        id: 'python-016',
        subtopic: 'Data Structures',
        difficulty: 'hard',
        points: P.hard,
        q: 'a = [1,2,3]; b = a[:]; a += [4] — len(b) is…',
        options: [
          '3 — b is an independent shallow copy',
          '4 — += mutates shared state',
          '0',
          'error: cannot concatenate',
        ],
        answer: 0,
        explanation:
          'a[:] slices out a new list. Note: += mutates a in place, but b already points elsewhere. (Shallow copy still shares INNER objects.)',
      },
      {
        id: 'python-017',
        subtopic: 'Functions',
        difficulty: 'easy',
        points: P.easy,
        q: 'def f(x, y=2): ... — calling f(5) sets…',
        options: ['x=5, y=2', 'x=5, y=None', 'TypeError', 'x=2, y=5'],
        answer: 0,
        explanation: 'Positional 5 binds to x; y keeps its default value 2.',
      },
      {
        id: 'python-018',
        subtopic: 'Functions',
        difficulty: 'easy',
        points: P.easy,
        q: '*args in a function signature collects…',
        options: [
          'keyword arguments into a dict',
          'extra positional arguments into a tuple',
          'only the first argument',
          'default values',
        ],
        answer: 1,
        explanation:
          '*args gathers surplus positional args as a tuple; **kwargs gathers surplus keyword args as a dict.',
      },
      {
        id: 'python-019',
        subtopic: 'Functions',
        difficulty: 'medium',
        points: P.medium,
        q: 'A default argument evaluated at definition time — def f(x=[]): — is dangerous because…',
        options: [
          'lists are slow',
          'the same list persists across calls that omit x',
          'Python forbids mutable defaults',
          'x becomes global',
        ],
        answer: 1,
        explanation:
          'Defaults are evaluated once at def time. Mutations persist between calls — the classic mutable-default trap; use x=None and create inside.',
      },
      {
        id: 'python-020',
        subtopic: 'Functions',
        difficulty: 'medium',
        points: P.medium,
        q: 'A lambda in Python can contain…',
        options: ['multiple statements', 'a single expression', 'loops', 'its own docstring'],
        answer: 1,
        explanation:
          'Lambda is an expression-based anonymous function — one expression only. For statements, define a normal function.',
      },
      {
        id: 'python-021',
        subtopic: 'Functions',
        difficulty: 'medium',
        points: P.medium,
        q: 'def f(*, key): ... — calling f(3)…',
        options: ['binds 3 to key', 'raises TypeError — key is keyword-only', 'ignores 3', 'sets key=None'],
        answer: 1,
        explanation: 'The bare * makes everything after it keyword-only; a positional call fails with TypeError.',
      },
      {
        id: 'python-022',
        subtopic: 'Functions',
        difficulty: 'hard',
        points: P.hard,
        q: 'A closure over a loop variable: fs = [lambda: i for i in range(3)]; [f() for f in fs] returns…',
        options: ['[0, 1, 2]', '[2, 2, 2] — all share the final i', '[3, 3, 3] — i is out of range', 'a TypeError'],
        answer: 1,
        explanation:
          'Closures capture the VARIABLE, not its value at creation. After the loop, i is 2 for all three lambdas. Use default-arg binding: lambda i=i: i.',
      },
      {
        id: 'python-023',
        subtopic: 'Functions',
        difficulty: 'hard',
        points: P.hard,
        q: 'Inside a nested function assigning to the enclosing scope’s variable requires…',
        options: ['global', 'nonlocal', 'static', 'nothing — it works by default'],
        answer: 1,
        explanation:
          'Assignment rebinds in the LOCAL scope by default; nonlocal targets the nearest enclosing function scope (global targets module scope).',
      },
      {
        id: 'python-024',
        subtopic: 'OOP',
        difficulty: 'easy',
        points: P.easy,
        q: 'The first parameter of an instance method is conventionally named…',
        options: ['cls', 'this', 'self', 'me'],
        answer: 2,
        explanation:
          'self receives the instance. It is a convention, not a keyword — but breaking it confuses every reader.',
      },
      {
        id: 'python-025',
        subtopic: 'OOP',
        difficulty: 'easy',
        points: P.easy,
        q: 'Which method acts as the constructor initializer?',
        options: ['__init__', '__new__', '__main__', '__start__'],
        answer: 0,
        explanation:
          '__init__ initialises the (already created) instance; __new__ actually creates it — a rarely-overridden step.',
      },
      {
        id: 'python-026',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: '@staticmethod vs @classmethod: a classmethod receives…',
        options: ['the instance as first arg', 'the class (cls) as first arg', 'no arguments', 'a copy of the module'],
        answer: 1,
        explanation:
          'classmethod binds to the class (useful for alternative constructors); staticmethod binds to neither class nor instance — a plain namespaced function.',
      },
      {
        id: 'python-027',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'Python multiple inheritance resolves attribute conflicts using…',
        options: [
          'random choice',
          'the MRO (C3 linearization)',
          'alphabetical class order',
          'last-defined wins, always',
        ],
        answer: 1,
        explanation:
          'The C3 linearization (visible via ClassName.__mro__) defines a deterministic lookup order that keeps subclasses before base classes.',
      },
      {
        id: 'python-028',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'Name mangling: self.__secret inside class Foo becomes…',
        options: ['self.__secret unchanged', 'self._Foo__secret', 'self.secret', 'a global'],
        answer: 1,
        explanation:
          'Double-underscore names are rewritten to _ClassName__name — a namespace collision guard for inheritance, NOT true privacy.',
      },
      {
        id: 'python-029',
        subtopic: 'OOP',
        difficulty: 'hard',
        points: P.hard,
        q: 'class A: pass\n a = A(); a.x = 1 — setting attributes on instances works because A…',
        options: ['inherits from dict', 'has a __dict__ by default', 'is decorated', 'is compiled with slots'],
        answer: 1,
        explanation:
          'Ordinary classes store per-instance attributes in a __dict__ (unless __slots__ is defined to forbid it and save memory).',
      },
      {
        id: 'python-030',
        subtopic: 'Errors & Exceptions',
        difficulty: 'easy',
        points: P.easy,
        q: 'Which block ALWAYS runs, exception or not?',
        options: ['else', 'finally', 'except', 'raise'],
        answer: 1,
        explanation:
          'finally runs on success, on exception, even on return — the only escapes are interpreter shutdown or os._exit().',
      },
      {
        id: 'python-031',
        subtopic: 'Errors & Exceptions',
        difficulty: 'easy',
        points: P.easy,
        q: '10 / 0 raises…',
        options: ['ValueError', 'ZeroDivisionError', 'TypeError', 'it returns inf'],
        answer: 1,
        explanation:
          'True division by zero raises ZeroDivisionError (unlike some languages that yield infinity for floats).',
      },
      {
        id: 'python-032',
        subtopic: 'Errors & Exceptions',
        difficulty: 'medium',
        points: P.medium,
        q: 'try/except/else: the else block runs when…',
        options: ['an exception occurs', 'no exception occurs in try', 'finally finishes', 'the function returns'],
        answer: 1,
        explanation:
          'else keeps success-only code out of try, so you never accidentally catch errors raised by the success path itself.',
      },
      {
        id: 'python-033',
        subtopic: 'Errors & Exceptions',
        difficulty: 'medium',
        points: P.medium,
        q: 'Raising a custom application error is done by…',
        options: [
          'class AppError(Exception) + raise AppError("msg")',
          'throw AppError',
          'raise Error(AppError)',
          'AppError.raise()',
        ],
        answer: 0,
        explanation:
          'Subclass Exception and raise an instance. throw is JavaScript, not Python; raise expects an exception class/instance.',
      },
      {
        id: 'python-034',
        subtopic: 'Errors & Exceptions',
        difficulty: 'hard',
        points: P.hard,
        q: 'except Exception as e: ... then re-raising the SAME traceback is done with…',
        options: ['raise e', 'bare raise', 'raise Exception(e)', 're-raise is impossible'],
        answer: 1,
        explanation:
          'A bare raise re-raises the active exception with its original traceback intact; raise e restarts the traceback from this line.',
      },
      {
        id: 'python-035',
        subtopic: 'Modules & Environment',
        difficulty: 'easy',
        points: P.easy,
        q: 'if __name__ == "__main__": guards code that should run…',
        options: ['on import', 'only when the file is executed directly', 'in every thread', 'only on Windows'],
        answer: 1,
        explanation:
          'When imported, __name__ is the module name; only direct execution sets it to "__main__" — the standard entry-point guard.',
      },
      {
        id: 'python-036',
        subtopic: 'Modules & Environment',
        difficulty: 'easy',
        points: P.easy,
        q: 'The standard virtual-environment creation command is…',
        options: ['python -m venv .venv', 'pip install venv', 'python --virtual', 'env make python'],
        answer: 0,
        explanation: 'venv ships with the stdlib; activate it, then pip installs stay isolated per project.',
      },
      {
        id: 'python-037',
        subtopic: 'Modules & Environment',
        difficulty: 'medium',
        points: P.medium,
        q: 'from module import * is discouraged mainly because it…',
        options: [
          'is slower at runtime',
          'pollutes the namespace and hides name origins',
          'fails on packages',
          'imports C extensions only',
        ],
        answer: 1,
        explanation:
          'Wildcard imports make it unclear where names come from and can silently shadow each other — prefer explicit imports.',
      },
      {
        id: 'python-038',
        subtopic: 'Modules & Environment',
        difficulty: 'medium',
        points: P.medium,
        q: 'requirements.txt is consumed by…',
        options: ['pip install -r requirements.txt', 'python -m compileall', 'venv activate', 'importlib.reload'],
        answer: 0,
        explanation:
          'pip reads the pinned requirement list and installs each package (ideally inside an activated venv).',
      },
      {
        id: 'python-039',
        subtopic: 'Modules & Environment',
        difficulty: 'medium',
        points: P.medium,
        q: 'A module is…',
        options: ['any directory', 'a single .py file', 'only a compiled .pyc', 'a zip of classes'],
        answer: 1,
        explanation: 'Module = one .py file; a package is a directory of modules (traditionally with __init__.py).',
      },
      {
        id: 'python-040',
        subtopic: 'Modules & Environment',
        difficulty: 'hard',
        points: P.hard,
        q: 'Circular imports (a imports b, b imports a) are typically fixed by…',
        options: [
          'deleting one module',
          'moving the shared import inside a function or refactoring common code out',
          'importing with *',
          'adding global statements',
        ],
        answer: 1,
        explanation:
          'Deferred (in-function) imports or extracting the shared dependency breaks the import cycle without changing behaviour.',
      },
      {
        id: 'python-041',
        subtopic: 'Data Structures',
        difficulty: 'hard',
        points: P.hard,
        q: 'set membership (x in s) is on average…',
        options: ['O(n) — scans all elements', 'O(1) — hash-based', 'O(log n) — like a tree', 'O(n log n)'],
        answer: 1,
        explanation:
          'Sets/dicts hash their members, so lookups are constant-time on average (worst case degrades only with pathological hash collisions).',
      },
      {
        id: 'python-042',
        subtopic: 'Functions',
        difficulty: 'medium',
        points: P.medium,
        q: 'Generators (functions with yield) are preferred for large sequences because they…',
        options: ['run in C', 'produce items lazily, one at a time', 'are type-safe', 'cache to disk'],
        answer: 1,
        explanation:
          'A generator keeps its state suspended between yields and materialises nothing until requested — O(1) memory for the pipeline instead of a full list.',
      },
      {
        id: 'python-043',
        subtopic: 'Data Structures',
        difficulty: 'medium',
        points: P.medium,
        q: 'sorted(d.items(), key=lambda kv: kv[1]) sorts a dict’s items by…',
        options: ['key', 'value', 'insertion order — key is ignored', 'hash order'],
        answer: 1,
        explanation:
          'kv is a (key, value) tuple; kv[1] is the value. sorted returns a new list and never mutates the dict.',
      },
      {
        id: 'python-044',
        subtopic: 'Data Structures',
        difficulty: 'easy',
        points: P.easy,
        q: 'Slicing s[1:4] on "python" returns…',
        options: ['yth', 'ytho', 'yt', 'pyt'],
        answer: 0,
        explanation: 'Start index 1 inclusive, stop 4 exclusive → characters at 1,2,3 → "yth".',
      },
      {
        id: 'python-045',
        subtopic: 'Data Structures',
        difficulty: 'hard',
        points: P.hard,
        q: '(-7) // 2 in Python 3 evaluates to…',
        options: ['-3', '-4', '-3.5', '3'],
        answer: 1,
        explanation:
          '// is floor division: it rounds toward NEGATIVE infinity, so -7//2 = -4 (while int(-7/2) would give -3). A classic output-prediction trap.',
      },
      {
        id: 'python-046',
        subtopic: 'OOP',
        difficulty: 'medium',
        points: P.medium,
        q: 'Duck typing means…',
        options: [
          'types are checked at compile time',
          'suitability is judged by behaviour/methods, not declared type',
          'all objects inherit from Duck',
          'only birds can fly',
        ],
        answer: 1,
        explanation:
          '"If it quacks like a duck": Python cares whether the object has the needed method, not its class — interfaces are implicit.',
      },
      {
        id: 'python-047',
        subtopic: 'Errors & Exceptions',
        difficulty: 'medium',
        points: P.medium,
        q: 'Assert statements are removed when running with…',
        options: ['python -u', 'python -O (optimize flag)', 'python -i', 'sudo python'],
        answer: 1,
        explanation:
          'Under -O, asserts compile away — never rely on them for validation that must always run (e.g. security checks).',
      },
      {
        id: 'python-048',
        subtopic: 'Functions',
        difficulty: 'easy',
        points: P.easy,
        q: 'The range(2, 10, 3) sequence is…',
        options: ['2, 5, 8', '2, 4, 6, 8', '3, 6, 9', '2, 10'],
        answer: 0,
        explanation: 'Start 2, stop (exclusive) 10, step 3 → 2, 5, 8.',
      },
      {
        id: 'python-049',
        subtopic: 'Data Structures',
        difficulty: 'medium',
        points: P.medium,
        q: 'Dict comprehension {k: k*k for k in range(3)} produces…',
        options: ['{0: 0, 1: 1, 2: 4}', '[0, 1, 4]', '{1, 4}', '{0, 1, 2}'],
        answer: 0,
        explanation:
          'Each k maps to its square — a compact literal for building dicts (same shape as list comprehensions but with key: value).',
      },
      {
        id: 'python-050',
        subtopic: 'OOP',
        difficulty: 'hard',
        points: P.hard,
        q: 'class Dog: legs = 4\n d = Dog(); d.legs = 3 — Dog.legs is now…',
        options: [
          '3',
          '4 — the assignment created an instance attribute shadowing the class one',
          'undefined',
          'an error',
        ],
        answer: 1,
        explanation:
          'd.legs = 3 writes into the instance __dict__, shadowing the class attribute. Dog.legs stays 4; reading d.legs first finds the instance value.',
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
