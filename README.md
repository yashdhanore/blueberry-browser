# Blueberry Browser – Gemini Computer Use Extension

This fork adds **Gemini Computer Use (CU)** to Blueberry Browser.

The goal of this implementation is to let an AI agent **control the browser** – navigate, click, type, scroll, read pages, and extract data – through a **safe, observable and well-structured integration**, with a sidebar UX that clearly shows what the agent is doing.

here's a quick demo:
[Blueberry](https://www.loom.com/share/a257d0ffe9d145de9c80a3de36849a6b)

---

## Implemented Feature: Gemini Computer Use Agent

This fork implements **“Gemini Computer Use in Blueberry”** from the suggested feature list.

At a high level:

- From the **sidebar chat**, Blueberry can spin up a **Gemini Computer Use agent** attached to the **currently active web page**.
- The agent can:
  - navigate,
  - click / scroll,
  - type and fill forms,
  - read and summarize pages,
  - extract structured data.
- All of this is surfaced via a **live Browser Agent Activity card** in the sidebar so the user can **see, pause, resume, and cancel** what the agent is doing.

The implementation is designed to be:

- **Agent-ready** – built around a dedicated orchestration layer instead of sprinkling logic through the UI.
- **Electron-aware** – uses CDP to attach to the same browser instance the user is using (no separate Chrome).
- **Safe and observable** – the sidebar shows every step, with a clear lifecycle and guardrails.

---

### Architecture overview

- **`StagehandAgentManager` (main process, `src/main/agent/StagehandAgentManager.ts`)**
  - Wraps the @browserbasehq/stagehand SDK directly and is responsible for CDP discovery, matching the active Electron tab to a Stagehand page, launching the CU agent, and streaming results.
  - Emits lifecycle events (`start`, `screenshot`, `complete`, `error`, `cancelled`, `history`) and exposes helpers such as `runTask`, `cancelCurrentTask`, `getState`, and `cleanup`.

- **`AgentService` (main process, `src/main/agent/AgentService.ts`)**
  - Owns the singleton `StagehandAgentManager`, ensures the main window is wired in, and forwards lifecycle events to the sidebar via `agent-update` IPC messages.
  - Presents a stable API to the rest of the app (`startAgent`, `cancelAgent`, `pauseAgent`, `resumeAgent`, `getAgentState`) even though pause/resume are currently best-effort no-ops.
  - Locks/unlocks user interaction while a CU run is executing so the user can see when the browser is under agent control.

- **Preload bridge (`src/preload/sidebar.ts`)**
  - Exposes a typed `sidebarAPI` to the renderer via `contextBridge`.
  - Bridges **chat** and **agent** concerns:
    - Chat: `sendChatMessage`, `clearChat`, `getMessages`, `onChatResponse`, `onMessagesUpdated`, `getSmartSuggestions`.
    - Agent: `startAgent`, `cancelAgent`, `pauseAgent`, `resumeAgent`, `getAgentState`, `onAgentUpdate`.
  - This keeps the renderer completely unaware of Electron/Node internals and IPC details.

- **Sidebar renderer (`src/renderer/sidebar`)**
  - `ChatContext` owns the **conversation state** and subscribes to `sidebarAPI` events. It merges:
    - Normal chat messages; and
    - Agent activity items into a single `conversationItems`.
  - `AgentActivityCard` renders an agent run card showing:
    - Compact / detailed views.
    - Progress, current reasoning (when available), latest screenshot, and the final outcome.
    - Controls for **Pause**, **Resume**, **Cancel**, and **Dismiss**.
  - `Chat` composes the chat transcript, smart suggestions, and the agent activity card into one UX.

### Capabilities & UX

- **Natural‑language browser automation**
  - From the sidebar chat, the system can spin up a Gemini Computer Use agent to work on the **currently active web page** in Blueberry.
  - Typical use cases: “research this topic and summarize it”, “log into X and find Y”, “scroll and extract all entries from this table”, etc.

- **Safe page targeting**
  - `StagehandAgentManager` inspects Stagehand’s context to find a page matching the active Electron tab, explicitly excluding **Chrome/DevTools** and Blueberry’s own UI (topbar/sidebar dev URLs).
  - The system prompt reinforces this by telling Gemini to **avoid clicking or typing in Blueberry’s chrome** and to avoid destructive actions unless explicitly requested.

- **Rich, live status in the sidebar**
  - Each run appears as a **Browser Agent card** with:
    - Current status (Running / Paused / Completed / Error).
    - Turn and step counts.
    - Streaming reasoning and action list (with arguments and success/failure styling).
    - Before/after screenshots rendered inline.
  - Users can pause, resume or cancel a run at any time and dismiss completed runs to keep the sidebar tidy.

- **Smart suggestions + chat**
  - The chat experience remains first‑class: messages are rendered with markdown, streaming text, and **smart suggestions** that react to the current page and recent answers.
  - This makes it easy to **iterate on goals**: ask follow‑ups, refine instructions, or spin up new agent runs with slightly different objectives.

### How to run & try the agent

1. **Install dependencies** (once):

   ```bash
   pnpm install
   ```

2. **Start the app in development**:

   ```bash
   pnpm dev
   ```

3. **Ensure Electron exposes a CDP endpoint**
   - By default, `AgentService` connects to `http://127.0.0.1:9222/json/version`.
   - Optionally override this with `ELECTRON_REMOTE_DEBUGGING_URL` if you use a different host/port.

4. **Configure `.env` for the chat LLM (and Stagehand, if needed)**

At minimum you need an API key for the chat LLM, you also need a gemini api key since we use gemini computer use model. To get the gemini api key go to [Google AI studio](https://aistudio.google.com/):

```bash
# OpenAI (default)
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai
GEMINI_API_KEY=Aq
# optional, otherwise defaults to gpt-4o-mini
LLM_MODEL=gpt-4o-mini

# Or Anthropic
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-ant-...
# LLM_MODEL=claude-3-5-sonnet-20241022
```

5. **Use the sidebar**
   - Open Blueberry and toggle the sidebar (⌘E as hinted in the UI).
   - Use the chat to describe your goal; when the main process chooses to run a browser agent for that goal, the **Browser Agent** card will appear and stream progress.

### Design decisions & tradeoffs

- **Lean on Stagehand’s built-in agent**
  - Earlier iterations tried to re-implement Stagehand’s act/observe flow with custom locator tools, executors, and tool schemas. The current approach simply calls `stagehand.agent({ cua: true }).execute(...)`, which is easier to reason about and automatically benefits from Stagehand’s self-healing behaviors.

- **Iterated from a custom Gemini CU loop**
  - The first version (see the `computer-use-initialize` branch) implemented Computer Use manually: capture screenshot → send to Gemini → parse the response into actions → execute actions via denormalised screen coordinates.
  - This proved brittle and slow in practice: even with correct coordinate maths, Gemini often missed the intended targets, and the orchestration loop became complex to maintain.

- **Attaching Stagehand to Electron instead of spawning a separate browser**
  - Libraries like Stagehand and browser-use typically launch their own Chrome instances, which does not match Blueberry’s Electron‑embedded browser.
  - Stagehand’s **local browser + CDP** mode allows us to expose the Electron browser (`ELECTRON_REMOTE_DEBUGGING_URL`) and attach the agent directly to the same pages the user sees.
  - This keeps the mental model simple: there is only one browser, and both the user and the agent are acting in the same environment.

- **Event‑driven UI**
  - All agent updates are modelled as **events** (`agent-update` IPC) instead of request/response calls.
  - This lines up naturally with long‑running CU sessions and keeps the React tree in sync via a single `ChatContext`.

- **Single agent today, multi‑agent ready**
  - The current implementation runs a single Stagehand agent configured for general browser automation.
  - The `StagehandAgentManager` abstraction purposely keeps the surface area small so we can spin up specialised agents (different prompts, models, or integrations) in the future without rewriting the IPC or UI layers.

- **Explored local LLMs via transformers.js**
  - There was an attempt to run a fully local LLM using `transformers.js`, but ONNX Runtime kept crashing in Electron’s main process on macOS.
  - Multiple small models (Qwen2.5‑0.5B, Qwen3‑0.6B, TinyLlama, Phi‑3.5) were tried; all hit either memory‑allocation failures during inference or incompatibilities with `onnxruntime-node`’s CPU backend.

- **Composable UI primitives**
  - The `Plan` and `Task` components are generic, re‑usable building blocks. They make it easy to evolve the agent UX (e.g. add timelines, multiple agents, or richer debugging views) without rewiring the rest of the system.

# Blueberry Browser

> **⚠️ Disclaimer:** I'm not proud of this codebase! It was built in 3 hours. If you have some time left over in the challenge, feel free to refactor and clean things up!

https://github.com/user-attachments/assets/bbf939e2-d87c-4c77-ab7d-828259f6d28d

---

## Overview

You are the **CTO of Blueberry Browser**, a Strawberry competitor. Your mission is to add a feature to Blueberry that makes it superior & more promising than Strawberry.

But your time is limited—Strawberry is about to raise a two billion dollar Series A round from X-Separator, B17Å and Sequoiadendron giganteum Capital.

## 🎯 Task

Your job is to **clone this repo** and add a unique feature. Some ideas are listed below.

It doesn't need to work 100% reliably, or even be completely done. It just has to:

- Show that you are creative and can iterate on novel ideas fast
- Demonstrate good system thinking and code practices
- Prove you are a capable full stack and/or LLM dev

Once you're done, we'll book a call where you'll get to present your work!

If it's cracked, we might just have to acquire Blueberry Browser to stay alive 👀👀👀

### ⏰ Time

**1-2 weeks** is ideal for this challenge. This allows you to work over weekends and during evenings in your own time.

### 📋 Rules

You are allowed to vibe code, but make sure you understand everything so we can ask technical questions.

## 💡 Feature Ideas

### **Browsing History Compiler**

Track the things that the user is doing inside the browser and figure out from a series of browser states what the user is doing, and perhaps how valuable, repetitive tasks can be re-run by an AI agent.

_Tab state series → Prompt for web agent how to reproduce the work_

### **Coding Agent**

Sidebar coding agent that can create a script that can run on the open tabs.

Maybe useful for filling forms or changing the page's style so it can extract data but present it in a nicer format.

### **Tab Completion Model**

Predict next action or what to type, like Cursor's tab completion model.

### **Your Own Idea**

Feel free to implement your own idea!

> Wanted to try transformers.js for a while? This is your chance!

> Have an old cool web agent framework you built? Let's see if you can merge it into the browser!

> Think you can add a completely new innovation to the browser concept with some insane, over-engineered React? Lfg!

Make sure you can realistically showcase a simple version of it in the timeframe. You can double check with us first if uncertain! :)

## 💬 Tips

Feel free to write to us with questions or send updates during the process—it's a good way to get a feel for working together.

It can also be a good way for us to give feedback if things are heading in the right or wrong direction.

---

## 🚀 Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

**Configure your `.env`** in the root folder with at least an LLM API key.

By default the sidebar chat uses **OpenAI** via `OPENAI_API_KEY`. You can switch to **Anthropic** by setting:

- `LLM_PROVIDER=anthropic`
- `ANTHROPIC_API_KEY=...`
- `LLM_MODEL=claude-3-5-sonnet-20241022` (or any supported model name)

Strawberry will reimburse LLM costs, so go crazy! _(Please not more than a few hundred dollars though!)_
