// Mission control: receives events from the buyer agent and streams them to the browser via SSE.
import express from "express";

const PORT = process.env.PORT ?? 4030;
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(new URL("public", import.meta.url).pathname));

let history = [];
const clients = new Set();

// Visit /reset in the browser to wipe the board back to its waiting state.
app.get("/reset", (_req, res) => {
  history = [];
  res.redirect("/");
});

app.post("/events", (req, res) => {
  const event = req.body;
  if (event?.type === "mission_start") history = []; // fresh run resets the board
  history.push(event);
  for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`);
  res.json({ ok: true });
});

app.get("/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  for (const event of history) res.write(`data: ${JSON.stringify(event)}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.listen(PORT, () => console.log(`[mission-control] http://localhost:${PORT}`));
