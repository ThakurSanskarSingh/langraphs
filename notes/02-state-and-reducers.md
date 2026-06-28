# Lesson 2 — State & Reducers

> The single most important mechanic in LangGraph. Once this clicks, chatbots,
> agents, and parallel graphs all stop feeling like magic.

## 1. The question reducers answer

When a node returns `{ total: 5 }`, LangGraph has to decide:

> "There's already a `total` in state. How do I **combine** the old value with this new one?"

That combine function is the channel's **reducer**:

```
new_state[channel] = reducer(old_state[channel], node_output[channel])
```

- **Default reducer = overwrite** → `(old, new) => new`. The new value replaces the old.
- **Custom reducer** → you decide: sum, append to a list, merge objects, dedupe, etc.

A channel is just `(value + reducer + default)`. That's the whole abstraction.

## 2. Defining a channel with a reducer

```js
const State = Annotation.Root({
  total: Annotation({
    reducer: (prev, next) => prev + next, // how to merge an incoming update
    default: () => 0,                     // value before ANY update has happened
  }),
});
```

- **`reducer(prev, next)`** runs every time a node returns this channel.
- **`default()`** supplies the starting `prev` for the very first reduce (and must be a
  *function* returning a fresh value — important for arrays/objects so instances aren't shared).
- A bare `Annotation()` (no args) = overwrite, no default.

### Annotation vs StateSchema (same idea, different spelling)
```js
// Annotation (what we use)
total: Annotation({ reducer: (a, b) => a + b, default: () => 0 })

// StateSchema equivalent uses a Zod schema + a reducer wrapper (ReducedValue).
// We'll stick with Annotation; just know the concept is identical.
```

## 3. What the demos proved (`lessons/02-state-and-reducers.mjs`)

| Demo | Channel setup | Two nodes write... | Result | Lesson |
|------|---------------|--------------------|--------|--------|
| A | `Annotation()` (overwrite) | `total:1` then `total:10` | **10** | last write wins |
| B | reducer `a+b`, default `0` | `total:1` then `total:10` | **11** | accumulation |
| C | `reducer: addMessages` | a user msg, then a bot msg | **[user, bot]** | chat history appends |
| D1 | overwrite, **parallel** | `["a"]` and `["b"]` at once | **throws** `InvalidUpdateError` | overwrite can't merge concurrent writes |
| D2 | concat reducer, **parallel** | `["a"]` and `["b"]` at once | **`["a","b"]`** | reducer merges concurrent writes |

### Why Demo D is the real "why"
Sequential graphs rarely *need* reducers — overwrite is fine when one node runs at a time.
But the moment two nodes run **in parallel** (fan-out: two edges leaving `START`), LangGraph
gets two updates for the same channel in one step. With overwrite it can't pick a winner, so
it **errors out** to protect you from silent data loss. A reducer is you saying *"here's how
to combine them"*. Agents and branching graphs fan out constantly — so reducers aren't
optional polish, they're load-bearing.

## 4. The `messages` channel (you'll use this in every chat/agent)

```js
import { addMessages } from "@langchain/langgraph";

messages: Annotation({ reducer: addMessages, default: () => [] })
```

`addMessages` is a prebuilt reducer that:
- **Appends** new messages to the list (so history grows turn by turn), and
- **Coerces** plain `{ role, content }` objects into real LangChain message objects.
  That's why Demo C printed `human`/`ai` even though I wrote `user`/`assistant`:
  `role:"user"` → `HumanMessage`, `role:"assistant"` → `AIMessage`,
  `role:"system"` → `SystemMessage`, `role:"tool"` → `ToolMessage`.
- It can also **update** an existing message if you give a message the same `id`
  (useful for streaming partial tokens into one growing message).

### Shortcut: `MessagesAnnotation`
Because *every* chat app needs exactly this channel, LangGraph ships it prebuilt:

```js
import { MessagesAnnotation } from "@langchain/langgraph";
const State = MessagesAnnotation;                       // just { messages } with addMessages
// or extend it with your own fields:
const State = Annotation.Root({
  ...MessagesAnnotation.spec,                           // pulls in the messages channel
  userName: Annotation(),                               // + your custom fields
});
```

We'll use this from Lesson 4 onward.

## 5. Gotchas
- **`default` must be a function** (`() => []`), not a value (`[]`). A shared array across
  invocations is a classic bug; the function gives each run its own.
- **Reducer runs per node-return, per step** — not once at the end. In sequential graphs it
  runs each time a node returns the channel.
- **No reducer + parallel writes to the same channel = `InvalidUpdateError`.** If you see this,
  either add a reducer or stop two parallel nodes from writing the same channel.
- **Returning a channel you didn't change is unnecessary** — just omit it; untouched channels
  keep their value automatically.

## 6. Exercise
1. In Demo B, change the reducer to `(prev, next) => Math.max(prev, next)`. Predict the result
   before running. (Answer: 10 — it keeps the larger.)
2. Add a `history` channel that uses a concat reducer, and have each node also push a string
   like `"addOne ran"`. Confirm the final `history` is `["addOne ran", "addTen ran"]`.
3. Remove the reducer from Demo D2's `tags` and re-run — watch it throw. You've now *caused*
   and *fixed* an `InvalidUpdateError` on purpose.
