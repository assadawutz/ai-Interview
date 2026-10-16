# Interview Pulse · Neon Glass

A Thai/English interview preparation workspace. The default deployment is a
**static React/Vite client**: no application backend, server key, account database
or server session is required. AI requests go directly to the selected provider.

## Start

Node 22.12+ (24 recommended) and npm:

```sh
npm ci
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173). Open **System** to add a
Gemini key or configure an independent LLM. Without a key, local profile editing,
saved sessions, JSON import/export and PDF still work. There are no simulated
production answers.

```sh
npm run build
npm start
```

Deploy `dist/` on Vercel or another static host. `vercel.json` sets SPA routing and
security headers. No environment secret is needed. Never put credentials into
`VITE_*` variables: they are public build-time values.

## Workflow

1. Add actual experience, project stories, target role/company and JD in Profile.
2. Type a question, or use browser speech. Realtime displays a rolling transcript,
   detects questions and answers them sequentially without mixing active streams.
3. Review the answer, assumptions, suggested checks, evidence and missing facts.
4. Generate a role-fit preparation plan or practice answering yourself.
5. Save a session, export JSON, or print a Thai-font PDF.

The coach covers technical/coding/system-design, behavioral/STAR and case tasks.
It never promises a job offer. Suggested code is displayed, not executed. An AI
consistency review is not independent factual verification.

## Providers and fallback

- **Gemini:** native text, structured output, document extraction and grounded
  Google Search. Recorded-audio transcription requires a compatible model/key.
- **OpenRouter:** recommended free-role agents, catalog-verified zero text and
  request pricing, structured detection, coach, specialist and reviewer roles.
- **Groq / Ollama Cloud:** direct OpenAI-compatible text APIs with their own keys.
  Direct browser support depends on provider CORS and account/model permissions.
- **Local Ollama:** runs on the user's computer at `http://127.0.0.1:11434`.
  Start the service, install a model and permit the exact website origin using
  `OLLAMA_ORIGINS`. Browser Local Network permission/private-network rules may
  apply. Static Vercel hosting does not itself run the local model.

Fallback happens at most once, before text begins, on qualifying transient errors.
Gemini quota uses an independent configured provider. Partial answers never restart
on a different model. Account-wide daily free quota stops that account; no paid
fallback or unlimited-free guarantee. If free prices cannot be verified, requests
pause with a visible error. Model catalogs do not verify credentials or quota.

Free-only mode blocks native Google media/search even if a Gemini key exists.
Paste resume/JD text manually or disable free-only mode and connect Gemini for
those features. Read-aloud uses browser speech in client mode. Browser speech may
use a browser-vendor cloud service and is not guaranteed offline.

## Privacy and keys

Profiles, stories, sessions and preferences are stored in the browser. Keys default
to tab-only sessionStorage. Explicit **Remember on this device** uses namespaced
localStorage; external provider keys are separated by provider. Keys never enter
session exports or public configuration. Reset/privacy wipe removes app-owned
credentials and history, not unrelated storage.

localStorage is **not encrypted or a secure vault**: same-origin scripts, browser
extensions with access, or device users may read it. Do not remember keys on shared
computers. When AI is used, credentials and relevant input go directly to the
chosen provider. This is not a claim that AI processing or all personal data stays
100% on-device. Provider terms, retention, quota and billing apply. There is no
hidden CORS proxy. Network/CORS failures produce an actionable error.

## Design system

Yellow/lime/purple light mode, glass surfaces, near-black borders, offset shadows,
limited decorative tilt and monospace metadata. Bundled Noto Sans Thai keeps body
text readable. Shared public configuration lives in `src/config.ts`; CSS tokens
are applied once at startup. SDKs load only for provider operations.

SVG connections, a morphing outline, node highlights, floating labels and gradient
motion use CSS rather than a JavaScript animation loop. Motion pauses when the tab
is hidden or the user presses Motion FX pause. Reduced-motion settings take
priority; mobile gradients are static and PDF excludes decoration. 60 fps is a
design target, not a universal device performance guarantee.

See [locked UI/runtime specification](docs/UI-SPEC.md).

## Defensive behavior

- Zod validates input, imported sessions and structured model responses.
- Each AI request captures an isolated credential/configuration snapshot.
- Timeout, cancellation and stale-context guards prevent old results replacing
  new work. Interrupted/invalid streams cannot be marked complete.
- A failed review preserves the draft with an explicit unavailable state.
- Evidence quotes must match the specified profile/story; JD requirements never
  become proof of candidate experience. Unsupported revisions are rejected.
- Corrupt local history is preserved for recovery; unfinished work is recoverable.
- Provider errors are sanitized without hiding browser console errors.
- The hosting CSP allows only the fixed provider endpoints and local Ollama;
  no arbitrary key-bearing destination or remote script is accepted.

## Verification

```sh
npm run check       # formatting, strict types, regression tests, production build
npm run test:client # production static browser checks (no /api calls)
npm run test:e2e    # retained legacy server integration/browser suite
```

The client suite checks 320/390/768/1024/1440 px layouts, direct provider streaming
and review through deterministic HTTP fixtures, motion preferences and isolated
credential persistence/reset. Tests never need a real key. See
[verification and limits](docs/VERIFICATION.md) for observed results.

## Architecture

- `src/config.ts`: validated public defaults and shared design/motion tokens
- `src/lib/client-runtime.ts`: browser provider orchestration, cancellation,
  validation, bounded fallback and evidence review
- `src/lib/api.ts`: credential storage, request snapshots and transport selection
- `shared/`: contracts, requests, prompts, evidence checks, free-model selection
  and OpenAI-compatible adapter shared with optional legacy tooling
- `src/hooks/`: recoverable interview, speech and audio pipelines
- `src/components/`: UI modules, motion controls and decorative vectors
- `src/tech-theme.css`: visual token mapping and responsive/motion behavior
- `tests/client-e2e/`: static production client verification
- `server/`: optional legacy Express runtime, not deployed as Vercel Functions

For existing server integrations only, use `npm run dev:server` or
`npm run start:server` with `VITE_RUNTIME_MODE=server` for the frontend transport.
That mode supports the existing `.env.example` settings. The default static build
ignores server-only credentials and app access tokens. The legacy live evaluator
(`npm run eval:live`) targets that optional server; it is not a static-client test.
