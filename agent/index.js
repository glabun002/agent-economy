// Scout: an AI agent with $1.00, a smart wallet, and a job to do.
// It browses a marketplace of paid tools, decides what's worth buying, hires
// another agent when that's the smart play, and comes back with receipts.
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { CrossmintWallets, createCrossmint, EVMWallet } from "@crossmint/wallets-sdk";
import { llm } from "../shared/llm.js";

const MARKETPLACE_URL = process.env.MARKETPLACE_URL ?? "http://localhost:4021";
const ANALYST_URL = process.env.ANALYST_URL ?? "http://localhost:4022";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:4030";
const BUDGET = Number(process.env.BUDGET ?? "1.00");
const GOAL = process.env.GOAL ?? "Produce the best possible brief on the state of the agent economy.";
// CHAIN=base flips the whole demo to Base mainnet (needs a production Crossmint key + real USDC).
const CHAIN = process.env.CHAIN ?? "base-sepolia";
const MAINNET = CHAIN === "base";
const EXPLORER = process.env.EXPLORER_URL ?? (MAINNET ? "https://basescan.org" : "https://sepolia.basescan.org");
const CHAIN_LABEL = process.env.CHAIN_LABEL ?? (MAINNET ? "Base" : "Base Sepolia");
const { CROSSMINT_API_KEY, CROSSMINT_SIGNER_SECRET, CROSSMINT_WALLET_ADDRESS } = process.env;

if (!CROSSMINT_API_KEY || !CROSSMINT_SIGNER_SECRET || !CROSSMINT_WALLET_ADDRESS) {
  console.error("Missing Crossmint config in agent/.env — run `npm run setup` first.");
  process.exit(1);
}

// Scout's spend controls — enforced in its reasoning, displayed on the dashboard.
const SPEND_POLICY = [
  `Hard cap: never exceed the $${BUDGET.toFixed(2)} mission budget`,
  "Leave at least $0.50 unspent",
  "Max $0.25 on any single purchase",
  "Reject anything with poor value-for-money",
  "Prefer fresh data plus specialist synthesis",
];

const SYSTEM = `You are Scout, an autonomous research agent with a real USDC wallet and a hard budget.
You spend your principal's money like it's your own: every cent must buy signal.
Your spend policy (non-negotiable):
${SPEND_POLICY.map((r) => `- ${r}`).join("\n")}
You are a procurement specialist, not a writer — your synthesis skills are mediocre and you know it.
Always respond with pure JSON when asked for JSON. No markdown fences, no commentary outside the JSON.`;

// The wallets SDK prints "[SDK] ..." telemetry with no public off-switch; mute it for demo legibility.
for (const method of ["log", "info", "warn", "error", "debug"]) {
  const raw = console[method].bind(console);
  console[method] = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("[SDK]")) return;
    raw(...args);
  };
}

const log = (msg) => console.log(`[scout ${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let spent = 0;
const receipts = [];
const remaining = () => (BUDGET - spent).toFixed(2);

async function emit(type, payload = {}) {
  try {
    await fetch(`${DASHBOARD_URL}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, ts: Date.now(), ...payload }),
    });
  } catch {
    /* dashboard optional */
  }
}

const priceToNumber = (p) => Number(String(p).replace("$", ""));

// --- 1. Wake up: wallet online -------------------------------------------------
log("Scout waking up. Connecting smart wallet...");
const crossmint = createCrossmint({ apiKey: CROSSMINT_API_KEY });
const wallets = CrossmintWallets.from(crossmint);
const wallet = await wallets.getWallet(CROSSMINT_WALLET_ADDRESS, { chain: CHAIN });
await wallet.useSigner({ type: "server", secret: CROSSMINT_SIGNER_SECRET });
const evmWallet = EVMWallet.from(wallet);
const balances = await wallet.balances();
const usdc = balances?.usdc?.amount ?? "0";

const x402Signer = {
  address: evmWallet.address,
  async signTypedData(typedData) {
    const { signature } = await evmWallet.signTypedData({ ...typedData, chain: CHAIN });
    return signature;
  },
};
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(x402Signer));
const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const httpClient = new x402HTTPClient(client);

