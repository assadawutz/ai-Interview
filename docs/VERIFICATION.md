# Upgrade verification and limits

The target story is: user supplies actual experience/JD → submits or captures a question → Express validates the request → provider generates a draft → consistency review checks the draft against the question and profile → UI presents corrections, evidence and missing information → a recoverable session stores the result.

## Coverage

| Boundary                      | Automated evidence                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI → API                      | Playwright tests use the production frontend and real Express routes on port 3101                                                                                     |
| API validation/auth           | Regression tests check malformed payloads, app-token checks, origins and missing credentials                                                                          |
| API → provider                | A test-only `Provider` implementation receives actual validated SDK-shaped parameters; production uses GoogleGenAI                                                    |
| Stream → UI                   | Split UTF-8, CRLF, explicit completion, partial failures, cancellation, stale requests and review corrections are covered                                             |
| Review → evidence             | Quotes must be exact matches in identified source fields; invalid quotes and their proposed revisions are rejected                                                    |
| Requirements → preparation    | JD-only claims cannot become candidate evidence; requirements without JD quotes are marked inference                                                                  |
| Profile → cache               | Changes to profile/language/task/review mode change answer fingerprints                                                                                               |
| Audio → transcript → question | Browser tests capture synthetic WebAudio, encode segments with MediaRecorder, then call real transcription/detection/coaching API routes against the provider fixture |
| Storage → recovery            | v1/v2 migration, v3 defaults, expiration, corrupt-data preservation, privacy wipe and unfinished practice recovery                                                    |
| Accessibility                 | Automated WCAG checks on main screens, completed coaching and generated preparation plans; responsive desktop/mobile screenshots                                      |
| PDF                           | Browser print output preserves Thai text using self-hosted fonts                                                                                                      |

The fixture server is guarded by `INTERVIEW_TEST_MODE=1`, is not imported by `server.ts`, and binds to localhost. It never uses a real Gemini key. Tests do not rely on an existing developer server or credentials.

## Verified local run for v2.0

- Formatting, strict TypeScript checks and production build passed.
- **45 regression/API/quality/adapter tests passed.**
- **26 browser cases passed across development UI and production integration flows**, including 9 full API/provider-boundary integration cases.
- `npm audit` reported **0 known vulnerabilities** in the installed dependency tree at this check.
- The live evaluator stopped before generation because the server key is not configured. No live Gemini quality score is claimed.

These results describe the checked flows and fixtures, not an assertion that every possible input is error-free.

## Live checks still required

The workspace has no configured `GEMINI_API_KEY`. Live generation, real model authorization, Google speech accuracy, actual voice quality, real microphone/tab permissions, real-world latency and provider billing cannot be confirmed from fixture tests.

After setting the key, use System's model metadata check and `npm run eval:live`. Metadata access alone does not prove that generation is authorized or quota is available. Read the resulting evaluation report, manually verify technical explanations and actually execute relevant coding examples in a suitable development environment. The app does not execute suggested code or claim it has done so.

## Interpreting review results

- **Consistent:** this AI pass did not identify an inconsistency. It is not a proof of truth.
- **Needs revision:** address the reported issue and inspect any proposed correction before using it.
- **Insufficient evidence:** supply actual experience, requirements, constraints or sources instead of guessing.
- **Unavailable / skipped:** the draft has not received this consistency pass.

Evidence matching proves that a phrase occurs in user inputs, not that the original claim is true. A useful interview coach improves understanding, relevance and preparation; it cannot promise an employer's hiring decision.

## Personal credential settings

The settings modal is covered for masked entry, save, reload, deletion, and opt-in
persistent browser storage. A concurrent API regression proves that separate
requests use separate provider credentials and that a later credential-free
request cannot inherit another user's key. Health returns credential presence
only. No real Gemini credential was used for these tests; saving validates key
format, while provider metadata checks and generation still need a real key.

## Local LLM, quota failover and Realtime

Tests cover Gemini 429 → independent Ollama route, no same-provider quota retry,
per-credential cooldown, keyless local-primary routing, request isolation, no
restart after partial text, and refusal to drop Google grounding silently.
AI SDK adapter tests inspect real OpenAI-compatible JSON requests and streamed
responses through a deterministic HTTP transport; they do not run a local model.

Browser checks cover saved Ollama routing and Realtime capture → visible rolling
transcript → question detection → sequential automatic answers, duplicate
filtering, recognition restart and stop. Speech events/audio are synthetic.
There is no Ollama daemon or installed model in this workspace, so model quality,
CPU/GPU latency and real microphone recognition remain unverified. Cloud checks
confirm localhost cannot be selected as a reachable Vercel Ollama service.

## Vercel cloud inference route

Ollama Cloud adapter tests verify HTTPS endpoint selection, provider-specific
Bearer authentication, safe model catalog IDs and JSON/stream response mapping.
A browser case loads a cloud catalog, selects a model, saves settings and sends
that provider's credential with coaching requests. Catalog metadata is explicitly
marked as not verifying credentials or quota. Actual paid/authenticated cloud
generation remains unverified without a user-provided Ollama credential.
