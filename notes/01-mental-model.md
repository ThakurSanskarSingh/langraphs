# Lesson 1 — The Mental Model + Your First Graph

## 1. Why LangGraph exists (coming from LangChain RAG)

You already built RAG with LangChain. A LangChain **chain** is a pipeline:

```
question → retriever → prompt → LLM → answer
```

It flows **one direction**. Each step runs once. Great for "do these steps in order."

But an **agent** doesn't work in a straight line. It does:

```
think → call a tool → look at the result → think again → maybe call another tool → ... → answer
```

That's a **loop** with **branches** ("do I need another tool, or am I done?"). You *can* hack loops into LangChain with `while` loops and manual state-passing, but it gets messy fast: where does the conversation history live? How do I retry a failed step? How do I pause for human approval mid-run?

**LangGraph** is built for exactly this. You model your app as a **graph**:

- **Nodes** = units of work (a function: "call the LLM", "run a tool", "retrieve docs")
- **Edges** = arrows deciding *what runs next* (can loop back, can branch)
- **State** = a shared object every node reads from and writes to

> Mental model: LangGraph is a **state machine**. Nodes mutate state; edges decide where to go next based on state. It runs until it reaches `END`.

## 2. The 5 core pieces (memorize these)

| Piece | What it is | In code |
|-------|-----------|---------|
| **State** | The shared data passed between nodes. Defined by a schema. | `Annotation.Root({ ... })` |
| **Node** | A function `(state) => partialUpdate`. Returns only the keys it wants to change. | `.addNode("name", fn)` |
| **Edge** | A fixed arrow from one node to the next. | `.addEdge("a", "b")` |
| **START / END** | Virtual entry and exit points of the graph. | `.addEdge(START, "a")` |
| **Compile** | Validates the graph and produces a runnable app. | `.compile()` |

Then you **`invoke`** the compiled graph with an initial state.

## 3. The single most important idea: nodes return PARTIAL updates

A node does **not** return the whole new state. It returns **only the fields it changed**, and LangGraph **merges** that into the running state for you.

```js
// State has { messages, count }. This node only touches count:
const bump = (state) => ({ count: state.count + 1 });
// LangGraph keeps `messages` as-is and updates `count`.
```

*How* it merges depends on the field's **reducer** (Lesson 2). For now: by default a returned field **overwrites** the old value. The `messages` field is special — its reducer **appends** instead of overwriting (that's why chat history accumulates).

## 4. Code walkthrough (`lessons/01-minimal-graph.mjs`)

We build a 2-node graph, NO LLM yet, so you see the machinery with zero magic.

```
START → greet → shout → END
```

- `greet` takes a `name` from state and writes a `greeting`.
- `shout` reads that `greeting` and writes a `loud` version.

### Defining state — two valid APIs (we use `Annotation`)

```js
// PRIMARY (what we use — simplest, and what ~all tutorials use):
import { Annotation } from "@langchain/langgraph";
const State = Annotation.Root({
  name:     Annotation(),   // a plain field, OVERWRITTEN on update
  greeting: Annotation(),
  loud:     Annotation(),
});
```

```js
// NEWER alternative (current official docs) — uses Zod schemas per field:
import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";
const State = new StateSchema({
  name:     z.string(),
  greeting: z.string().optional(),
  loud:     z.string().optional(),
});
```

Both compile and run identically. **Why we picked `Annotation`:** for plain custom
fields it's a bare `Annotation()` — no extra dependency, no schema syntax to learn
on day one. `StateSchema` shines mainly with its built-in `MessagesValue` helper for
chat (we'll meet it later). When you read a tutorial using either, you now know they
map 1:1: `Annotation.Root({...})` ≈ `new StateSchema({...})`.

> ⚠️ Gotcha I hit live: `new StateSchema({ name: { value: null } })` throws
> `Invalid state field`. The `{ value: null }` shape is **not** valid here — that's a
> different (older Annotation-internal) format. With `StateSchema` you must pass a Zod
> schema or one of its `*Value` helpers. One more reason we start with `Annotation`.

### Building & running

```js
const app = new StateGraph(State)
  .addNode("greet", greet)
  .addNode("shout", shout)
  .addEdge(START, "greet")   // entry: first run `greet`
  .addEdge("greet", "shout") // then `shout`
  .addEdge("shout", END)     // then stop
  .compile();

const result = await app.invoke({ name: "Sanskar" });
```

`invoke` returns the **final state** after all nodes have run.

## 5. Things that trip people up

- **A node must return an object** (a partial state), or `undefined`/`{}` if it changes nothing. Returning a random value throws.
- **Edges are wired by node *name* (string)**, not the function. Typos = "node not found".
- **`START` and `END` are imported constants**, not strings you make up (they're actually `"__start__"` / `"__end__"` under the hood).
- **`.compile()` is required.** A `StateGraph` is just a blueprint; `compile()` gives you the runnable thing with `.invoke()`, `.stream()`, etc.

## 6. Run it
```bash
node lessons/01-minimal-graph.mjs
```
Expected: it prints each node firing, then the final state with `loud: "HELLO, SANSKAR!"`.
