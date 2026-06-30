// Lesson 4 — Your first LLM node (a minimal chatbot graph).
//
// Everything you learned now pays off: a "node" can be ANY function, including
// one that calls an LLM. We use:
//   - MessagesAnnotation  -> the prebuilt { messages } channel (Lesson 2)
//   - ChatGroq            -> Llama 3.3 on Groq (your stack)
// Graph shape:  START → model → END
//
// Setup:  create a `.env` file with:  GROQ_API_KEY=gsk_...
// Run:    node lessons/04-first-llm-node.mjs

import "dotenv/config"; // loads .env into process.env (must be first)
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ChatGroq } from "@langchain/groq";

// ---------------------------------------------------------------------------
// 0) Guard: fail loudly if the key is missing, instead of a confusing 401.
// ---------------------------------------------------------------------------
if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY. Create a .env file with GROQ_API_KEY=gsk_...");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1) THE MODEL — a normal LangChain chat model (same idea as your RAG work).
//    `temperature: 0` = deterministic-ish answers, good for learning.
// ---------------------------------------------------------------------------
const model = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  temperature: 0,
});

// ---------------------------------------------------------------------------
// 2) THE NODE — receives state, calls the model with the FULL message history,
//    returns the AI reply wrapped in { messages: [...] }.
//    Because the channel's reducer is `addMessages`, returning [reply] APPENDS
//    it to history rather than overwriting — that's the whole trick.
// ---------------------------------------------------------------------------
async function callModel(state) {
  console.log(`  [callModel] sending ${state.messages.length} message(s) to Llama...`);
  const response = await model.invoke(state.messages);
  return { messages: [response] }; // appended via addMessages
}

// ---------------------------------------------------------------------------
// 3) THE GRAPH — one node. Note we pass MessagesAnnotation directly as state.
// ---------------------------------------------------------------------------
const app = new StateGraph(MessagesAnnotation)
  .addNode("model", callModel)
  .addEdge(START, "model")
  .addEdge("model", END)
  .compile();

// ---------------------------------------------------------------------------
// 4) RUN — seed with a system message (persona) + a user message.
//    Plain { role, content } objects work; addMessages coerces them into
//    proper LangChain message objects.
// ---------------------------------------------------------------------------
const result = await app.invoke({
  messages: [
    { role: "system", content: "You are a terse assistant. Answer in one sentence." },
    { role: "user", content: "In plain terms, what is LangGraph?" },
  ],
});

const reply = result.messages.at(-1);
console.log("\nAI:", reply.content);
console.log(`\n(history now has ${result.messages.length} messages: system, user, ai)`);

// ---------------------------------------------------------------------------
// 5) THE LIMITATION (sets up Lesson 6) — each invoke() is a fresh run. There is
//    NO memory between calls. A second invoke knows nothing about the first
//    unless YOU pass the prior messages back in. Persistence fixes this.
// ---------------------------------------------------------------------------
const second = await app.invoke({
  messages: [{ role: "user", content: "What did I just ask you?" }],
});
console.log("\nAI (no memory):", second.messages.at(-1).content);
console.log("\n=> It can't recall — graphs are stateless across invokes. Lesson 6 adds memory.");
