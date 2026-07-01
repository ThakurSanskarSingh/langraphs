# Lesson 5 — Tools & the Agent Loop (ReAct)

> The lesson that demystifies "agents." An agent is just: **LLM in a loop with the
> ability to call tools, until it decides it's done.** You already have every piece.

## 1. What a "tool" is

A tool = a function the LLM is allowed to call, described well enough that the model
knows *when* and *how* to use it.

```js
import { tool } from "@langchain/core/tools";
import { z } from "zod";

const multiply = tool(
  async ({ a, b }) => `${a * b}`,                 // the implementation
  {
    name: "multiply",
    description: "Multiply two numbers together.", // <- the model reads THIS to decide
    schema: z.object({ a: z.number(), b: z.number() }), // <- and THIS for the args
  }
);
```

The **description + schema are prompt engineering**, not decoration — they're literally how
the model decides to call the tool and what arguments to send. Vague description = misused tool.

## 2. Binding tools to the model

```js
const model = new ChatGroq({ model: "llama-3.3-70b-versatile" }).bindTools(tools);
```

After `.bindTools()`, a model reply can be one of two shapes:
- **A normal answer** → `AIMessage` with `.content`, no tool calls. Done.
- **A tool request** → `AIMessage` with `.tool_calls = [{ name, args, id }, ...]` and usually
  empty `.content`. **The model does NOT run the tool — it just asks you to.** Running it is
  your graph's job.

## 3. The ReAct loop (what we built by hand)

```
START → agent → (router) ──tool?──▶ tools ──┐
                  │                          │ loop back
                  └── no tool ──▶ END        ▼
                                           agent
```

Three parts, all things you already know:

| Part | Type | Job |
|------|------|-----|
| `agent` | node | call the LLM; reply may contain `tool_calls` |
| `shouldContinue` | router (conditional edge) | tool_calls present? → `"tools"`, else → `END` |
| `tools` | node | execute each tool call, append a `ToolMessage` per result |

The loop edge is the key line:
```js
.addEdge("tools", "agent")   // after running tools, GO BACK to the agent
```
So the flow is: agent asks → tools run → agent sees results → agent answers (or asks again).

### The router (you'll write this verbatim in real apps)
```js
function shouldContinue(state) {
  const last = state.messages.at(-1);
  return last.tool_calls?.length ? "tools" : END;
}
```

### The tools node, by hand (so you see the mechanics)
```js
async function runTools(state) {
  const last = state.messages.at(-1);
  const outputs = [];
  for (const call of last.tool_calls) {
    const result = await toolsByName[call.name].invoke(call.args);
    outputs.push({ role: "tool", content: String(result), tool_call_id: call.id });
  }
  return { messages: outputs };
}
```
**`tool_call_id` is critical** — it links each result back to the exact request the model made.
Without it the model can't match answers to questions (and some providers error).

## 4. What the run proved (observed live)

- **Q1 "23 × 17?"** → agent requested `multiply` → tool ran → agent answered **391**. The model
  did the *deciding*; the tool did the *computing*. (LLMs are bad at arithmetic; tools fix that.)
- **Q2 "weather in Tokyo AND 12×12?"** → agent requested **two tools in one turn**
  (`getWeather` + `multiply`). Both ran, both `ToolMessage`s were appended (this is the
  parallel-writes-need-a-reducer idea from Lesson 2 — `addMessages` handles it), then the agent
  composed one answer. This is why agents feel powerful: multi-tool, multi-step, one query.

## 5. The shortcuts (use these in real apps)

Everything above is so common LangGraph ships it prebuilt:

```js
import { ToolNode, createReactAgent, toolsCondition } from "@langchain/langgraph/prebuilt";

// (a) ToolNode = the prebuilt version of our hand-written `runTools`:
const toolNode = new ToolNode(tools);

// (b) toolsCondition = the prebuilt version of our `shouldContinue` router.

// (c) createReactAgent = builds the ENTIRE agent+tools+loop graph for you:
const agentApp = createReactAgent({ llm: model, tools });
await agentApp.invoke({ messages: [{ role: "user", content: "What is 9 times 9?" }] });
```

> **When to use which:** Reach for `createReactAgent` for a standard tool-calling agent — it's
> one line and battle-tested. Build the graph **by hand** when you need custom nodes in the loop
> (a validation step, a human approval gate, RAG retrieval before the model, routing to different
> models, etc.). Knowing the manual version is what lets you customize the prebuilt one.

## 6. How this fixes Lesson 4's hallucination
In Lesson 4 the model guessed wrong about LangGraph. Give it a `search`/`retrieve` tool (your
RAG retriever wrapped as a `tool()`), and the agent will *fetch real docs* before answering
instead of guessing. **RAG-as-a-tool inside this exact loop is one of the most common real
LangGraph apps** — and you now know how to build it.

## 7. Gotchas
- **A reply with `tool_calls` usually has empty `.content`.** Don't print `.content` and panic;
  check `.tool_calls` first.
- **Every `tool_call` needs a matching `ToolMessage` with its `tool_call_id`** before the next
  agent call, or the provider may reject the request.
- **Tools should return strings** (or be `String()`-ified). Returning a raw object can confuse
  the model; serialize it (e.g. `JSON.stringify`).
- **Forgetting `.addEdge("tools", "agent")`** breaks the loop — the agent never sees the results.
- **`.bindTools()` returns a NEW model**; use the bound one in your node, not the original.
- **Recursion limit still applies** — a confused agent can loop; you'll hit `GraphRecursionError`
  (Lesson 3) as a safety net.

## 8. Exercise
1. Add a third tool `add(a, b)` and ask "what is (3+4) times 5?" — watch the agent chain tools
   across **multiple loops** (add first, then multiply using the result).
2. Wrap a fake "knowledge base" lookup as a tool (`getDocs(topic)` returning a canned string
   about LangGraph) and re-ask "what is LangGraph?" — confirm it now answers correctly from the
   tool instead of hallucinating.
3. Swap your hand-built graph for `createReactAgent` and confirm identical behavior. Then add a
   custom node the prebuilt can't easily do (e.g. a `guard` node that blocks rude inputs before
   the agent) — proving why the manual version still matters.
