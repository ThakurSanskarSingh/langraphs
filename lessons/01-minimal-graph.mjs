// Lesson 1 — A minimal graph with NO LLM.
// Goal: understand State, Node, Edge, START/END, compile, invoke — with zero magic.
//
// Graph shape:   START → greet → shout → END
//
// Run:  node lessons/01-minimal-graph.mjs

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// ---------------------------------------------------------------------------
// 1) STATE — the shared object every node reads from and writes to.
//    `Annotation.Root({...})` defines the schema. Each key is a "channel".
//    A bare `Annotation()` = a plain field that gets OVERWRITTEN when a node
//    returns a new value for it (this is the default merge behavior).
// ---------------------------------------------------------------------------
const State = Annotation.Root({
  name: Annotation(),     // input we pass in
  greeting: Annotation(), // written by `greet`
  loud: Annotation(),     // written by `shout`
  loudest: Annotation(),  // written by `louder` node
});

// ---------------------------------------------------------------------------
// 2) NODES — plain functions: (state) => partial update.
//    A node returns ONLY the keys it wants to change. LangGraph merges it
//    into the running state for you.
// ---------------------------------------------------------------------------
function greet(state) {
  console.log("  [node: greet]  saw name =", state.name);
  return { greeting: `Hello, ${state.name}!` }; // only touches `greeting`
}

function shout(state) {
  console.log("  [node: shout]  saw greeting =", state.greeting);
  return { loud: state.greeting.toUpperCase() }; // only touches `loud`
}
function louder(state){
  console.log(" [node:louder] saw loud =", state.loud);
  return { loudest: state.loud + "!!!" }; // write to the `loudest` channel
}

// ---------------------------------------------------------------------------
// 3) GRAPH — wire nodes together with edges. Nodes are referenced by NAME.
// ---------------------------------------------------------------------------
const app = new StateGraph(State)
  .addNode("greet", greet)
  .addNode("shout", shout)
  .addNode("louder", louder)
  .addEdge(START, "greet")   // entry point
  .addEdge("greet", "shout") // greet → shout
  .addEdge("shout", "louder")
  .addEdge("louder", END)     // louder  → stop
  .compile();                // turn the blueprint into a runnable app

// ---------------------------------------------------------------------------
// 4) RUN — invoke with an initial state. Get back the FINAL state.
// ---------------------------------------------------------------------------
console.log("Invoking graph with { name: 'Sanskar' }...");
const result = await app.invoke({ name: "Sanskar" });

console.log("\nFinal state:");
console.log(result);
console.log("\n=> loud:", result.loud);
