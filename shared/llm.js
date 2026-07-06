// LLM helper used by the buyer agent and the analyst service.
// Auth order: ANTHROPIC_API_KEY (Anthropic SDK) -> `claude -p` CLI (subscription auth).
// LLM_MOCK=1 returns the caller-supplied mock (plumbing tests only — never for recordings).
import { spawnSync } from "node:child_process";

const MODEL = process.env.LLM_MODEL ?? "claude-opus-4-8";

async function callApi(prompt, system) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    ...(system ? { system } : {}),
    messages: [{ role: "user", content: prompt }],
  });
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function callCli(prompt, system) {
  const full = system ? `${system}\n\n---\n\n${prompt}` : prompt;
  const result = spawnSync("claude", ["-p", full, "--output-format", "text"], {
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`claude CLI failed: ${result.stderr?.slice(0, 500) || "unknown error"}`);
  }
  return result.stdout.trim();
}

export async function llm(prompt, { system, json = false, mock } = {}) {
  if (process.env.LLM_MOCK === "1") {
    if (mock === undefined) throw new Error("LLM_MOCK set but no mock provided");
    return mock;
  }
  const text = process.env.ANTHROPIC_API_KEY ? await callApi(prompt, system) : callCli(prompt, system);
  if (!json) return text;
  // Model was asked for pure JSON; strip fences defensively and parse.
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`LLM did not return JSON: ${text.slice(0, 200)}`);
  return JSON.parse(cleaned.slice(start, end + 1));
}
