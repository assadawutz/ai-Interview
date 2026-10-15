# Interview Pulse 2.0

A rewritten Thai/English interview preparation workspace with streamed Gemini coaching, live question detection, mock interviews, company research, resume/JD extraction, follow-up chat, read-aloud, and local session management.

## เริ่มใช้งาน

Requires **Node.js 22.12+** (Node 24 recommended) and npm. npm and `package-lock.json` are the supported install path.

```sh
npm ci
cp .env.example .env
# Set GEMINI_API_KEY in .env. Never put the key in browser code.
npm run dev
```

Open **http://localhost:3000**. Without a Gemini key the UI still starts, shows setup instructions, and supports local session viewing/import/export. AI requests return an actionable 503; there are no simulated production answers.

1. Open **My profile / โปรไฟล์ของฉัน** and add your actual experience, target role and job description.
2. Type a question in **Workspace**, or configure audio and click **Start listening**.
3. Use **Practice** to answer questions yourself and receive feedback on relevance, structure, evidence and clarity.
4. Save named sessions, export JSON backups, or choose **PDF** and use the browser's **Save as PDF** option.

## What changed

- Responsive, accessible workspace, with Thai/English controls, self-hosted Thai fonts, keyboard focus indicators, reduced-motion support, focus mode (`Alt+Shift+F`), and mobile navigation.
- Validated API inputs, optional app-token authentication, same-origin checks, request limits, bounded file uploads and sanitized provider errors.
- Streamed answer cards render as text arrives. Explicit completion is required; failed, stopped and queued requests have separate states. Replacing an answer cancels the previous request on the client and server.
- Transient/model-availability failures may use the configured fallback **before any text is emitted**. The UI reports the actual model, text token usage, elapsed time, and available web citations.
- Suggested scripts are grounded in supplied candidate facts. Missing evidence uses labeled placeholders; coaching never promises hiring outcomes.
- Automatic draft recovery, named sessions, validated v2/v3 JSON imports, expiration that removes persisted records, and complete local-data clearing. Active legacy v1 sessions and v2-format records are migrated after validation; unsuccessful migrations preserve the original store.
- Practice history **and unfinished practice question/answer** survive recovery when autosave is enabled.
- Gemini audio output is wrapped in a valid WAV container when returned as raw PCM. Browser speech is an explicit fallback.
- PDF uses browser printing with self-hosted Thai fonts; no broken built-in PDF font conversion.

## Evidence-first coaching and preparation

- **Question diagnosis:** intent, assumptions, clarifying questions, user-facing reasoning, validation steps and likely follow-ups. Choose Auto, Technical, Coding, System design, Behavioral/STAR or Case. Technical answers use correctness/trade-off/edge-case explanations rather than forced personal anecdotes.
- **AI consistency review (on by default):** the draft streams first, then a second model call checks the question, candidate claims, technical reasoning and missing information. Review adds latency and token usage; it can be disabled in the workspace. If review fails, the draft is explicitly marked unreviewed rather than presented as verified.
- **Exact evidence checks:** proposed quotes must match the supplied resume, JD, cover letter or identified story. Quotes that do not match are removed, the review is flagged, and proposed revisions from that invalid review are not automatically applied. JD requirements never prove a candidate possesses a skill.
- **Corrections and provenance:** accepted review revisions replace the spoken answer/script, and the original draft remains inspectable. Review model, tokens and optional configured cost are reported separately. Answers with unresolved review concerns are not spoken automatically; critical concerns disable manual read-aloud.
- **No independent factual verification claim:** exact string matching proves only that text occurs in the inputs. An AI consistency check can still miss technical/factual errors. Suggested code is displayed safely as text and is **not executed**. Use the validation steps and actual project records before relying on an answer.
- **Evidence/story bank:** add up to 20 actual projects using situation, responsibility, actions, results and skills. Missing outcomes stay missing instead of becoming invented metrics.
- **Role-fit plan:** map JD requirements to profile evidence, distinguish missing evidence from missing ability, and generate an actionable 1–7 day practice plan with success checks and employer questions. Requirements without a matching JD quote are labeled AI inference. Plan questions can be sent into the workspace for coaching.
- **Practice improvements:** choose question type and difficulty; feedback includes rubric scores, strengths, improvements and a suggested revision, rather than a hiring probability.
- **Cache invalidation:** profile, language, task type, speed, review mode and output settings are fingerprinted. Older-context answers are marked stale and regenerated when selected; unrelated prior AI answers are never treated as candidate evidence.
- **Session schema v3:** v2 sessions are accepted and upgraded with defaults, while existing storage key names stay compatible. Corrupt records are preserved with autosave paused; Sessions offers a raw recovery backup. Full local-data clearing also removes the in-memory app token.
- **Model diagnostics:** System can request metadata for configured models from the provider. This checks metadata access only, not generation rights or remaining quota.

## Live quality evaluation

After configuring the server key, start the app and run:

```sh
npm run eval:live
```

This makes **real, billable provider requests** using six fixed, non-personal interview/problem-solving cases. Optional `EVAL_BASE_URL` selects the running app origin. If app-token authentication is enabled, the script reads `APP_ACCESS_TOKEN` from the server environment/`.env`. Without a configured server key it stops before any generation request.

The report is written to `artifacts/live-evaluation.json`, including structural checks, review results, actual usage and a **human-review checklist** for each answer. Passing structural checks is not proof of factual or code correctness. The report must be read and coding examples tested separately. See [verification notes](docs/VERIFICATION.md).

## Audio behavior and limits

