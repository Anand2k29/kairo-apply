# 🤖 kairo-apply (KAIRO) — Autonomous Self-Learning Browser & Resume Agent

> **Agentic AI Hackathon** | **Tech Zephyr 4.0 | IIT Bhubaneswar**
> *"Build AI Systems That Act, Adapt, and Execute."*
> **GitHub Repository**: [https://github.com/Anand2k29/kairo-apply](https://github.com/Anand2k29/kairo-apply)
> Powered by **webcmd** architecture & **KAIRO (Kairos Opportune Timing Assistant — JARVIS Voice Persona)** — *"Hello KAIRO"*

**KAIRO** (`kairo-apply`) — evoking *Kairos* (the right, opportune moment for job applications and execution) — is a state-of-the-art autonomous browser agent built on the **webcmd** autonomous web automation engine. It combines JARVIS voice-activated AI (**KAIRO**), multi-tier LLM waterfalls (**Ollama** + **claude-code-for-free** + **Gemini** + **OpenRouter** + **Free Models Cascade**), an RL Q-value trajectory cache, an AI Job Discovery Assistant with the **9-Stage Resume Tailoring & Fact-Checking Pipeline**, and live visual Playwright Chromium browser execution.

---

## 🎯 Build Overview, Problem Statement & Status

### 💡 What Problem Are We Solving?
Navigating the web for daily repetitive actions — such as scouring job portals at opportune moments, tailoring resumes with 100% factual integrity, auto-applying to openings, and sending recruiter outreach — is tedious, fragmented, and time-consuming. Existing browser automation tools either rely entirely on high-cost cloud LLM tokens for every execution or lack context-aware voice control, local privacy, and self-learning trajectory memory.

### ⚙️ How We Went About It
We built **kairo-apply** on top of the **webcmd** autonomous web architecture and **KAIRO (JARVIS Voice Persona)**:
1. **Continuous Voice Engine (KAIRO - JARVIS Persona)**: Listens asynchronously for *"Hello KAIRO"* or **3x rapid spacebar taps** globally on Windows to launch voice-guided browser automation with a smooth, suave male voice.
2. **9-Stage Prompt Library & Fact-Checking Guardrail**: 9 model-agnostic prompt templates (`1_jd_parser.txt` through `9_change_report.txt`) ensuring non-fabrication of candidate evidence and full audit logging (`run_trace.json`).
3. **Fuzzy Q-Cache Trajectory Engine**: Uses Reinforcement Learning Q-values (`workflow_memory.json`) to cache successful browser paths. Subsequent runs execute at sub-200ms Playwright DOM speed using **0 LLM Tokens**, with intelligent entity validation and dynamic parameter substitution so queries (*e.g., milk vs. eggs*) never collide.
4. **Multi-Tier Rate-Limit-Resistant LLM Waterfall**: Cascades seamlessly from Local Claude (`claude-code-for-free`) → Local Ollama (`llama3.2`) → Gemini API → OpenRouter Free Models → Zero-API DOM Heuristics with exponential backoff & 0-token local fallback JSONs.
5. **Human-Gated Safety**: Section 9 hard gate ensures KAIRO never submits applications or completes payments without explicit human confirmation.

### 🌟 Featured Highlights (Primary Capabilities)

> [!IMPORTANT]
> **💼 AI Job Discovery & 9-Stage Resume Tailoring Pipeline**
> Features an autonomous 17-field job discovery schema, 7-signal weighted match matrix (0-100 score), and the 9-Stage Prompt Library Pipeline (`tailor → evaluate → revise → send`) with fact-checking guardrails. Supports batch auto-apply (`1-4`, `1-5`) with human-gated confirmation before submission.

> [!IMPORTANT]
> **📧 Recruiter Emailing & Application Dispatch (No Firebase Keys Required)**
> KAIRO supports dual email dispatch options out of the box:
> 1. **Live Browser Webmail (Default — 0 Keys Needed)**: Uses Playwright Chromium to open Gmail at `https://mail.google.com`, click Compose, fill recipient, subject, and cover letter body, pausing for human handoff.
> 2. **Direct SMTP Nodemailer (Optional Background Dispatch)**: Add `SMTP_USER` & `SMTP_PASS` (e.g. Gmail App Password) to `.env` for direct background email sending with tailored resume payloads.

---

## 🎨 Categorized & Tailored CLI Options Menu

KAIRO features an aligned, color-coded, and intuitive terminal menu layout:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🤖  K A I R O  —  Autonomous Resume & Job Application Agent             │
│  Precision Timing (Kairos) • 9-Stage Tailoring • Fact-Checked Guardrails │
└──────────────────────────────────────────────────────────────────────────┘

  🎯 TAILORED AGENT OPTIONS & WORKFLOWS:

  ─── 💼 JOB DISCOVERY & RESUME TAILORING ───────────────────────────────────
   1  💼  Job Discovery & Daily Top 5 Dashboard
     ↳ 17-field schema, 7-Signal match score & live visual browser discovery
   2  🤖  9-Stage Resume Tailoring Pipeline
     ↳ Non-fabrication resume draft, ATS score (0-100) & audit change report
   3  📧  Recruiter Outreach & Cold Mailing Assistant
     ↳ Live Playwright webmail draft composition & direct SMTP email dispatch

  ─── 👤 CANDIDATE PROFILE & VOICE ASSISTANT ────────────────────────────────
   4  👤  Candidate Profile & Verified Evidence Setup
     ↳ Candidate skills, experience years, verified projects & contact info
   5  🎤  KAIRO JARVIS Hands-Free Voice Mode
     ↳ Activate "Hello KAIRO" wake-word or tap 3x Spacebar for voice control
   6  🎙️  JARVIS Voice Acoustic Calibration
     ↳ Calibrate pitch, speech rate & acoustic voice profile

  ─── ⚡ AUTOMATION & REPLAY ENGINE ──────────────────────────────────────────
   7  ⚡  Custom Task / General Webcmd Workflow
     ↳ Execute any custom browser automation goal with live visual playback
   8  🔄  Replay Learned Workflow
     ↳ Sub-200ms DOM replay engine (0 LLM tokens consumed)
```

---

## 🌐 webcmd Architecture & Mental Model

KAIRO leverages **webcmd** (`webcmd_repo`) as its core execution engine:

```
                  ┌─────────────────────────────────────────┐
                  │   🎤 KAIRO JARVIS Voice & CLI Interface │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │  ⚡ Fuzzy Q-Cache (workflow_memory.json) │
                  │  0 LLM Tokens • Sub-200ms DOM Replay    │
                  └────────────────────┬────────────────────┘
                                       │ (Cache Miss)
                                       ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                         🌊 Multi-Tier LLM Waterfall                      │
 │ Tier 1: Local Claude Proxy (claude-code-for-free @ http://127.0.0.1:3000)│
 │ Tier 1B: Local Ollama Model (llama3.2 / qwen2.5 @ http://127.0.0.1:11434) │
 │ Tier 2: Gemini API Keys × Round-Robin Models (Exponential Backoff)       │
 │ Tier 3: OpenRouter Free Models Cascade (Llama 3.3, DeepSeek, Gemini Lite)│
 │ Tier 4: Zero-API Smart DOM Heuristics & Local Fallback JSONs             │
 └─────────────────────────────────────┬────────────────────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │  ⚙️ webcmd Autonomous Action Dispatcher  │
                  │  (Navigate, Click, Type, Select, Fill)  │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │  🌐 Playwright Chromium Browser Engine  │
                  │  (Visible Window, Purple Overlay, Focus)│
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │  🔐 Section 9 Hard-Gated Human Confirmation│
                  │  (Pauses for Login, Apply & Checkout)   │
                  └─────────────────────────────────────────┘
```

---

## ✨ Key Features & Capabilities

| Feature | Description |
|---|---|
| 🛠️ **Powered by webcmd** | Autonomous DOM action primitives, atomic step execution, and trajectory recording |
| 🎤 **KAIRO Voice Assistant** | Say **"Hello KAIRO"** or tap **3x Spacebar** anywhere on Windows to activate |
| 🎙️ **JARVIS Smooth Male Voice** | Suave, articulate male voice synthesizer via Windows SAPI with speech rate tuning |
| 📜 **9-Stage Prompt Library** | `prompts/1_jd_parser.txt` through `9_change_report.txt` with non-fabrication guardrail |
| 💼 **Job Discovery & Auto-Apply** | 17-field job schema, 7-signal weighted match score (0-100), AI cover letters |
| ⚡ **Ultra-Low Latency Engine** | Sub-10s to 15s end-to-end task execution latency via fast-path DOM heuristics & 50ms step delays |
| 🌐 **Live Browser Dual-Interface** | Plays visually inside Playwright Chromium window with status overlay bar |
| 🛡️ **Human-Gated Handoff** | Hard-gated user confirmation before submitting any application or payment |

---

## 📜 Resume & Application Agent: 9-Stage Pipeline

Modular, model-agnostic prompt library (`prompts/`) executing a 9-stage pipeline with strict non-fabrication guardrails, parallel stages, iterative revision, and audit logging:

1. **`1_jd_parser.txt`**: Extracts structured requirements (`must_have_skills`, `keywords_for_ats`, `seniority_level`, `domain_context`).
2. **`2_research_synthesis.txt`**: Synthesizes scraped company news, team context, and culture signals into a candidate brief.
3. **`3_evidence_selector.txt`**: Matches candidate profile evidence against JD requirements. **Guardrail**: Unsupported skills are strictly assigned to `unsupported_requirements` instead of fabricating matches.
4. **`4_resume_draft.txt`**: Generates tailored resume bullets strictly tracing back to verified evidence.
5. **`5_ats_evaluator.txt`**: Scores candidate resume (`0-100`) on keyword coverage, formatting, and relevance.
6. **`6_fact_checker.txt`**: Compares resume bullets against original candidate evidence. Flags any exaggeration or unverified metric with `safe_to_send: false`.
7. **`7_revision_loop.txt`**: Triggered automatically (up to 3 cycles) if ATS score or Fact-Checker flags issues.
8. **`8_cover_letter.txt`**: Generates a concise (150-200 word) outreach email referencing real research details.
9. **`9_change_report.txt`**: Generates a transparent change log (`changes`, `unsupported_requirements_not_addressed`, `recommendation`) presented to candidate before submission.

### 🧪 Verification & Audit Trail
- **Guardrail Demo**: Run `node prompts/demo.js` to execute a deliberate failure test case (candidate lacking Rust/Wasm) and verify Prompt #3 and #6 guardrail catches.
- **Trace Persistence**: Every pipeline execution logs detailed state transitions to `run_trace.json` for judge auditability.

---

## 🎤 KAIRO Voice Assistant & Background Listener

- **Wake Word**: Say **"Hello KAIRO"**, **"Hey KAIRO"**, or press **Spacebar 3 times**.
- **Windows Startup Integration**: Run `install_startup.ps1` to automatically listen in background on laptop boot.
- **Whisper & Ollama Speech Refiner**: Audio recorded natively via `winmm.dll` and refined using Ollama / Whisper for multi-accent accuracy.
- **Zero Window Flashes**: Spawns hidden background STT processes (`-WindowStyle Hidden`) for a clean desktop.

---

## 🌊 Multi-Tier LLM Waterfall & Rate-Limit Engine

```env
Tier 1: Gemini API Keys (Multi-Key Round-Robin & Exponential Backoff Retries on HTTP 429)
  ↓ (auto retry up to 3x with 1.2s-2.4s backoff before key cooldown)
Tier 2: OpenRouter Free Models Cascade (Gemini Lite, Llama 3.3 70B, DeepSeek R1, Qwen 2.5)
  ↓ (automatic key cooldown & retry-after header parsing)
Tier 3: Local Claude Proxy (claude-code-for-free @ http://127.0.0.1:3000/api — 100% free)
  ↓ (1.2s ultra-fast local timeout)
Tier 4: Local Ollama Model (llama3.2 / qwen2.5 @ http://127.0.0.1:11434 — 100% offline)
  ↓ (if all AI APIs rate-limited or internet offline)
Tier 5: Zero-API Smart DOM Heuristics & Local Fallback JSONs (0 Tokens Used • sub-15ms Playwright execution)
```

### 🌟 What Makes KAIRO's Waterfall Model Unique & Differentiating?

1. **🛡️ 100% Guaranteed Uptime (Zero Single Point of Failure)**
   Unlike standard AI agents that crash or halt when cloud API rate limits (HTTP 429) occur, KAIRO cascades seamlessly across 5 distinct execution layers. Even if internet connection is completely severed or quota is exhausted, KAIRO automatically shifts to Tier 5 Smart DOM Heuristics & Local Fallback JSONs and keeps automating.

2. **⏳ Dynamic Per-Key Cooldown Tracker**
   Parses `retry-after` HTTP response headers and error messages in real time. Exhausted API keys are silently quarantined for 20–30s while active keys continue executing without interrupting the user's turn.

3. **🔒 Local Privacy-Preserving Hybrid Processing**
   Allows sensitive candidate credentials, profiles, or internal documents to be processed on local Ollama or Claude instances (Tier 3/4) without sending raw data to external third-party cloud servers.

4. **⚡ Synergy with Token-Zero Trajectory Memory**
   When paired with KAIRO's Reinforcement Learning Q-Cache (`workflow_memory.json`), once a web path is successfully executed, the Waterfall Engine is bypassed entirely on subsequent runs, executing at sub-200ms DOM speed using **0 LLM Tokens**.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
npm run install-browsers
```

### 2. Configure Environment (`.env`)
```env
# Tier 1: Local Model Proxies
LLM_PROVIDER=claude_free
LOCAL_CLAUDE_URL=http://127.0.0.1:3000/api
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2

# Tier 2: Gemini API Keys
GEMINI_API_KEY=your_key_1
GEMINI_API_KEY_2=your_key_2

# Tier 3: OpenRouter Keys
OPENROUTER_API_KEY=your_openrouter_key
```

### 3. Run KAIRO
```bash
node index.js
```

### 4. Install Laptop Startup Listener (Optional)
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install_startup.ps1
```

---

## 📁 Repository Structure

| Directory / File | Role |
|---|---|
| `webcmd_repo/` | Core **webcmd** autonomous browser command surface & Playwright runtime |
| `index.js` | Main agent — menu dispatcher, planner, browser launcher, Q-cache replay |
| `jobs.js` | Job Discovery Agent — 17-field schema, 7-signal match matrix, dashboard |
| `prompts/` | **Prompt Library** — 9 model-agnostic templates (`1_jd_parser` to `9_change_report`) |
| `prompts/pipeline.js` | 9-Stage pipeline orchestrator & fact-checker revision loop |
| `prompts/demo.js` | Standalone verification script for deliberate failure guardrail test |
| `voice.js` | **KAIRO** — JARVIS smooth male voice engine, SAPI TTS, Ollama intent refiner |
| `utils.js` | Multi-Tier LLM Waterfall, DOM heuristics, fuzzy Jaccard Q-cache matcher |
| `profile.js` | User profile store for candidate resume fields & form auto-filling |
| `listen_space_global.ps1` | Continuous background listener for "Hello KAIRO" & 3x Spacebar |
| `install_startup.ps1` | Registers background listener into Windows Startup folder |
| `Start_KAIRO.bat` | Launcher batch script for KAIRO Voice Assistant |
| `workflow_memory.json` | Learned RL Q-trajectory cache |

---

## 🛡️ Safety & Privacy

- 🔒 **Credentials Stored Locally**: Profile details remain in `./user_profile.json` on your device.
- 🛑 **Section 9 Hard Gate**: Never auto-submits any application or payment without explicit `"Yes"` terminal confirmation.
- ⚡ **Zero-Token Replay**: Cached workflows execute with 0 tokens sent to any external API.

---

## 📜 License

MIT

