// One-time setup: create a Crossmint smart wallet for the agent on Base Sepolia.
// Idempotent — safe to re-run. Writes CROSSMINT_SIGNER_SECRET and
// CROSSMINT_WALLET_ADDRESS back into .env.
import { CrossmintWallets, createCrossmint } from "@crossmint/wallets-sdk";
import crypto from "node:crypto";
import fs from "node:fs";

const ENV_PATH = new URL(".env", import.meta.url).pathname;
// CHAIN=base creates the wallet on Base mainnet (requires a PRODUCTION Crossmint API key).
const CHAIN = process.env.CHAIN ?? "base-sepolia";

const apiKey = process.env.CROSSMINT_API_KEY;
if (!apiKey) {
  console.error("Missing CROSSMINT_API_KEY in agent/.env");
  console.error("Create a STAGING server key at https://staging.crossmint.com (Developers -> API Keys)");
  console.error("Scopes: wallets.create, wallets.read, wallets:transactions.create, wallets:transactions.sign, wallets:balance.read");
  process.exit(1);
}

function upsertEnv(key, value) {
  let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : env + (env.endsWith("\n") || env === "" ? "" : "\n") + line + "\n";
  fs.writeFileSync(ENV_PATH, env);
}

let secret = process.env.CROSSMINT_SIGNER_SECRET;
if (!secret) {
  secret = crypto.randomBytes(32).toString("hex");
  upsertEnv("CROSSMINT_SIGNER_SECRET", secret);
  console.log("Generated new signer master secret -> saved to agent/.env (testnet only, gitignored)");
}

const crossmint = createCrossmint({ apiKey });
const wallets = CrossmintWallets.from(crossmint);

console.log(`Creating Crossmint smart wallet on ${CHAIN}...`);
const wallet = await wallets.createWallet({
  chain: CHAIN,
  recovery: { type: "server", secret },
  alias: "signal-desk-agent",
});

upsertEnv("CROSSMINT_WALLET_ADDRESS", wallet.address);
console.log(`Agent wallet ready: ${wallet.address} (saved to agent/.env)`);

const balances = await wallet.balances();
const usdc = balances?.usdc?.amount ?? "0";
console.log(`USDC balance: ${usdc}`);
if (Number(usdc) === 0) {
  console.log("");
  if (CHAIN === "base") {
    console.log("Next step — send a SMALL amount of real USDC on Base (keep it ~$1.50, no more):");
    console.log(`  address: ${wallet.address}`);
    console.log("  (Coinbase withdrawal on Base network works; double-check the network!)");
  } else {
    console.log("Next step — fund the wallet with testnet USDC:");
    console.log("  1. Go to https://faucet.circle.com");
    console.log("  2. Select network: Base Sepolia");
    console.log(`  3. Paste address: ${wallet.address}`);
  }
  console.log("Then run: npm start");
}
