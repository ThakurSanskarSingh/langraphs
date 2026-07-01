// Lesson 5 — Tools + the Agent Loop (ReAct), built by hand, then the shortcut.
//
// This is THE lesson where everything converges:
//   - The LLM can now decide to CALL A TOOL instead of just answering.
//   - A conditional edge (Lesson 3!) routes: tool requested -> run it -> loop back.
//   - The loop (Lesson 3!) repeats until the LLM is done, then answers.
//
// Graph shape (the ReAct loop):
//
//        START
//          │
//          ▼
//      ┌─ agent ◀────────┐
//      │   │             │
//      │   ▼ (router)    │
//      │  tool? ── yes ─▶ tools ─┘   (run tool, loop back to agent)
//      │   │
//      │   no
//      ▼   ▼
//         END
//
// Run:  node lessons/05-tools-and-agent-loop.mjs

import "dotenv/config";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatGroq } from "@langchain/groq";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

if (!process.env.GROQ_API_KEY) {
  console.error("Missing GROQ_API_KEY in .env");
  process.exit(1);
}

// ===========================================================================
// 1) TOOLS — a tool is a function + a name + a description + an args schema.
//    The DESCRIPTION and SCHEMA are how the LLM knows what the tool does and
//    what arguments to pass. Write them like docs for the model.
// ===========================================================================
const multiply = tool(
  async ({ a, b }) => {
    console.log(`    🔧 multiply(${a}, ${b})`);
    return `${a * b}`; // tools should return a string (or string-able) result
  },
  {
    name: "multiply",
    description: "Multiply two numbers together.",
    schema: z.object({ a: z.number(), b: z.number() }),
  }
);

const getWeather = tool(
  async ({ city }) => {
    console.log(`    🔧 getWeather(${city})`);
    const fake = { Tokyo: "22°C, clear", Delhi: "38°C, hazy", London: "14°C, rain" };
    return fake[city] ?? "Unknown city";
  },
  {
    name: "getWeather",
    description: "Get the current weather for a given city.",
    schema: z.object({ city: z.string().describe("City name, e.g. 'Tokyo'") }),
  }
);

const getName = tool(
  async ({find}) => {
    console.log("get Name tool calling");
    return `name is ${find}`
  },
  {
    name : "getName",
    description : "Get the name of the user",
    schema : z.object({find : z.string().describe("user name lilke sansu")})
  }
)

const tools = [multiply, getWeather, getName];
const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));

// ===========================================================================
// 2) MODEL WITH TOOLS — .bindTools() tells the LLM which tools exist. Now the
//    model can respond with a normal answer OR with `tool_calls` (a request to
//    run one or more tools). It does NOT run them — it just asks.
// ===========================================================================
const model = new ChatGroq({ model: "llama-3.3-70b-versatile", temperature: 0 }).bindTools(tools);

// ===========================================================================
// 3) NODES
// ===========================================================================

// agent node: call the LLM with full history. Reply may contain tool_calls.
async function agent(state) {
  const res = await model.invoke(state.messages);
  if (res.tool_calls?.length) {
    console.log(`  [agent] requested tool(s): ${res.tool_calls.map((c) => c.name).join(", ")}`);
  } else {
    console.log(`  [agent] final answer`);
  }
  return { messages: [res] };
}

// tools node (BY HAND so you see it): execute each requested tool call and
// return a ToolMessage per call. The tool_call_id links result back to request.
async function runTools(state) {
  const last = state.messages.at(-1);
  const outputs = [];
  for (const call of last.tool_calls) {
    const selected = toolsByName[call.name];
    const result = await selected.invoke(call.args);
    outputs.push({
      role: "tool",
      content: String(result),
      tool_call_id: call.id, // <-- ties this result to the model's request
    });
  }
  return { messages: outputs }; // appended; model sees results on next loop
}

// ===========================================================================
// 4) ROUTER — the conditional edge from Lesson 3, the real-world version.
//    If the last AI message asked for tools -> go run them. Else -> finish.
// ===========================================================================
function shouldContinue(state) {
  const last = state.messages.at(-1);
  return last.tool_calls?.length ? "tools" : END;
}

// ===========================================================================
// 5) WIRE THE LOOP
// ===========================================================================
const app = new StateGraph(MessagesAnnotation)
  .addNode("agent", agent)
  .addNode("tools", runTools)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, { tools: "tools", [END]: END })
  .addEdge("tools", "agent") // <-- after running tools, loop BACK to the agent
  .compile();

// ===========================================================================
// 6) RUN — a query that needs a tool, then one that needs TWO tools.
// ===========================================================================
console.log("\n--- Q1: needs the multiply tool ---");
const q1 = await app.invoke({ messages: [{ role: "user", content: "What is 23 times 17?" }] });
console.log("AI:", q1.messages.at(-1).content);

console.log("\n--- Q2: needs weather AND multiply ---");
const q2 = await app.invoke({
  messages: [{ role: "user", content: "What's the weather in Tokyo, and what is 12 times 12?" }],
});
console.log("AI:", q2.messages.at(-1).content);

// ===========================================================================
// 7) THE SHORTCUTS — everything above is so common LangGraph ships it prebuilt.
//    - ToolNode      replaces our hand-written `runTools`.
//    - createReactAgent builds this ENTIRE graph (agent + tools + loop) for you.
// ===========================================================================
console.log("\n--- Same agent via createReactAgent (1 line) ---");
const { createReactAgent } = await import("@langchain/langgraph/prebuilt");
const prebuilt = createReactAgent({ llm: model, tools }); // ToolNode used internally
const p = await prebuilt.invoke({ messages: [{ role: "user", content: "What is 9 times 9?" }] });
console.log("AI:", p.messages.at(-1).content);

console.log("\nNote: ToolNode is the prebuilt version of our `runTools` node.");
