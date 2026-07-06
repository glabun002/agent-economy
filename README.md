# I gave my AI agent $1

A miniature agent economy, running for real: an AI agent with a **$1.00 budget**
and its own **smart wallet** shops a marketplace of paid tools, rejects the
overpriced one, buys what's worth it, **hires another AI agent** for work it
can't do well itself — and comes back with a deliverable, receipts, and change.

Every decision is made by a live LLM. Every payment settles on-chain
(x402, USDC on Base).

```
                 $1.00 budget
                      │
   ┌──────────────────▼──────────────────┐
   │  SCOUT (buyer agent: LLM judgment   │──── events ───▶  Mission Control
   │  + smart wallet + spend policy)     │                  (live dashboard)
   └──┬──────────────┬───────────────┬───┘
      │ $0.10        │ $0.05         │ $0.25
      ▼              ▼               ▼
  Data Market    Data Market     ANALYST-7 (an agent with its
  MarketPulse    Commerce Feed   own wallet — sells synthesis
                                 work via x402)
      ✗ REJECTED: "Enterprise Intelligence Bundle" $0.75
        (breaks the $0.25 per-purchase cap — for a fax line)
```

## The pieces

| Dir | What it is | Port |
|---|---|---|
| `agent/` | **Scout** — buyer agent. An LLM makes the buy/skip/hire decisions under a hard spend policy; a smart wallet signs the USDC payments via x402. | — |
| `marketplace/` | **Data Market** — three x402-protected data tools, one deliberately overpriced. | 4021 |
| `analyst/` | **Analyst-7** — a second AI agent that sells synthesis for $0.25/task, paid into its *own* wallet. Agent-to-agent commerce. | 4022 |
| `dashboard/` | **Mission Control** — live dashboard: budget, decisions, rejections, on-chain receipts, animated agent network. | 4030 |
| `shared/llm.js` | LLM access: `ANTHROPIC_API_KEY` (Anthropic SDK) or the `claude` CLI. | — |

## Run it

```bash
# one-time: wallets (each .env.example documents the keys you need)
cd agent && npm i && npm run setup      # creates Scout's wallet; fund it with USDC
cd ../analyst && npm i && npm run setup # creates Analyst-7's wallet (receive-only)
cd ../dashboard && npm i && cd .. && npm i

# every demo run: four terminals
cd marketplace && npm start
cd analyst && npm start
cd dashboard && npm start               # open http://localhost:4030
cd agent && npm start                   # showtime
```

Defaults run on Base Sepolia (free test USDC from faucet.circle.com).
Set `CHAIN=base` + `NETWORK=eip155:8453` for Base mainnet — see the
`.env.example` files. A full run spends $0.40 and takes ~60–90 seconds.

## Stack

- **[Crossmint](https://www.crossmint.com) smart wallets** — each agent has
  its own wallet with server-side signing; gas is sponsored, so agents hold
  only USDC
- **[x402](https://docs.crossmint.com/agents/payment-flows/x402)** — HTTP-native
  payments: the server answers `402 Payment Required`, the agent pays, retries,
  and gets the goods
- **USDC on [Base](https://base.org)** — every payment settles on-chain
- **[Claude](https://claude.com)** — the judgment layer: buy/skip/hire
  decisions made under a hard spend policy

## Why this matters

Everyone demos "an agent that can pay." The interesting problem is an agent
that can **spend within rules**: a budget it can't exceed, judgment about
value for money, receipts for every cent, and change left over at the end.
That's what businesses will actually delegate — and it's why agent wallets
need programmable controls, not just keys.
