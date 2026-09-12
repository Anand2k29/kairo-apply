import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";

// ─── LLM Waterfall Engine ────────────────────────────────────────────
// Cascade order:
//   1. Local Claude proxy (if configured)
//   2. Gemini API keys × models (round-robin, with per-key cooldowns)
//   3. OpenRouter models (last-resort fallback)
// ─────────────────────────────────────────────────────────────────────

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

// Rate limit: wait between retries
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Per-key cooldown tracker — skip keys that were recently rate-limited
const keyCooldowns = new Map(); // key identifier → Date.now() when cooldown expires

function isOnCooldown(keyId) {
  const expires = keyCooldowns.get(keyId);
  if (!expires) return false;
  if (Date.now() >= expires) {
    keyCooldowns.delete(keyId);
    return false;
  }
  return true;
}

function setCooldown(keyId, seconds = 30) {
  keyCooldowns.set(keyId, Date.now() + seconds * 1000);
}

function keyTag(key) { return key ? `...${key.slice(-4)}` : "???"; }

// ─── Collect all configured keys ─────────────────────────────────────
function getGeminiKeys() {
  const keys = [
    process.env.GEMINI_API_KEY?.trim(),
    process.env.GEMINI_API_KEY_2?.trim(),
    process.env.GEMINI_API_KEY_3?.trim(),
    process.env.GEMINI_API_KEY_4?.trim(),
  ].filter(Boolean);
  // Valid Google Gemini API keys start with "AIzaSy"
  return keys.filter(k => k.startsWith("AIzaSy"));
}

function getGroqKeys() {
  const keys = [
    process.env.GROQ_API_KEY?.trim(),
    process.env.GROQ_API_KEY_2?.trim(),
    process.env.GROQ_API_KEY_3?.trim(),
  ].filter(Boolean);
  return keys.filter(k => k.startsWith("gsk_"));
}

function getOpenRouterKeys() {
  return [
    process.env.OPENROUTER_API_KEY?.trim(),
    process.env.OPENROUTER_API_KEY_2?.trim(),
    process.env.OPENROUTER_API_KEY_3?.trim(),
  ].filter(Boolean);
}

// Groq ultra-fast high-speed models (sub-300ms latency)
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
  "llama3-8b-8192",
];

// OpenRouter models to try in order (active high-speed models prioritized)
const OPENROUTER_MODELS = [
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.3-70b-instruct",
  "qwen/qwen-2.5-7b-instruct",
];

// Gemini models to cycle through per key (active & reliable endpoints)
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

// ─── Tier 1: Local Claude Proxy ──────────────────────────────────────
async function tryLocalClaude(prompt, systemPrompt, options) {
  const localUrl = process.env.LOCAL_CLAUDE_URL?.trim() ||
    (process.env.LLM_PROVIDER === "claude_free" ? "http://127.0.0.1:3000/api" : null);

  if (!localUrl) return null;

  const endpoint = localUrl.endsWith("/chat/completions")
    ? localUrl
    : `${localUrl.replace(/\/+$/, "")}/chat/completions`;

  const localModel = process.env.LOCAL_CLAUDE_MODEL?.trim() || "auto";

  try {
    debugLog("🤖", `[Tier 1] Local Claude (${localModel})...`, "dim");
    const resp = await axios.post(endpoint, {
      model: localModel,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt }
      ],
      temperature: options.temperature ?? 0,
    }, { timeout: options.timeout || 1200 }); // ⚡ Ultra-fast 1.2s timeout

    const text = resp.data.choices?.[0]?.message?.content || resp.data.content?.[0]?.text;
    if (text) {
      debugLog("✅", `[Tier 1] Local Claude responded`, "green");
      return text;
    }
  } catch (e) {
    if (process.env.DEBUG_LOGS) console.log(`  ℹ️ Local Claude offline (${e.message.slice(0, 40)}...).`);
  }
  return null;
}