Audio starts only after a user action. Use **HTTPS or localhost** and a supported browser (Chrome/Edge recommended).

- **Default microphone:** browser SpeechRecognition when available, selected Thai/English recognition language, interim text and grouped final fragments. The browser may send audio to its speech service.
- **Selected microphone / shared tab / browser-speech fallback:** independently encoded ~5-second recordings sent to `/api/transcribe`. Transcription requests are serialized with a bounded queue. Silent segments are skipped; if the service falls behind, the UI reports skipped segments. This is segmented transcription, not a continuous duplex Realtime API connection. Segment boundaries may split words.
- **Shared tab:** select a browser tab and enable **Share tab audio**. Browsers/OSes may not supply audio for window/screen capture. No audio track produces an explicit error. Video is requested by the capture API but is never uploaded.
- Changing capture source, device or language stops the existing capture. Moving away from Workspace also stops capture. Use headphones to prevent read-aloud feedback into the microphone.
- Incoming detected questions are queued while an answer is running. Select them or use **next queued question**; existing answers are never silently interrupted by a newly detected question.

Detection confidence measures only whether the transcript is an interview question. It is **not** answer quality, candidate stress, or a hiring prediction.

## Configuration

See [.env.example](.env.example) for every option.

| Variable                                   | Purpose                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`                           | Server-only Google Gemini API credential                                                         |
| `PORT`, `HOST`                             | Listener; defaults `3000`, `0.0.0.0`                                                             |
| `APP_URL`                                  | Public HTTP(S) origin for same-origin validation behind a reverse proxy                          |
| `APP_ACCESS_TOKEN`                         | Optional shared app access credential; required operationally before sharing a deployment        |
| `GEMINI_MODEL_FAST/BALANCED/DEEP/FALLBACK` | Coaching and structured-output model selection                                                   |
| `GEMINI_MODEL_TRANSCRIPTION/TTS`           | Audio-specific models; text fallback is not used for audio                                       |
| `AI_TIMEOUT_MS`                            | Provider timeout; default 60000 ms                                                               |
| `AI_MAX_OUTPUT_TOKENS`                     | Streamed answer output cap; default 4096                                                         |
| `API_RATE_LIMIT`                           | API requests per IP per minute; default 60                                                       |
| `AI_MODEL_PRICING_JSON`                    | Optional model-ID → `{ "input": number, "output": number }` rates in USD per million text tokens |

Model defaults were checked against the current model catalog during implementation, but model availability must be verified with your Google account. The System screen checks **configuration**, not whether the key/model is authorized. Account access, quota, grounding and audio support still need live verification.

Cost is shown only when rates exist for the actual model used. Output estimates include reported thinking tokens. Estimates exclude search, audio, document and other provider charges; provider billing is authoritative. No prices are invented.

When `APP_ACCESS_TOKEN` is set, enter that token in **System**. It is kept in memory only and clears on refresh. This token is distinct from the Gemini API key. This is a personal/shared-token app, not a multi-user account system.

## Production

```sh
npm ci
npm run build
NODE_ENV=production npm start
```

Serve through an HTTPS reverse proxy, set `APP_URL` to the public origin, and configure `APP_ACCESS_TOKEN`. Serve all frontend and `/api/*` routes from the same origin. Preserve SSE streaming and disable proxy buffering for the stream endpoint. `npm run preview` serves the frontend only; use `npm start` for the complete app.

Express does not trust arbitrary forwarded IP headers. Behind a proxy, the default limiter may treat requests as one IP; configure a narrowly scoped trusted proxy if your deployment needs per-client limits. Rate-limit state is in memory and is not shared across multiple server instances.

## Data and privacy

- Browser storage contains candidate context, question/answer history, practice and recovery drafts. No application database is used.
- AI calls send their relevant text/documents/audio to Google. Browser recognition may use a separate browser speech service. Observe participants' consent and your provider's data policies.
- Files are not saved by the Express app. PDF/image uploads are limited to 8 MB; JSON imports to 10 MB.
- Disabling autosave deletes the recovery draft. It does not delete explicitly saved sessions.
- Expiration cleanup runs at startup and once per minute while the app is open. Data cannot be physically erased by JavaScript while the browser/app is closed; it is removed on the next opening.
- Clear all data removes current/legacy session stores and drafts. It does not remove downloaded backups or data retained by external providers.

## Verification

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs type checking, regression/API tests and a production build. CI also runs browser tests.

Regression tests cover risk parsing, fragmented UTF-8 SSE, explicit completion/errors, expiry, import validation, privacy clearing, PCM→WAV, API validation/auth/origins, provider fallback and upstream cancellation. Browser tests cover coaching, retries, stale-request isolation, profile/session flows, practice, grouped speech, responsive layout, accessibility and printable Thai reports.

Browser tests include both isolated UI fixtures and production frontend → real Express API → deterministic provider-boundary fixtures. Audio tests use synthetic audio. They do **not** validate a physical microphone, Google's live recognition, actual model access, or provider billing. A real Gemini key and browser audio permissions are needed for those final checks.

## Project layout

- `server.ts`: development Vite middleware / production static host
- `server/`: validated API routes, provider configuration, prompts and audio conversion
- `shared/contracts.ts`: shared Zod schemas and TypeScript contracts
- `src/hooks/`: cancellable interview generation, audio capture/detection and speech playback
- `src/components/`: workspace sections, profile, practice, sessions and system controls
- `src/lib/`: API/SSE client, local storage and migration
- `tests/`: API/regression, Playwright browser tests and a guarded test-only provider server
- `scripts/evaluate-live.ts`: optional live quality-evaluation runner
