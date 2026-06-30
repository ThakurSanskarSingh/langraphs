// Lesson 3 — Conditional edges (routing + loops). Still NO LLM.
//
// THE big idea: a normal edge is a fixed arrow ("after A, always go to B").
// A CONDITIONAL edge runs a function that LOOKS AT STATE and decides where to
// go next. This gives you two superpowers:
//   1) BRANCHING — pick a path based on data
//   2) LOOPING   — point back to an earlier node and repeat until done
// (2) is literally the skeleton of every agent: act -> check -> loop or finish.
//
// Run:  node lessons/03-conditional-edges.mjs

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

const line = (t) => console.log("\n========== " + t + " ==========");

// ---------------------------------------------------------------------------
// DEMO A — BRANCHING
// After `ingest`, a router inspects state.number and sends us to one of two
// nodes. The router returns a KEY; the mapping object turns that key into a
// destination node name.
// ---------------------------------------------------------------------------
line("DEMO A: branching (even vs odd)");
{
  const State = Annotation.Root({
    number: Annotation(),
    label: Annotation(),
  });

  const ingest = (s) => {
    console.log("  [ingest] number =", s.number);
    return {}; // does no work; just an anchor for the conditional edge
  };
  const evenNode = () => ({ label: "EVEN" });
  const oddNode = () => ({ label: "ODD" });
  const zeroNodeFn = () => ({ label: "ZERO" });

  // The router: (state) => a key string. Pure function, no side effects.
  // Check the MOST SPECIFIC case first — 0 is even, so it must be caught
  // before the `% 2 === 0` test, or 0 would route to "isEven".
  const route = (s) =>
    s.number === 0     ? "isZero" :
    s.number % 2 === 0 ? "isEven" :
                         "isOdd";

  const app = new StateGraph(State)
    .addNode("ingest", ingest)
    .addNode("evenNode", evenNode)
    .addNode("oddNode", oddNode)
    .addNode("zeroNode", zeroNodeFn)
    .addEdge(START, "ingest")
    // 3rd arg maps router's returned key -> destination node name:
    .addConditionalEdges("ingest", route, { isEven: "evenNode", isOdd: "oddNode", isZero: "zeroNode" })
    .addEdge("evenNode", END)
    .addEdge("oddNode", END)
    .addEdge("zeroNode", END)
    .compile();

  console.log("  invoke 4 ->", (await app.invoke({ number: 4 })).label);
  console.log("  invoke 7 ->", (await app.invoke({ number: 7 })).label);
  console.log("  invoke 0 ->", (await app.invoke({ number: 0 })).label);
}

// ---------------------------------------------------------------------------
// DEMO B — LOOPING + a second branch (Exercise 1).
// `increment` adds 1 to count. A router then decides:
//   count < 3  -> loop back to `increment`
//   else       -> go to the `celebrate` node, then END
//
// KEY DISTINCTION:
//   increment / celebrate  are NODES   -> return a state object, use addNode
//   router                 is a ROUTER -> returns a key string, use addConditionalEdges
// ---------------------------------------------------------------------------
line("DEMO B: loop until 3, then celebrate");
{
  const State = Annotation.Root({
    count: Annotation(),
  });

  const increment = (s) => {                 // NODE: returns state
    const next = (s.count ?? 0) + 1;
    console.log("  [increment] count:", s.count ?? 0, "->", next);
    return { count: next };
  };

  const celebrate = (s) => {                 // NODE: returns state
    console.log("  [celebrate] 🎉 reached", s.count);
    return {};
  };

  const router = (s) => (s.count < 3 ? "loop" : "celebrate"); // ROUTER: returns a key

  const app = new StateGraph(State)
    .addNode("increment", increment)
    .addNode("celebrate", celebrate)
    .addEdge(START, "increment")
    .addConditionalEdges("increment", router, {
      loop: "increment",        // <-- the loop: back to the same node
      celebrate: "celebrate",   // <-- branch out once count hits 3
    })
    .addEdge("celebrate", END)
    .compile();

  const r = await app.invoke({ count: 0 });
  console.log("  final count =", r.count);
}

// ---------------------------------------------------------------------------
// DEMO C — the SAFETY NET: recursionLimit
// A loop whose condition never flips would run forever. LangGraph caps total
// node-steps (default 25) and throws GraphRecursionError. You can raise it,
// but hitting it usually means your exit condition is wrong.
// ---------------------------------------------------------------------------
line("DEMO C: runaway loop is stopped by recursionLimit");
{
  const State = Annotation.Root({ n: Annotation() });
  const app = new StateGraph(State)
    .addNode("forever", (s) => ({ n: (s.n ?? 0) + 1 }))
    .addEdge(START, "forever")
    .addConditionalEdges("forever", () => "again", { again: "forever" }) // never stops
    .compile();

  try {
    await app.invoke({ n: 0 }, { recursionLimit: 10 }); // lower it so the demo is quick
    console.log("  (unexpected) finished");
  } catch (e) {
    console.log("  caught:", e.constructor.name, "- the exit condition never became true");
  }
}

console.log("\nDone. Conditional edge = a (state) => nextNode function. Loops = route back.");