// ─── Tier 1B: Local Ollama Model ────────────────────────────────────
async function tryOllama(prompt, systemPrompt, options) {
  const ollamaUrl = process.env.OLLAMA_URL?.trim() || "http://127.0.0.1:11434";
  const ollamaModel = process.env.OLLAMA_MODEL?.trim() || "llama3.2";

  try {
    const endpoint = `${ollamaUrl.replace(/\/+$/, "")}/v1/chat/completions`;
    debugLog("🦙", `[Tier 1B] Local Ollama (${ollamaModel})...`, "dim");
    const resp = await axios.post(endpoint, {
      model: ollamaModel,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt }
      ],
      temperature: options.temperature ?? 0.1,
    }, { timeout: options.timeout || 1500 }); // ⚡ Ultra-fast 1.5s timeout

    const text = resp.data.choices?.[0]?.message?.content;
    if (text) {
      debugLog("✅", `[Tier 1B] Local Ollama (${ollamaModel}) responded`, "green");
      return text;
    }
  } catch (e) {
    // Silent fast failover to Gemini if Ollama server is offline
  }
  return null;
}

// ─── Tier 2: Gemini API Keys × Models ────────────────────────────────
async function tryGemini(prompt, systemPrompt, options) {
  const apiKeys = getGeminiKeys();
  if (apiKeys.length === 0) return null;

  for (const apiKey of apiKeys) {
    const tag = keyTag(apiKey);
    const providerKeyId = `gemini:${tag}`;

    // Skip entire API key if it's on 429 cooldown
    if (isOnCooldown(providerKeyId)) {
      continue;
    }

    for (const model of GEMINI_MODELS) {
      const modelKeyId = `gemini:${tag}:${model}`;

      if (isOnCooldown(modelKeyId)) {
        continue;
      }

      const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
      const parts = [];
      if (systemPrompt) parts.push({ text: `[SYSTEM]\n${systemPrompt}\n[/SYSTEM]\n\n` });
      parts.push({ text: prompt });

      if (options.imageBase64) {
        parts.push({ inline_data: { mime_type: "image/png", data: options.imageBase64 } });
      }

      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        attempts++;
        try {
          debugLog("🤖", `[Tier 2] Gemini ${model} (key ${tag}${attempts > 1 ? `, retry ${attempts}` : ""})...`, "dim");
          const resp = await axios.post(url, {
            contents: [{ parts }],
            generationConfig: { temperature: options.temperature ?? 0 },
          }, { timeout: options.timeout || 6000 });

          const text = resp.data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) throw new Error("Empty response from Gemini");
          debugLog("✅", `[Tier 2] Gemini ${model} (key ${tag}) responded`, "green");
          return text;
        } catch (err) {
          const lastError = err.response?.data?.error?.message || err.message;
          const status = err.response?.status;
          const headers = err.response?.headers || {};

          const retryAfterHeader = headers["retry-after"] || headers["x-ratelimit-reset"];
          const retryMatch = typeof lastError === "string" && lastError.match(/retry in ([\d.]+)s/i);
          let cooldownSec = 20;
          if (retryAfterHeader) {
            cooldownSec = parseInt(retryAfterHeader, 10) || 20;
          } else if (retryMatch) {
            cooldownSec = Math.ceil(parseFloat(retryMatch[1])) + 2;
          }

          if (status === 404 || (typeof lastError === "string" && (
            lastError.includes("no longer available") ||
            lastError.includes("not found for API version")
          ))) {
            setCooldown(modelKeyId, 86400);
            break;
          }

          if (status === 400 || status === 403 || (typeof lastError === "string" && (
            lastError.includes("API key not valid") ||
            lastError.includes("API_KEY_INVALID") ||
            lastError.includes("invalid API key")
          ))) {
            if (process.env.DEBUG_LOGS) console.log(`  ⚠️ Invalid Gemini API key ${tag} → disabling key...`);
            setCooldown(providerKeyId, 86400);
            break;
          }

          if (status === 429 || (typeof lastError === "string" && (
            lastError.includes("Quota exceeded") ||
            lastError.includes("rate-limits") ||
            lastError.includes("RESOURCE_EXHAUSTED") ||
            lastError.includes("429") ||
            lastError.includes("TOO_MANY_REQUESTS")
          ))) {
            if (attempts < maxAttempts) {
              const backoff = attempts * 1000;
              if (process.env.DEBUG_LOGS) console.log(`  ⏳ 429 Rate Limit on Gemini ${model} → auto-backoff ${backoff}ms...`);
              await sleep(backoff);
              continue;
            } else {
              if (process.env.DEBUG_LOGS) console.log(`  ⏳ 429 Rate Limit on Gemini key ${tag} (${model}) → setting ${cooldownSec}s cooldown...`);
              setCooldown(providerKeyId, cooldownSec);
              setCooldown(modelKeyId, cooldownSec);
              await sleep(200);
              break;
            }
          }
          if (process.env.DEBUG_LOGS) console.log(`  ⚠️ Gemini ${model} (key ${tag}) error: ${typeof lastError === "string" ? lastError.slice(0, 80) : lastError}`);
          break;
        }
      }
    }
  }

  return null;
}

