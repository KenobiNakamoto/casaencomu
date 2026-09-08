#!/usr/bin/env node
// The browser reader. Runs on the host, beside the container, and opens the links the server
// could not read — Idealista above all, which answers a server fetch with a DataDome challenge
// every time and a real browser with the advertisement.
//
// Nothing here defeats that check. It runs a stock Chrome, headful, with its own empty profile
// and no flags that change what a site sees: the challenge's own JavaScript executes, passes, and
// the page loads, which is exactly what the challenge is for. One page at a time, seconds apart,
// and only pages a member has pasted into the app. There is no proxy, no fingerprint, no CAPTCHA.
//
//   CASA_URL=http://127.0.0.1:3100 CASA_CAPTURE_TOKEN=… node scripts/capture-agent.mjs
//
// The token is any member's `capture_token`, the same secret their bookmarklet carries; `Ayuda`
// shows it. Stop it with Ctrl-C: the Chrome it started goes with it.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = (process.env.CASA_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const TOKEN = process.env.CASA_CAPTURE_TOKEN ?? "";
const PORT = Number(process.env.CASA_CHROME_PORT ?? 9333);
const CHROME =
  process.env.CASA_CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const POLL_MS = Number(process.env.CASA_POLL_MS ?? 30_000);
const BETWEEN_MS = Number(process.env.CASA_BETWEEN_MS ?? 5_000);
const PAGE_MS = 30_000;
const RETRY_MS = Number(process.env.CASA_RETRY_MS ?? 600_000);
const ONCE = process.argv.includes("--once");

if (!TOKEN) {
  console.error("capture-agent: set CASA_CAPTURE_TOKEN (it is the bookmarklet's token — see /ayuda)");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cdp = async (path, init) => (await fetch(`http://127.0.0.1:${PORT}${path}`, init)).json();

/** A Chrome of its own, so a member's real browser and its logins are never touched. */
async function startChrome() {
  const profile = mkdtempSync(join(tmpdir(), "casa-reader-"));
  const child = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      // Off screen rather than headless: headless is a different browser to a bot check, and this
      // one has nothing to hide. On the Air there is nobody looking at the screen anyway.
      "--window-position=-3000,-3000",
      "--window-size=1280,900",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  for (let i = 0; i < 60; i++) {
    try {
      await cdp("/json/version");
      return child;
    } catch {
      await sleep(500);
    }
  }
  child.kill();
  throw new Error(`Chrome did not open a debugging port on ${PORT}. Set CASA_CHROME_BIN if it is installed elsewhere.`);
}

/** One tab, one page, then closed. Returns whatever `collect` found, or null. */
async function read(url, collect) {
  const tab = await cdp(`/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id && waiting.has(m.id)) waiting.get(m.id)(m);
  };
  try {
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error("no debugger socket"));
    });
    const ev = async (expression) => {
      const i = ++id;
      const answer = new Promise((res) => waiting.set(i, res));
      ws.send(JSON.stringify({ id: i, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }));
      const m = await Promise.race([answer, sleep(PAGE_MS).then(() => null)]);
      return m?.result?.result?.value;
    };

    // The challenge page is itself a complete document, so `readyState` alone says nothing. Wait
    // for the advertisement: the challenge reloads into it by itself, usually inside a second.
    const until = Date.now() + PAGE_MS;
    while (Date.now() < until) {
      await sleep(500);
      const done = await ev(
        "document.readyState==='complete' && document.documentElement.outerHTML.length>20000" +
          " && document.documentElement.outerHTML.indexOf('captcha-delivery')<0",
      );
      if (done) break;
    }
    const raw = await ev(collect);
    return typeof raw === "string" ? JSON.parse(raw) : null;
  } finally {
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
  }
}

/** The same form the bookmarklet posts, from here instead of from the portal's page. */
async function deliver(captured) {
  const form = new URLSearchParams({ token: TOKEN });
  for (const k of ["url", "title", "ld", "og", "blob", "imgs", "text"]) if (captured[k]) form.set(k, captured[k]);
  const res = await fetch(`${APP}/api/capture`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    redirect: "manual",
  });
  if (res.status !== 303 && !res.ok) throw new Error(`capture → HTTP ${res.status} ${(await res.text()).slice(0, 140)}`);
}

/**
 * When each link was last opened. The queue offers everything still unread, because the server
 * cannot tell its own failed fetch from ours; not opening the same page every thirty seconds is
 * this process's job. Restarting it retries everything, which is what a restart should mean.
 */
const tried = new Map();

async function pass() {
  const res = await fetch(`${APP}/api/capture/pending`, { headers: { "x-capture-token": TOKEN } });
  if (res.status === 401) throw new Error("the token was refused — check CASA_CAPTURE_TOKEN against /ayuda");
  if (!res.ok) throw new Error(`pending → HTTP ${res.status}`);
  const { collect, items } = await res.json();
  const due = items.filter((it) => Date.now() - (tried.get(it.url) ?? 0) > RETRY_MS);
  for (const [i, item] of due.entries()) {
    if (i > 0) await sleep(BETWEEN_MS);
    tried.set(item.url, Date.now());
    try {
      const captured = (await read(item.url, collect)) ?? { url: item.url };
      // Sent even when the page would not open: the app then records that a browser tried and
      // could not, which is a different thing from nobody having looked yet.
      await deliver(captured);
      console.log(
        captured.title
          ? `[reader] ${item.site} ${item.url} → ${captured.text.length} chars, ${JSON.parse(captured.imgs).length} images`
          : `[reader] ${item.site} ${item.url} → the page would not open`,
      );
    } catch (e) {
      console.error(`[reader] ${item.url} → ${e.message}`);
    }
  }
  return due.length;
}

const chrome = await startChrome();
const stop = () => {
  chrome.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log(`[reader] Chrome ${PORT} · app ${APP} · every ${POLL_MS / 1000}s`);

for (;;) {
  try {
    const n = await pass();
    if (ONCE) break;
    if (n === 0) await sleep(POLL_MS);
  } catch (e) {
    console.error(`[reader] ${e.message}`);
    if (ONCE) break;
    await sleep(POLL_MS);
  }
}
stop();
