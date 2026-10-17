# Interview Pulse 4

A focused interview workspace: ask a question, get a grounded answer, and check it
against your actual experience. Thai and English. Static React/Vite; no app backend.

## Run

```sh
npm ci
npm run dev
```

Open the Vite URL, then **System** to connect Gemini or an independent LLM.

```sh
npm run check
npm run test:e2e
npm run build
npm start
```

Deploy `dist/` to Vercel or another static host. No server key or `.env` is needed.

## Four destinations

- **Workspace:** question input, streamed answer and question queue. Optional
  microphone/Realtime capture. Answer depth and review options are collapsed.
- **Profile:** actual experience, target role/company and JD to ground the answer.
- **Sessions:** save, restore, JSON import/export, PDF and privacy wipe.
- **System:** provider keys, models and independent fallback.

The old practice planner, mock-interview screen, secondary chat, sidebar statistics,
decorative animation system and unused Express backend have been removed. Existing
sessions retain their historical practice/preparation fields for recovery and
export; those retired features do not run or make AI requests.

## AI and privacy

Gemini supports native documents, search and audio. OpenRouter supports verified
free-role routing; Groq and Ollama Cloud use their own keys. Local Ollama connects
to port 11434 on the user's computer and requires the exact site origin in
`OLLAMA_ORIGINS`, plus any browser Local Network permission. Provider CORS applies.

Keys default to tab-only storage. Explicit remember uses namespaced localStorage
with separate provider keys. Storage is not encrypted. Keys never enter session
exports. Profiles/history stay in the browser; AI input goes directly to the chosen
provider. Browser speech may use a vendor cloud service. This is not a promise of
100% on-device processing.

Requests have validation, cancellation, timeouts and at most one qualifying
fallback before output. Partial answers never restart on another model. Daily
account quota cannot be bypassed. Free-only routing rejects nonzero text, tier and
cache pricing; it never chooses a paid backup. Evidence review is not independent
factual verification, and suggested code is not executed.

## Structure

- `src/App.tsx`: four destinations and recoverable session state
- `src/hooks/`: question/answer, audio and browser speech pipelines
- `src/lib/`: browser runtime, provider credentials and local persistence
- `src/components/`: answer, profile, sessions and AI settings
- `shared/`: contracts, prompts, provider adapter and evidence checks
- `src/config.ts`: public defaults; never credentials
- `src/index.css`, `src/workspace.css`: base components and mobile-first layout

See [UI specification](docs/UI-SPEC.md) and [verification](docs/VERIFICATION.md).
