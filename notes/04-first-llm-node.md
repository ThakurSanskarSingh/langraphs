# Lesson 4 — Your First LLM Node

> Payoff lesson: a node is *any function*, so an LLM call is just a node. Everything
> from Lessons 1–3 now drives a real chatbot.

## 1. The whole graph

```
START → model → END
```

```js
const app = new StateGraph(MessagesAnnotation)   // prebuilt { messages } state
  .addNode("model", callModel)
  .addEdge(START, "model")
  .addEdge("model", END)
  .compile();
```

The node:
```js
async function callModel(state) {
  const response = await model.invoke(state.messages); // send full history
  return { messages: [response] };                     // APPEND reply (addMessages)
}
```

That `return { messages: [response] }` is the crux: because the channel uses the
`addMessages` reducer (Lesson 2), returning a one-element array **appends** to history
instead of overwriting. This is how every LangGraph chat app works.

## 2. Setup & secrets

```js
import "dotenv/config";          // FIRST import — loads .env into process.env
import { ChatGroq } from "@langchain/groq";

const model = new ChatGroq({ model: "llama-3.3-70b-versatile", temperature: 0 });
```

- `.env` holds `GROQ_API_KEY=...` and is **gitignored** (`.env`, `.env.*`, but keep `.env.example`).
- Guard early: if `process.env.GROQ_API_KEY` is missing, exit with a clear message — beats a cryptic 401 later.
- `temperature: 0` = consistent answers while learning.

## 3. Messages: plain objects vs classes

You can seed state with plain objects:
```js
{ role: "system", content: "..." }   // → SystemMessage
{ role: "user",   content: "..." }   // → HumanMessage
```
`addMessages` coerces them into real LangChain message classes. You can also import and use
`SystemMessage`, `HumanMessage`, `AIMessage` from `@langchain/core/messages` directly — same result.
The model's reply is an `AIMessage`; read its text with `.content`.

## 4. Two things the run TAUGHT us (observed live)

### (a) Graphs are stateless across `invoke()` calls
Second invoke asked *"What did I just ask you?"* → **"You didn't ask me anything yet."**
Each `invoke()` starts from the input you give it; nothing carries over automatically.
To continue a conversation today you'd have to manually pass the old messages back in.
**Lesson 6 (checkpointers + `thread_id`) makes memory automatic.**

### (b) The LLM confidently got a fact wrong
Asked "what is LangGraph?", Llama answered that it "generates human-like text" — wrong; that's
an LLM, not LangGraph. The model's training data simply doesn't know LangGraph well, and it
**hallucinated** rather than admitting it. Your code was correct; the *knowledge* was missing.
> This is the entire motivation for **tools + RAG**: give the model a way to fetch real facts
> instead of guessing. That's Lesson 5.

## 5. What you'll actually use in real apps
- **The `callModel` node is ~unchanged in production** — pass `state.messages`, return `{ messages: [reply] }`.
- **System prompt** = the first message (persona/instructions). Often injected inside the node
  rather than passed by the caller:
  ```js
  async function callModel(state) {
    const sys = { role: "system", content: "You are..." };
    const res = await model.invoke([sys, ...state.messages]);
    return { messages: [res] };
  }
  ```
- **Model config** lives in one place; swap `llama-3.3-70b-versatile` for any Groq model id.

## 6. Gotchas
- `import "dotenv/config"` must run **before** anything reads `process.env` — keep it the first import.
- Send **`state.messages`** (the whole history), not just the latest message, or the model loses context within a run.
- The node must return `{ messages: [...] }` (an **array**), even for a single reply — the reducer expects a list.
- Don't `console.log` the whole AIMessage expecting a string — use `.content`.

## 7. Exercise
1. Move the system prompt **into** the node (as in §5) and remove it from the caller's input.
   Give the bot a fun persona ("answer like a pirate").
2. Chain two model nodes: `draft` (writes an answer) → `critique` (a second model call that
   shortens/improves the draft) → END. You'll pass `state.messages` through both.
3. Make a tiny multi-turn loop *by hand*: call `invoke`, take the returned `messages`, append a
   new user message, and `invoke` again with the full array. Watch it now "remember" — proving
   memory is just "feed history back in." (Lesson 6 automates exactly this.)
