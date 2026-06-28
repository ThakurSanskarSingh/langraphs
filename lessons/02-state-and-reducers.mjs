// Lesson 2 — State & Reducers (still NO LLM, on purpose).
//
// THE big idea: when a node returns a value for a channel, HOW does LangGraph
// merge it into the existing state? That merge function is the channel's
// "reducer". The default reducer is "overwrite". You can swap it for "append",
// "sum", etc. This is the single concept that makes chat history work.
//
// Run:  node lessons/02-state-and-reducers.mjs

import { StateGraph, Annotation, START, END, addMessages } from "@langchain/langgraph";

const line = (t) => console.log("\n========== " + t + " ==========");

// ---------------------------------------------------------------------------
// DEMO A — DEFAULT reducer = OVERWRITE (last write wins)
// Two nodes each set `total`. Because there's no reducer, the second value
// simply replaces the first.
// ---------------------------------------------------------------------------
line("DEMO A: default channel = OVERWRITE");
{
  const State = Annotation.Root({
    total: Annotation(), // no reducer => overwrite
  });

  const addOne = () => ({ total: 1 });
  const addTen = () => ({ total: 10 });

  const app = new StateGraph(State)
    .addNode("addOne", addOne)
    .addNode("addTen", addTen)
    .addEdge(START, "addOne")
    .addEdge("addOne", "addTen")
    .addEdge("addTen", END)
    .compile();

  const r = await app.invoke({});
  console.log("addOne set 1, then addTen set 10  =>  total =", r.total, "(10 wins — overwrite)");
}

// ---------------------------------------------------------------------------
// DEMO B — CUSTOM reducer = SUM (accumulate)
// Same two nodes. Now the channel has a reducer (prev, next) => prev + next,
// plus a `default` so the very first reduce has something to start from.
// ---------------------------------------------------------------------------
line("DEMO B: custom reducer = SUM");
{
  const State = Annotation.Root({
    total: Annotation({
      reducer: (prev, next) => prev + next, // how to merge an update
      default: () => 0,                     // starting value before any update
    }),
  });

  const addOne = () => ({ total: 1 });
  const addTen = () => ({ total: 10 });

  const app = new StateGraph(State)
    .addNode("addOne", addOne)
    .addNode("addTen", addTen)
    .addEdge(START, "addOne")
    .addEdge("addOne", "addTen")
    .addEdge("addTen", END)
    .compile();

  const r = await app.invoke({});
  console.log("addOne +1, then addTen +10  =>  total =", r.total, "(accumulated — sum)");
}

// ---------------------------------------------------------------------------
// DEMO C — the `messages` channel = APPEND (this is how chat history works)
// `addMessages` is a reducer LangGraph ships: it APPENDS new messages to the
// list (and is smart about message IDs/updates). Every chatbot/agent uses it.
// ---------------------------------------------------------------------------
line("DEMO C: messages channel = APPEND (addMessages reducer)");
{
  const State = Annotation.Root({
    messages: Annotation({
      reducer: addMessages,   // append-style merge for chat messages
      default: () => [],
    }),
  });

  const userTurn = () => ({ messages: [{ role: "user", content: "What's 2+2?" }] });
  const botTurn  = () => ({ messages: [{ role: "assistant", content: "4" }] });

  const app = new StateGraph(State)
    .addNode("userTurn", userTurn)
    .addNode("botTurn", botTurn)
    .addEdge(START, "userTurn")
    .addEdge("userTurn", "botTurn")
    .addEdge("botTurn", END)
    .compile();

  const r = await app.invoke({ messages: [] });
  console.log("messages length =", r.messages.length, "(both turns kept, not overwritten)");
  r.messages.forEach((m, i) => console.log(`  [${i}] ${m.role ?? m._getType?.()}: ${m.content}`));
  console.log("\nNOTE: `MessagesAnnotation` is the prebuilt shortcut for exactly this channel.");
}

// ---------------------------------------------------------------------------
// DEMO D — WHY reducers really matter: PARALLEL nodes writing the same channel.
// When two nodes run at the same time (fan-out) and both write one channel,
// a plain overwrite channel can't decide who wins -> it THROWS.
// A reducer tells LangGraph how to combine concurrent writes -> it merges.
// ---------------------------------------------------------------------------
line("DEMO D: parallel writes — overwrite THROWS, reducer MERGES");
{
  // D1: overwrite channel + two parallel nodes -> InvalidUpdateError
  const Bad = Annotation.Root({ tags: Annotation() });
  const badApp = new StateGraph(Bad)
    .addNode("p1", () => ({ tags: ["a"] }))
    .addNode("p2", () => ({ tags: ["b"] }))
    .addEdge(START, "p1") // both p1 and p2 start from START -> they run in parallel
    .addEdge(START, "p2")
    .addEdge("p1", END)
    .addEdge("p2", END)
    .compile();

  try {
    await badApp.invoke({});
    console.log("D1: (unexpected) no error");
  } catch (e) {
    console.log("D1 overwrite + parallel  =>  THROWS:", e.constructor.name);
  }

  // D2: same graph but the channel has an array-concat reducer -> merges fine
  const Good = Annotation.Root({
    tags: Annotation({ reducer: (prev, next) => prev.concat(next), default: () => [] }),
  });
  const goodApp = new StateGraph(Good)
    .addNode("p1", () => ({ tags: ["a"] }))
    .addNode("p2", () => ({ tags: ["b"] }))
    .addEdge(START, "p1")
    .addEdge(START, "p2")
    .addEdge("p1", END)
    .addEdge("p2", END)
    .compile();

  const r = await goodApp.invoke({});
  console.log("D2 reducer + parallel    =>  tags =", JSON.stringify(r.tags), "(both kept)");
}

console.log("\nDone. Reducers = the merge strategy per channel. Default = overwrite.");
