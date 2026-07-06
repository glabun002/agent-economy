// One-time setup: create Analyst-7's own Crossmint smart wallet (it gets PAID, so it needs an account).
// Writes CROSSMINT_SIGNER_SECRET and CROSSMINT_WALLET_ADDRESS back into analyst/.env.
import { CrossmintWallets, createCrossmint } from "@crossmint/wallets-sdk";
import crypto from "node:crypto";
import fs from "node:fs";

const ENV_PATH = new URL(".env", import.meta.url).pathname;
// CHAIN=base creates the wallet on Base mainnet (requires a PRODUCTION Crossmint API key).
const CHAIN = process.env.CHAIN ?? "base-sepolia";

const apiKey = process.env.CROSSMINT_API_KEY;
if (!apiKey) {
  console.error("Missing CROSSMINT_API_KEY in analyst/.env (same staging key as agent/.env works)");
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
  console.log("Generated analyst signer master secret -> saved to analyst/.env");
}

const crossmint = createCrossmint({ apiKey });
const wallets = CrossmintWallets.from(crossmint);

console.log(`Creating Analyst-7's Crossmint smart wallet on ${CHAIN}...`);
const wallet = await wallets.createWallet({
  chain: CHAIN,
  recovery: { type: "server", secret },
  alias: "analyst-7",
});

upsertEnv("CROSSMINT_WALLET_ADDRESS", wallet.address);
console.log(`Analyst-7 wallet ready: ${wallet.address} (saved to analyst/.env)`);
console.log("This wallet RECEIVES payments — no funding needed. Run: npm start");
