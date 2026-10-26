# Writing object-oriented (low-level) design problems (v9)

Root: /tmp/claude-0/-home-claude/0dc6e862-1194-53b2-88f9-ad8a3966ed3c/scratchpad/kgcs
These use the same block format as system design questions (content/NEW_CONTENT.md section 2; checked by
tools/checkdesign.py), with `category: Object-oriented design` and `level: Mid / Senior`. Read content/FORMAT.md
(code blocks, **bold**, callouts) and content/WRITING.md (plain easy English, short sentences).
Your list: lines of content/drafts/lld_v9_list.txt given in your prompt; each `id | title | concept ids`.
Make the concepts line 6–12 ids: the listed ones first, then others that really apply (oop, designpatterns,
automata, locks, semaphores, ccontrol, hashtables, eviction, ratelimit, ledger, idempotence, testing-related ids…;
check with `python3 tools/kg_ids.py <filter>`). Mention each by name in the text.
Sections and what goes in them (2,000–3,200 words each):
- summary: what is being built and what makes it interesting as an OOD problem.
- requirements: functional (use cases) and non-functional (extensibility, thread safety, testability); assumptions.
- estimates: one short paragraph on scale only if it matters (number of objects, concurrency), else say why it does not.
- api: the public interface as ```java (or ```python) code blocks: main classes/interfaces with method signatures.
- datamodel: entities, their fields and relations, and the state machine (states and transitions) where there is one.
- design: walk through the classes and their responsibilities, the main flows step by step, which design patterns
  are used (Strategy, State, Observer, Factory, Singleton, Command, Decorator, Builder…) and WHY each fits.
- diagram: an ASCII class diagram (boxes with class names and key methods, arrows for has-a/is-a), ≤72 columns.
- deepdive: concurrency (what is shared, which lock or atomic, deadlock avoidance), extensibility (how to add a new
  type/rule without editing old code), and testing (what to unit test, fakes for clocks/randomness).
- tradeoffs: 3–5 "choose X when … choose Y when …" decisions (inheritance vs composition, enum vs class hierarchy,
  pessimistic vs optimistic locking, in-memory vs persisted state…).
- failures: edge cases and invalid inputs, and how the design handles them.
- evolution: how the design changes for new requirements an interviewer typically adds.
- followups: 5–8 lines `follow-up question || strong answer outline`.
- ref: 2–4 refs (Gang of Four, Head First Design Patterns, Effective Java, refactoring.guru pages you fetched…).
Also include one compact but complete core code listing (```java, 40–90 lines, ≤72 columns) inside design or deepdive.
Check after each: `python3 tools/checkdesign.py content/drafts/<your file>.txt`; fix every problem (if the checker
rejects something that is right for OOD, report it rather than distorting the content). Do not edit other files.
Report briefly: per problem words and status.