// ─── Tier 3: OpenRouter Fallback ─────────────────────────────────────
async function tryOpenRouter(prompt, systemPrompt, options) {
  const apiKeys = getOpenRouterKeys();
  if (apiKeys.length === 0) return null;

  for (const apiKey of apiKeys) {
    const tag = keyTag(apiKey);
    const providerKeyId = `openrouter:${tag}`;

    if (isOnCooldown(providerKeyId)) continue;

    for (const model of OPENROUTER_MODELS) {
      const keyId = `openrouter:${tag}:${model}`;

      if (isOnCooldown(keyId)) continue;

      try {
        debugLog("🤖", `[Tier 3] OpenRouter ${model} (key ${tag})...`, "dim");

        const messages = [];
        if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
        messages.push({ role: "user", content: prompt });

        if (options.imageBase64) {
          messages[messages.length - 1] = {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:image/png;base64,${options.imageBase64}` } },
            ],
          };
        }

        const resp = await axios.post(OPENROUTER_BASE, {
          model,
          messages,
          temperature: options.temperature ?? 0,
        }, {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://kairo-apply.app",
            "X-Title": "KAIRO Resume & Application Agent",
          },
          timeout: options.timeout || 45000,
        });

        const text = resp.data.choices?.[0]?.message?.content;
        if (!text) throw new Error("Empty response from OpenRouter");
        debugLog("✅", `[Tier 3] OpenRouter ${model} responded`, "green");
        return text;
      } catch (err) {
        const lastError = err.response?.data?.error?.message || err.message;
        const status = err.response?.status;
        const headers = err.response?.headers || {};

        const retryAfterHeader = headers["retry-after"] || headers["x-ratelimit-reset"];
        const cooldownSec = parseInt(retryAfterHeader, 10) || 20;

        if (status === 429 || (typeof lastError === "string" && (
          lastError.includes("rate") ||
          lastError.includes("429") ||
          lastError.includes("quota") ||
          lastError.includes("limit")
        ))) {
          setCooldown(keyId, cooldownSec);
          if (process.env.DEBUG_LOGS) console.log(`  ⏳ 429 Rate limit: OpenRouter ${model} (key ${tag}) → cooldown ${cooldownSec}s.`);
          await sleep(200);
          continue;
        }
        if (process.env.DEBUG_LOGS) console.log(`  ⚠️ OpenRouter ${model} error: ${typeof lastError === "string" ? lastError.slice(0, 80) : lastError}`);
        continue;
      }
    }
  }

  return null;
}

// ─── Tier 0: Groq Ultra-Fast API (Sub-300ms Latency) ─────────────────
async function tryGroq(prompt, systemPrompt, options) {
  const apiKeys = getGroqKeys();
  if (apiKeys.length === 0) return null;

  for (const apiKey of apiKeys) {
    const tag = keyTag(apiKey);
    const providerKeyId = `groq:${tag}`;

    if (isOnCooldown(providerKeyId)) continue;

    for (const model of GROQ_MODELS) {
      const modelKeyId = `groq:${tag}:${model}`;
      if (isOnCooldown(modelKeyId)) continue;

      try {
        debugLog("⚡", `[Groq High-Speed] Groq ${model} (key ${tag})...`, "dim");
        const resp = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
          model,
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: prompt }
          ],
          temperature: options.temperature ?? 0,
        }, {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: options.timeout || 4000,
        });

        const text = resp.data.choices?.[0]?.message?.content;
        if (text) {
          debugLog("✅", `[Groq High-Speed] Groq ${model} responded (<300ms latency)!`, "green");
          return text;
        }
      } catch (err) {
        const status = err.response?.status;
        if (status === 429) setCooldown(modelKeyId, 30);
        else setCooldown(modelKeyId, 60);
      }
    }
  }
  return null;
}

// ─── Main LLM Entry Point (Waterfall) ────────────────────────────────
export async function callGemini(prompt, systemPrompt = "", options = {}) {
  // Tier 0: Groq Ultra-Fast API (Primary high-speed tier if GROQ_API_KEY is configured)
  const groqResult = await tryGroq(prompt, systemPrompt, options);
  if (groqResult) return groqResult;

  // Tier 1: Gemini API (primary model - direct Google API)
  const geminiResult = await tryGemini(prompt, systemPrompt, options);
  if (geminiResult) return geminiResult;

  // Tier 2: OpenRouter API (extensive fallback model cascade)
  const orResult = await tryOpenRouter(prompt, systemPrompt, options);
  if (orResult) return orResult;

  // Tier 3: Local Claude proxy (if configured/online)
  const localResult = await tryLocalClaude(prompt, systemPrompt, options);
  if (localResult) return localResult;

  // Tier 4: Local Ollama model (e.g. llama3.2 / qwen2.5)
  const ollamaResult = await tryOllama(prompt, systemPrompt, options);
  if (ollamaResult) return ollamaResult;

  // Option to return explicit fallback JSON if provided
  if (options.fallbackJSON) {
    log("⚡", "Rate limit / quota reached on all API keys — using smart structured fallback (0 tokens used)...", "yellow");
    return typeof options.fallbackJSON === "object" ? JSON.stringify(options.fallbackJSON) : options.fallbackJSON;
  }

  // All tiers exhausted due to 429 / Rate Limits
  const totalKeys = getGeminiKeys().length + getOpenRouterKeys().length;
  const rateErr = new Error(
    `HTTP 429 / Rate Limit: All LLM tiers exhausted (${totalKeys} keys tried). ` +
    `Switching to Pure DOM Engine / Local Fallback.`
  );
  rateErr.statusCode = 429;
  rateErr.isRateLimit = true;
  throw rateErr;
}

// ─── HTML sanitisation ───────────────────────────────────────────────
export function sanitiseHTML(rawHTML) {
  return rawHTML
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Smart DOM extraction (FAST — only interactive elements) ─────────
// Instead of sending 15K of raw HTML, extract only what matters:
// buttons, links, inputs, forms, prices, headings
export async function extractSmartDOM(page) {
  return page.evaluate(() => {
    const elements = [];
    const url = window.location.href;
    const title = document.title;

    // Extract interactive elements with context
    const selectors = [
      { sel: 'input:not([type="hidden"])', type: 'input' },
      { sel: 'textarea', type: 'textarea' },
      { sel: 'button', type: 'button' },
      { sel: 'a[href]', type: 'link' },
      { sel: 'select', type: 'select' },
      { sel: '[role="button"]', type: 'button' },
      { sel: '[onclick]', type: 'clickable' },
    ];

    for (const { sel, type } of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        // Skip invisible elements
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        const info = { type };
        // Build a unique CSS selector
        if (el.id) info.selector = `#${el.id}`;
        else if (el.name) info.selector = `${el.tagName.toLowerCase()}[name="${el.name}"]`;
        else if (el.getAttribute('aria-label')) info.selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
        else if (el.getAttribute('data-testid')) info.selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
        else if (el.className && typeof el.className === 'string') {
          const cls = el.className.split(' ').filter(c => c && c.length < 30).slice(0, 2).join('.');
          if (cls) info.selector = `${el.tagName.toLowerCase()}.${cls}`;
        }

        // Text content
        const text = (el.textContent || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim().slice(0, 80);
        if (text) info.text = text;

        // For inputs
        if (el.type) info.inputType = el.type;
        if (el.placeholder) info.placeholder = el.placeholder;

        // For links
        if (el.href) info.href = el.href.slice(0, 120);

        if (info.selector) elements.push(info);
      }
    }

    // Extract key text (prices, headings)
    const headings = [];
    document.querySelectorAll('h1, h2, h3, [class*="price"], [class*="Price"]').forEach(el => {
      const text = (el.textContent || '').trim().slice(0, 100);
      if (text) headings.push(text);
    });

    return {
      url,
      title,
      headings: headings.slice(0, 10),
      elements: elements.slice(0, 60), // Cap at 60 elements
      elementCount: elements.length,
    };
  });
}

// ─── Safe JSON parsing (handles markdown fences, <think> tags, etc.) ─
export function safeParseJSON(text) {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const matchArray = cleaned.match(/\[[\s\S]*\]/);
    if (matchArray) {
      try { return JSON.parse(matchArray[0]); } catch { /* fall through */ }
    }
    const matchObj = cleaned.match(/\{[\s\S]*\}/);
    if (matchObj) {
      try { return JSON.parse(matchObj[0]); } catch { /* fall through */ }
    }
    throw new Error(`Could not parse JSON from response: ${text.slice(0, 200)}`);
  }
}

// ─── Workflow memory (Reinforcement Learning Q-Cache) ─────────────────
const CACHE_FILE = path.resolve("./workflow_memory.json");
const RL_ALPHA = 0.3; // Learning rate
const RL_GAMMA = 0.9; // Discount factor

export function loadMemory() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")); }
  catch { return {}; }
}

