# LangGraph.js — From Scratch

Learning LangGraph.js (v1) step by step, with notes + runnable code for each lesson.

- **Node:** v20+, ESM (`"type": "module"`)
- **Packages:** `@langchain/langgraph@1.4.7`, `@langchain/core`, `@langchain/groq`
- **API style taught:** `Annotation` (simplest for learning + used by ~all tutorials), with the newer `StateSchema` / `MessagesValue` shown as an alternative.

## How to run any lesson
```bash
node lessons/01-minimal-graph.mjs
```

## Curriculum

| # | Lesson | Concept | Notes | Code |
|---|--------|---------|-------|------|
| 1 | Minimal graph (no LLM) | State, Node, Edge, START/END, compile, invoke | `notes/01-mental-model.md` | `lessons/01-minimal-graph.mjs` |
| 2 | State & reducers | Channels, reducers, why state isn't a plain object | `notes/02-state-and-reducers.md` | `lessons/02-state-and-reducers.mjs` |
| 3 | Conditional edges | Routing / branching / loops | `notes/03-conditional-edges.md` | `lessons/03-conditional-edges.mjs` |
| 4 | First LLM node | Plugging in Groq | `notes/04-first-llm-node.md` | `lessons/04-first-llm-node.mjs` |
| 5 | Tools + the agent loop | ReAct by hand, then prebuilt | _(next)_ | _(next)_ |
| 6 | Memory / persistence | Checkpointers, threads | _(next)_ | _(next)_ |
| 7 | Streaming & human-in-the-loop | `interrupt`, streaming modes | _(next)_ | _(next)_ |

## The one-sentence mental model
> LangChain chains run **A → B → C** in a straight line. LangGraph lets you build a **graph with loops and branches** over a shared **state** object — which is exactly what an *agent* needs (think, act, observe, repeat).
