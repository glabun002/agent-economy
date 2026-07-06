// The marketplace: three priced, x402-protected data tools.
// One of them (enterprise-suite) is deliberately overpriced — bait for the buyer agent's judgment.
import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const PAY_TO = process.env.PAY_TO;
const PORT = process.env.PORT ?? 4021;
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://facilitator.x402.rs";
const NETWORK = process.env.NETWORK ?? "eip155:84532"; // Base Sepolia

if (!PAY_TO) {
  console.error("Missing PAY_TO in .env (seller receive address)");
  process.exit(1);
}

const TOOLS = [
  {
    id: "market-pulse",
    route: "GET /api/market-pulse",
    price: "$0.10",
    name: "MarketPulse API",
    description: "Live stablecoin settlement volumes, top corridors, and growth rates.",
  },
  {
    id: "headlines",
    route: "GET /api/headlines",
    price: "$0.05",
    name: "Agent Commerce Feed",
    description: "This week's most important agentic-payments developments.",
  },
  {
    id: "enterprise-suite",
    route: "GET /api/enterprise-suite",
    price: "$0.75",
    name: "Enterprise Intelligence Bundle",
    description:
      "Comprehensive legacy analytics bundle. Includes PDF export, quarterly webinar access, and a dedicated fax line.",
  },
];

const DATA = {
  "market-pulse": {
    tool: "market-pulse",
    asOf: new Date().toISOString().slice(0, 10),
    stablecoinSettlementVolume30d: "$2.9T",
    yoyGrowth: "61%",
    topCorridors: ["US-MX remittances", "SEA payroll", "LATAM B2B"],
    agentInitiatedShare: "4.2% and doubling quarterly",
  },
  headlines: {
    tool: "headlines",
    items: [
      "Visa and Mastercard both ship agent-payment APIs within the same quarter.",
      "x402 endpoints pass 10,000 live machine-payable services.",
      "First enterprise treasury pilots delegated wallets with programmatic spend caps.",
    ],
  },
  "enterprise-suite": {
    tool: "enterprise-suite",
    report: "Synergistic paradigm alignment metrics attached as PDF (fax delivery within 5 business days).",
  },
};

const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const x402Server = new x402ResourceServer(facilitator);
x402Server.register("eip155:*", new ExactEvmScheme());

const app = express();
app.use(express.json());

// Free catalog — how agents discover what's for sale.
app.get("/", (_req, res) =>
  res.json({
    service: "Data Market",
    payment: "x402 (USDC on Base Sepolia)",
    tools: TOOLS.map(({ id, route, price, name, description }) => ({ id, route, price, name, description })),
  }),
);

const paywallConfig = {};
for (const tool of TOOLS) {
  paywallConfig[tool.route] = {
    accepts: [{ scheme: "exact", price: tool.price, network: NETWORK, payTo: PAY_TO }],
    description: tool.name,
    mimeType: "application/json",
  };
}
app.use(paymentMiddleware(paywallConfig, x402Server));

for (const tool of TOOLS) {
  const path = tool.route.split(" ")[1];
  app.get(path, (_req, res) => {
    console.log(`[bazaar] payment settled — served ${tool.id} (${tool.price})`);
    res.json(DATA[tool.id]);
  });
}

app.listen(PORT, () => {
  console.log(`[bazaar] Data Bazaar listening on http://localhost:${PORT}`);
  for (const t of TOOLS) console.log(`[bazaar]   ${t.price.padStart(6)}  ${t.name}  (${t.route})`);
});