export function saveMemory(data) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function calcJaccardSimilarity(str1, str2) {
  const words1 = new Set(str1.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

export function extractCoreEntity(str) {
  if (!str) return null;
  const matchQuoted = str.match(/"([^"]+)"/);
  if (matchQuoted) return matchQuoted[1].toLowerCase().trim();
  const matchSearchFor = str.match(/search (?:for )?([a-z0-9\s]+?)(?: on| in| site:|\.|$)/i);
  if (matchSearchFor) return matchSearchFor[1].toLowerCase().trim();
  const matchBuy = str.match(/buy ([a-z0-9\s]+?)(?: on| in|\.|$)/i);
  if (matchBuy) return matchBuy[1].toLowerCase().trim();
  return null;
}

export function getCachedWorkflow(goal) {
  const mem = loadMemory();
  const key = goal.toLowerCase().trim();

  // 1. Direct exact match (must be completed successfully with positive Q-value)
  if (
    mem[key] &&
    mem[key].success === true &&
    mem[key].steps &&
    mem[key].steps.length >= 3 &&
    (mem[key].q_value === undefined || mem[key].q_value >= 10)
  ) {
    return mem[key];
  }

  const queryEntity = extractCoreEntity(goal);

  // 2. Fuzzy Token Overlap Match (Jaccard Similarity >= 0.75 & Entity Match & Verified Success)
  let bestMatch = null;
  let highestScore = 0;

  for (const storedKey of Object.keys(mem)) {
    const entry = mem[storedKey];
    if (!entry || !entry.steps || entry.steps.length < 3) continue;
    if (entry.success !== true) continue;
    if (entry.q_value !== undefined && entry.q_value < 10) continue;

    // Check entity mismatch (e.g. "milk" vs "eggs")
    const storedEntity = extractCoreEntity(storedKey);
    if (queryEntity && storedEntity && queryEntity !== storedEntity) {
      continue; // Skip cached entries that targeted a different product/entity
    }

    const similarity = calcJaccardSimilarity(key, storedKey);
    if (similarity >= 0.75 && similarity > highestScore) {
      highestScore = similarity;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    log("⚡", `Fuzzy Q-Cache Hit! Similarity: ${Math.round(highestScore * 100)}% (0 LLM Tokens Used)`, "green");
    return bestMatch;
  }

  return null;
}

export function saveWorkflow(goal, steps, complete = false, durationMs = 3000) {
  const mem = loadMemory();
  const key = goal.toLowerCase().trim();
  const existing = mem[key] || {};

  const prevQ = existing.q_value ?? (complete ? 70 : -30);
  const durationSec = Math.max(0.5, durationMs / 1000);

  // Reinforcement Learning Reward Function R:
  // Completion bonus +100 | Failure penalty -50 | Speed bonus / latency penalty
  let reward = complete ? 100 : -50;
  reward -= Math.min(30, durationSec * 1.2);
  if (complete && steps.length <= 6) reward += 20;

  // Q-Learning Bellman update: Q(s,a) <- Q(s,a) + alpha * [R + gamma * maxQ' - Q(s,a)]
  const nextMaxQ = complete ? 100 : -50;
  const newQ = prevQ + RL_ALPHA * (reward + RL_GAMMA * nextMaxQ - prevQ);
  const visits = (existing.visits || 0) + 1;

  mem[key] = {
    learned_at: new Date().toISOString(),
    steps,
    success: complete,
    step_count: steps.length,
    q_value: Math.round(newQ * 10) / 10,
    visits,
    last_reward: Math.round(reward * 10) / 10,
    avg_duration_sec: Math.round(durationSec * 10) / 10,
    first_seen: existing.first_seen || new Date().toISOString(),
  };

  saveMemory(mem);
}

export function listLearnedWorkflows() {
  const mem = loadMemory();
  return Object.keys(mem).filter(
    k => mem[k].success === true && mem[k].steps && mem[k].steps.length >= 3
  );
}

// ─── Page-type detection ─────────────────────────────────────────────
export async function detectPageType(page) {
  return page.evaluate(() => {
    const html = document.body?.innerHTML?.toLowerCase() || "";
    const url = window.location.href.toLowerCase();

    // 1. Password/Login detection (strict: requires password input field)
    const hasPasswordField = !!document.querySelector('input[type="password"]');
    const loginKeywords = ["sign in", "log in", "login", "signin", "enter password"];
    if (hasPasswordField && loginKeywords.some((kw) => html.includes(kw))) return "login";

    // 2. SEARCH RESULTS Detection (Google/Bing/Amazon search pages)
    const searchUrls = ["google.com/search", "bing.com/search", "/s?", "search?", "s?k="];
    if (searchUrls.some((kw) => url.includes(kw))) return "search_results";

    // 3. PRODUCT PAGE Detection (has Add to Cart / Buy Now buttons)
    const productSelectors = [
      '#add-to-cart-button', '#buy-now-button', '[name="submit.add-to-cart"]',
      '[data-action="add-to-cart"]', 'button[name="add-to-cart"]', '.add-to-cart-btn'
    ];
    if (productSelectors.some(sel => !!document.querySelector(sel))) return "product";

    // 4. CART Detection
    const cartUrls = ["/cart", "/gp/cart", "/basket", "shopping-cart"];
    if (cartUrls.some((kw) => url.includes(kw))) return "cart";

    // 5. PAYMENT / CHECKOUT Detection (strict: must be on actual checkout domain path or have explicit payment inputs)
    const checkoutUrls = [
      "/checkout", "/buy/payselect", "/gp/buy/spc", "/payselect", "/payment-options", 
      "/spc/handlers", "checkout.", "/pay/", "cart/checkout"
    ];
    const isCheckoutUrl = checkoutUrls.some((kw) => url.includes(kw));

    const paymentInputSelectors = [
      '#pay-button', '#submitOrderButtonId', 'input[name="ppw-instrumentRowSelection"]',
      '[data-pmts-component-id]', 'input[name*="card"]', 'input[id*="cvv"]', 'input[id*="upi"]'
    ];
    const hasPaymentInput = paymentInputSelectors.some(sel => !!document.querySelector(sel));

    if (isCheckoutUrl || hasPaymentInput) {
      const paymentHeaderKeywords = [
        "select a payment method", "choose how to pay", "payment options",
        "enter upi id", "credit or debit card", "order summary", "cash on delivery"
      ];
      if (paymentHeaderKeywords.some(kw => html.includes(kw)) || isCheckoutUrl) {
        return "payment";
      }
    }

    return "unknown";
  });
}

// ─── Screenshot utilities ────────────────────────────────────────────
export async function takeScreenshot(page) {
  const buffer = await page.screenshot({ type: "png", fullPage: false });
  return buffer.toString("base64");
}

export async function askVision(screenshotBase64, prompt) {
  return callGemini(prompt, "", { imageBase64: screenshotBase64, timeout: 30000 });
}

// ─── Browser overlay injection ───────────────────────────────────────
// Injects a floating status bar and detail panel into the browser page so user can SEE
// all AI context, cover letters, and live actions directly on Chromium!
export async function injectOverlay(page) {
  await page.evaluate(() => {
    if (document.getElementById('kairo-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'kairo-overlay';
    overlay.innerHTML = `
      <div id="sr-status" style="
        position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
        background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
        color: #fff; padding: 10px 20px; font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 14px; display: flex; align-items: center; justify-content: space-between;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5); border-bottom: 3px solid #7c3aed;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 20px;">🤖</span>
          <span style="font-weight: 700; color: #a78bfa; letter-spacing: 0.5px;">KAIRO Autonomous Agent</span>
          <span id="sr-step-badge" style="background: rgba(124, 58, 237, 0.3); border: 1px solid #7c3aed; padding: 2px 10px; border-radius: 12px; font-size: 12px; color: #c4b5fd; font-weight: 600;">ACTIVE PLAYBACK</span>
        </div>
        <div id="sr-msg" style="color: #f3f4f6; font-weight: 500; font-size: 13px; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Initializing...</div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="sr-dot" style="width: 10px; height: 10px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 8px #22c55e; animation: sr-pulse 1.2s infinite;"></span>
          <span style="font-size: 11px; color: #9ca3af; text-transform: uppercase; font-weight: 600;">Chromium Visual Mode</span>
        </div>
      </div>
      <div id="kairo-detail-panel" style="
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
        background: rgba(15, 12, 41, 0.95); backdrop-filter: blur(12px);
        border: 1px solid rgba(124, 58, 237, 0.5); border-radius: 12px;
        color: #e2e8f0; padding: 14px 18px; width: 360px; max-height: 280px; overflow-y: auto;
        font-family: 'Segoe UI', system-ui, sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6); display: none; transition: all 0.3s ease;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">
          <span style="font-weight: 700; font-size: 12px; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Live Action Context</span>
          <span id="kairo-panel-tag" style="background: #7c3aed; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600;">CHROMIUM VISUAL</span>
        </div>
        <div id="kairo-panel-body" style="font-size: 12px; line-height: 1.5; color: #cbd5e1;"></div>
      </div>
      <style>
        @keyframes sr-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } }
        @keyframes sr-highlight {
          0% { outline: 3px solid transparent; }
          50% { outline: 4px solid #7c3aed; outline-offset: 3px; box-shadow: 0 0 15px rgba(124,58,237,0.6); }
        }
        .sr-highlight { animation: sr-highlight 1.5s ease-in-out 3 !important; }
      </style>
    `;
    const target = document.body || document.documentElement;
    if (target) target.appendChild(overlay);
  });
}

export async function updateOverlayStatus(page, message, details = null) {
  try {
    await page.evaluate(({ msg, det }) => {
      const el = document.getElementById('sr-msg');
      if (el) el.textContent = msg;
      const panel = document.getElementById('kairo-detail-panel');
      const body = document.getElementById('kairo-panel-body');
      if (det && panel && body) {
        body.innerHTML = det;
        panel.style.display = 'block';
      } else if (!det && panel) {
        panel.style.display = 'none';
      }
    }, { msg: message, det: details });
  } catch { /* page navigated, ignore */ }
}

export async function highlightElement(page, selector) {
  try {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        el.classList.add('sr-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.classList.remove('sr-highlight'), 4500);
      }
    }, selector);
  } catch { /* ignore */ }
}

// ─── Pretty logging ──────────────────────────────────────────────────
const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bgBlue: "\x1b[44m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgRed: "\x1b[41m",
};

export function log(emoji, message, color = "reset") {
  console.log(`${COLORS[color]}${emoji} ${message}${COLORS.reset}`);
}

export function debugLog(emoji, message, color = "dim") {
  if (process.env.DEBUG_LOGS) {
    console.log(`${COLORS[color]}${emoji} ${message}${COLORS.reset}`);
  }
}

export function logStep(index, total, message) {
  console.log(
    `\n${COLORS.bgBlue}${COLORS.bright} STEP ${index + 1}/${total} ${COLORS.reset} ${COLORS.cyan}${message}${COLORS.reset}`
  );
}

export function logAction(action) {
  if (process.env.DEBUG_LOGS) {
    console.log(
      `  ${COLORS.dim}→ action: ${COLORS.yellow}${action.action}${COLORS.reset}` +
      (action.selector ? `  ${COLORS.dim}selector: ${COLORS.magenta}${action.selector}${COLORS.reset}` : "") +
      (action.value ? `  ${COLORS.dim}value: ${COLORS.green}${action.value}${COLORS.reset}` : "")
    );
  }
}

export function renderExecutionSummary({ goal, totalSteps, completedSteps, durationSec, status, candidate, targetUrl }) {
  console.log(`
${COLORS.cyan}╭──────────────────────────────────────────────────────────────────────────╮${COLORS.reset}
${COLORS.cyan}│${COLORS.reset}  ${COLORS.bright}${COLORS.green}🎉  K A I R O  —  AUTOMATION EXECUTION SUMMARY${COLORS.reset}                          ${COLORS.cyan}│${COLORS.reset}
${COLORS.cyan}├──────────────────────────────────────────────────────────────────────────┤${COLORS.reset}
${COLORS.cyan}│${COLORS.reset}  ${COLORS.cyan}🎯 Goal        :${COLORS.reset} ${COLORS.bright}${goal.slice(0, 58)}${goal.length > 58 ? '...' : ''}${COLORS.reset}
${COLORS.cyan}│${COLORS.reset}  ${COLORS.cyan}📍 Target URL  :${COLORS.reset} ${COLORS.yellow}${targetUrl || 'Live Web Page'}${COLORS.reset}
${COLORS.cyan}│${COLORS.reset}  ${COLORS.cyan}⏱️ Duration    :${COLORS.reset} ${durationSec}s Total
${COLORS.cyan}│${COLORS.reset}  ${COLORS.cyan}📋 Steps Run   :${COLORS.reset} ${completedSteps} / ${totalSteps} Completed
${candidate ? `${COLORS.cyan}│${COLORS.reset}  ${COLORS.cyan}👤 Candidate   :${COLORS.reset} ${candidate.name} (${candidate.email})` : ''}
${COLORS.cyan}│${COLORS.reset}  ${COLORS.cyan}🛑 Status      :${COLORS.reset} ${COLORS.green}${COLORS.bright}${status}${COLORS.reset}
${COLORS.cyan}╰──────────────────────────────────────────────────────────────────────────╯${COLORS.reset}
`);
}
