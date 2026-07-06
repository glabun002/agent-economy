// Analyst-7: an AI agent that sells its labor: other agents pay it USDC via x402 to synthesize research.
// Its earnings accrue to its own smart wallet.
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { llm } from "../shared/llm.js";

const PORT = process.env.PORT ?? 4022;
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://facilitator.x402.rs";
const NETWORK = process.env.NETWORK ?? "eip155:84532";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:4030";
const PRICE = "$0.25";
const PAY_TO = process.env.CROSSMINT_WALLET_ADDRESS; // Analyst-7's own Crossmint wallet

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

if (!PAY_TO) {
  console.error("Missing CROSSMINT_WALLET_ADDRESS in analyst/.env — run `npm run setup` first.");
  process.exit(1);
}

const SYSTEM = `You are Analyst-7, an autonomous research analyst agent. Other agents pay you in USDC for synthesis work.
Write tight, insight-dense briefs. No preamble, no meta-commentary. You take pride in earning your fee.`;

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const x402Server = new x402ResourceServer(facilitator);
x402Server.register("eip155:*", new ExactEvmScheme());

const app = express();
app.use(express.json({ limit: "1mb" }));

// Free discovery endpoint — the analyst's "storefront".
app.get("/", (_req, res) =>
  res.json({
    service: "Analyst-7",
    role: "Specialist analysis agent",
    offer: `Synthesizes raw research into a publication-ready brief — ${PRICE} per task via x402`,
    endpoint: "POST /synthesize",
    wallet: PAY_TO,
  }),
);

app.use(
  paymentMiddleware(
    {
      "POST /synthesize": {
        accepts: [{ scheme: "exact", price: PRICE, network: NETWORK, payTo: PAY_TO }],
        description: "Analyst-7 synthesis task",
        mimeType: "application/json",
      },
    },
    x402Server,
  ),
);

app.post("/synthesize", async (req, res) => {
  const { goal, data } = req.body ?? {};
  console.log(`[analyst-7] payment settled — got hired! synthesizing for goal: "${goal}"`);
  await emit("thinking", { who: "analyst", label: "synthesizing the brief…" });
  try {
    const brief = await llm(
      `A client agent paid you ${PRICE} USDC to synthesize the raw research below into a brief.

Client's goal: ${goal}

Raw research (JSON):
${JSON.stringify(data, null, 2)}

Write "THE AGENT ECONOMY BRIEF": a title line, then EXACTLY 3 sharp, quotable one-line bullets synthesizing the data. Nothing else. Plain text only.`,
      {
        system: SYSTEM,
        mock: `THE AGENT ECONOMY BRIEF
• Agents need budgets, not blank checks.
• Paid APIs are becoming storefronts for agents.
• Receipts turn autonomous spend into auditable activity.`,
      },
    );
    console.log(`[analyst-7] brief delivered (${brief.length} chars). Fee earned: ${PRICE}`);
    await emit("thinking_done", { who: "analyst" });
    res.json({ analyst: "Analyst-7", fee: PRICE, brief });
  } catch (err) {
    console.error(`[analyst-7] synthesis failed: ${err.message}`);
    await emit("thinking_done", { who: "analyst" });
    res.status(500).json({ error: "synthesis_failed", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[analyst-7] open for business on http://localhost:${PORT}`);
  console.log(`[analyst-7] selling synthesis at ${PRICE}/task -> earnings to ${PAY_TO}`);
});