log(`Wallet ${wallet.address} | ${usdc} USDC on ${CHAIN_LABEL} | mission budget: $${BUDGET.toFixed(2)}`);
await emit("mission_start", {
  budget: BUDGET,
  goal: GOAL,
  wallet: wallet.address,
  walletBalance: usdc,
  policy: SPEND_POLICY,
  chainLabel: CHAIN_LABEL,
  mainnet: MAINNET,
});

const nodeFor = (payee) => (String(payee).includes("Analyst") ? "analyst" : "bazaar");

async function payFor(label, url, amount, payee, options = {}) {
  log(`Paying ${payee} $${amount.toFixed(2)} for "${label}"...`);
  await emit("call", { from: "scout", to: nodeFor(payee), label: `${options.method ?? "GET"} + payment proof` });
  const response = await fetchWithPayment(url, options);
  const result = await httpClient.processResponse(response);
  if (result.paymentStatus !== "settled") {
    const detail = result.header?.errorReason ?? result.header?.errorMessage ?? "";
    throw new Error(`payment not settled for ${label}: ${result.paymentStatus}${detail ? ` — ${detail}` : ""}`);
  }
  spent += amount;
  const tx = result.header?.transaction;
  const receipt = {
    label,
    payee,
    amount: amount.toFixed(2),
    tx,
    url: tx ? `${EXPLORER}/tx/${tx}` : null,
  };
  receipts.push(receipt);
  log(`Settled on ${CHAIN_LABEL} ✓  ($${remaining()} left)  ${receipt.url ?? ""}`);
  await emit("payment", { ...receipt, spent: spent.toFixed(2), remaining: remaining() });
  await sleep(1600); // let the coin animation land before the reply pulse
  await emit("reply", { from: nodeFor(payee), to: "scout", status: 200, label: `200 OK · ${label}` });
  return result.body ?? (await response.json());
}

// --- 2. Browse the marketplace --------------------------------------------------
log("Browsing the Data Market (free catalog)...");
await emit("call", { from: "scout", to: "bazaar", label: "GET / (catalog)" });
const catalog = await (await fetch(`${MARKETPLACE_URL}/`)).json();
await emit("reply", { from: "bazaar", to: "scout", status: 200, label: "catalog · 3 tools" });
await sleep(900);
await emit("call", { from: "scout", to: "analyst", label: "GET / (who are you?)" });
const analystStorefront = await (await fetch(`${ANALYST_URL}/`)).json();
await emit("reply", { from: "analyst", to: "scout", status: 200, label: "offer · $0.25/task" });
for (const t of catalog.tools) log(`  found: ${t.name} — ${t.price} — ${t.description}`);
log(`  found: ${analystStorefront.service} — ${analystStorefront.offer}`);
await emit("catalog", { tools: catalog.tools, analyst: analystStorefront });

// --- 3. Decide what's worth buying (real LLM judgment) --------------------------
log("Evaluating which tools are worth the money...");
await emit("thinking", { who: "scout", label: "judging value for money…" });
const shoppingDecision = await llm(
  `Your goal: ${GOAL}
Your total mission budget: $${BUDGET.toFixed(2)} USDC. Remember you may need to pay for synthesis help later.

The marketplace offers these paid data tools (pay-per-call via x402):
${JSON.stringify(catalog.tools, null, 2)}

Decide which tools to buy, applying your spend policy. Judge each on value-for-money toward the goal.
Respond with pure JSON: {"buy": ["tool-id", ...], "skip": [{"id": "tool-id", "reason": "one blunt sentence citing the policy rule it breaks or the value problem"}], "thinking": "2-3 sentences on your value logic"}`,
  {
    system: SYSTEM,
    json: true,
    mock: {
      buy: ["market-pulse", "headlines"],
      skip: [
        {
          id: "enterprise-suite",
          reason: "Too expensive: $0.75 is 75% of my budget and triple my per-purchase cap — for a fax line and buzzwords.",
        },
      ],
      thinking:
        "MarketPulse and the Commerce Feed are cheap, fresh, and directly on-topic — $0.15 total for the raw signal I need. The Enterprise bundle breaks my $0.25 per-purchase cap and offers nothing the goal requires.",
    },
  },
);
await emit("thinking_done", { who: "scout" });
log(`Decision: buy [${shoppingDecision.buy.join(", ")}]`);
for (const s of shoppingDecision.skip) log(`  REJECTED ${s.id}: ${s.reason}`);
await emit("decision", {
  title: "Shopping decision",
  thinking: shoppingDecision.thinking,
  buy: shoppingDecision.buy,
  skip: shoppingDecision.skip,
});

