# Lesson 3 — Conditional Edges (Routing & Loops)

> This is the lesson that turns a pipeline into an agent. A normal edge is dumb
> ("always go to B"). A conditional edge is a **decision** made from state.

## 1. The shape

```js
graph.addConditionalEdges(
  "sourceNode",   // edge LEAVES this node
  routerFn,       // (state) => a KEY string  (pure function, no side effects)
  {               // mapping: KEY -> destination node name
    keyA: "nodeX",
    keyB: END,
  }
);
```

Flow: after `sourceNode` runs → `routerFn(state)` returns a key → LangGraph looks
up that key in the mapping → goes to that node.

- The **router does NOT do work** — it only *decides*. Do your work in nodes; route in the router.
- The router returns a **key**, not a node name (the mapping translates). This keeps routers
  readable and reusable.
- A destination can be `END` to finish, or any node name — **including a node that already ran**
  (that's how you loop).

## 2. Two superpowers

### Branching (Demo A)
```js
const route = (s) => (s.number % 2 === 0 ? "isEven" : "isOdd");
.addConditionalEdges("ingest", route, { isEven: "evenNode", isOdd: "oddNode" })
```
`invoke({number:4})` → `EVEN`; `invoke({number:7})` → `ODD`. One graph, data-driven path.

### Looping (Demo B) — the agent skeleton
```js
const keepGoing = (s) => (s.count < 5 ? "loop" : "stop");
.addConditionalEdges("increment", keepGoing, {
  loop: "increment", // route BACK to the same node = a loop
  stop: END,
})
```
Output counted `0→1→2→3→4→5` then stopped. **Mentally swap `increment` for "call the LLM,
then maybe call a tool" and `keepGoing` for "did the LLM ask for a tool?" — that is a ReAct
agent.** We build exactly that in Lesson 5.

## 3. The safety net: `recursionLimit` (Demo C)

A loop whose exit key never fires would run forever. LangGraph caps total node-steps per run
and throws **`GraphRecursionError`**.

```js
await app.invoke(input, { recursionLimit: 10 }); // default is 25
```

- Default limit is **25 steps**.
- Raise it for legitimately long agent runs, but **hitting it almost always means your exit
  condition is wrong**, not that the limit is too low. Treat it as a bug signal first.

## 4. Mental model: edges vs conditional edges

| | Normal edge | Conditional edge |
|---|---|---|
| Call | `addEdge("a", "b")` | `addConditionalEdges("a", routerFn, mapping)` |
| Destination | fixed, always "b" | chosen at runtime from state |
| Enables | linear flow | branching + loops |
| Analogy | `;` (next statement) | `if/switch` + `while` |

## 5. What you'll actually use in real apps

- **The "agent loop" pattern**: `agentNode` → conditional edge → (`"tools"` to run a tool, or
  `END` to answer). You'll write this router constantly. It usually inspects the **last AI
  message** to see if it requested a tool call:
  ```js
  const shouldContinue = (s) => {
    const last = s.messages.at(-1);
    return last.tool_calls?.length ? "tools" : END;   // tool call? loop to tools : finish
  };
  ```
  (Returning `END` directly from a router is fine — you don't always need a mapping object;
  you can return a node name / `END` string straight from the router if you pass an array of
  possible destinations or rely on names matching.)
- **Retry/guardrail branches**: route to a "fix" node if validation fails, else proceed.
- **Cheap-vs-smart routing**: a router that sends easy queries to a small model node and hard
  ones to a big model node.

> Real-app takeaway: you'll rarely branch on `number % 2`. You'll branch on
> **"did the LLM request a tool?"** and **"did this step succeed?"** Same mechanism.

## 6. Gotchas
- **Router must be pure** — return a key, don't mutate state or call APIs. Side effects belong in nodes.
- **Every key the router can return must exist in the mapping**, or you get a routing error.
- **Forgetting an exit path = infinite loop** → `GraphRecursionError`. Always have a key that
  leads to `END`.
- A conditional edge **replaces** a normal edge from that node — don't also add a plain
  `addEdge("sourceNode", ...)` for the same source.

## 7. Exercise
1. Demo B: change the limit to stop at 3 and add a second branch — when count is exactly 3,
   route to a new `celebrate` node (prints "🎉") before `END`.
2. Demo A: add a third bucket for `number === 0` → route to a `zeroNode` labeled "ZERO".
   (Hint: the router now returns one of three keys.)
3. Break Demo B on purpose: make `keepGoing` always return `"loop"`. Watch `GraphRecursionError`,
   then fix it. You've now built, broken, and repaired a loop.
