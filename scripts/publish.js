#!/usr/bin/env node
// Publishes the next queued post to Threads via the official Threads API.
// Usage: THREADS_ACCESS_TOKEN=... node scripts/publish.js
// Queue: queue.json in repo root — array of {id, text, image_url?, status, wave}
// Publishes the FIRST item with status "queued", marks it "posted" (or "failed").

const fs = require("fs");
const path = require("path");

const QUEUE = path.join(__dirname, "..", "queue.json");
const API = "https://graph.threads.net/v1.0";
const TOKEN = process.env.THREADS_ACCESS_TOKEN;

async function api(pathname, params) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", TOKEN);
  const res = await fetch(url, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!TOKEN) throw new Error("THREADS_ACCESS_TOKEN is not set");
  const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
  const item = queue.find((p) => p.status === "queued");
  if (!item) { console.log("Queue empty — nothing to publish."); return; }

  console.log(`Publishing [${item.id}] (${item.text.length} chars, image: ${item.image_url ? "yes" : "no"})`);

  const createParams = item.image_url
    ? { media_type: "IMAGE", image_url: item.image_url, text: item.text }
    : { media_type: "TEXT", text: item.text };

  try {
    const container = await api("/me/threads", createParams);
    await sleep(30000); // Threads recommends waiting before publish
    const published = await api("/me/threads_publish", { creation_id: container.id });
    item.status = "posted";
    item.posted_at = new Date().toISOString();
    item.threads_media_id = published.id;
    console.log(`Posted: media id ${published.id}`);
  } catch (err) {
    item.status = "failed";
    item.error = String(err.message).slice(0, 300);
    console.error(`FAILED: ${err.message}`);
    process.exitCode = 1;
  }

  fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 2) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