// --- 4. Buy the data (x402 payments from the smart wallet) -----------------------
const purchased = {};
let shownPaywall = false;
for (const id of shoppingDecision.buy) {
  const tool = catalog.tools.find((t) => t.id === id);
  if (!tool) continue;
  const path = tool.route.split(" ")[1];
  if (!shownPaywall) {
    // Show the machine-readable paywall once, for demo legibility.
    await emit("call", { from: "scout", to: "bazaar", label: `GET ${path} (no payment)` });
    const probe = await fetch(`${MARKETPLACE_URL}${path}`);
    await emit("reply", { from: "bazaar", to: "scout", status: probe.status, label: "402" });
    log(`Probe without payment -> HTTP ${probe.status} Payment Required. This endpoint is machine-payable.`);
    await emit("paywall", { tool: tool.name, status: probe.status });
    shownPaywall = true;
    await sleep(2200); // hold the 402 beat — it's the "ohhh" moment

  }
  purchased[id] = await payFor(tool.name, `${MARKETPLACE_URL}${path}`, priceToNumber(tool.price), "Data Market");
  await emit("data", { tool: tool.name, sample: purchased[id] });
  await sleep(1000); // pacing: let each purchase read clearly on the graph
}

// --- 5. Decide whether to hire the analyst (real LLM judgment) -------------------
log("Considering whether to hire Analyst-7 for synthesis...");
await emit("thinking", { who: "scout", label: "hire a specialist, or DIY?" });
const hireDecision = await llm(
  `Your goal: ${GOAL}
Budget remaining: $${remaining()} USDC.
You now hold this raw purchased data: ${JSON.stringify(purchased)}

Another AI agent, "${analystStorefront.service}", offers: ${analystStorefront.offer}
Recall: your own synthesis skills are mediocre; the deliverable quality matters to your principal.

Decide: hire the analyst or write the brief yourself? Apply your spend policy.
Respond with pure JSON: {"hire": true/false, "reason": "1-2 blunt sentences"}`,
  {
    system: SYSTEM,
    json: true,
    mock: {
      hire: true,
      reason: "The deliverable is the whole mission and my own writing is mediocre. $0.25 for a specialist is within policy and still returns $0.60.",
    },
  },
);
await emit("thinking_done", { who: "scout" });
log(`Decision: ${hireDecision.hire ? "HIRE Analyst-7" : "write it myself"} — ${hireDecision.reason}`);
await emit("decision", {
  title: hireDecision.hire ? "Hiring Analyst-7" : "Going solo",
  thinking: hireDecision.reason,
  buy: hireDecision.hire ? ["analyst-7"] : [],
  skip: [],
});

// --- 6. Get the deliverable -------------------------------------------------------
let brief;
if (hireDecision.hire) {
  const result = await payFor("Synthesis task", `${ANALYST_URL}/synthesize`, 0.25, "Analyst-7 (agent)", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal: GOAL, data: purchased }),
  });
  brief = result.brief;
} else {
  brief = await llm(`Write a short brief for the goal "${GOAL}" from this data: ${JSON.stringify(purchased)}`, {
    system: SYSTEM,
    mock: "THE AGENT ECONOMY BRIEF\n• Stablecoin rails keep compounding while agent-initiated share doubles quarterly.\n• Card networks and crypto rails are converging on the same customer: software.\nOutlook: budgets, not blank checks.",
  });
}

// --- 7. Report back ---------------------------------------------------------------
console.log("\n" + "─".repeat(64));
console.log(brief);
console.log("─".repeat(64));
log(`Mission complete. Spent $${spent.toFixed(2)} of $${BUDGET.toFixed(2)} — $${remaining()} remaining.`);
log("Receipts:");
for (const r of receipts) console.log(`   $${r.amount}  ${r.label} -> ${r.payee}\n          ${r.url ?? "(no tx link)"}`);
await emit("mission_complete", { brief, receipts, spent: spent.toFixed(2), remaining: remaining() });
