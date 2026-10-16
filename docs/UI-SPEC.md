# Locked interface and runtime specification

## Release contract

The default build is a static React/Vite application. The browser calls fixed,
allowlisted model providers directly. No app API or server credential is required.
The optional Express runtime is development/legacy tooling, not part of the Vercel
runtime. `VITE_RUNTIME_MODE=server` explicitly selects that legacy transport.

`src/config.ts` validates public runtime/model defaults and the design tokens.
`src/tech-theme.css` maps those tokens to components. Do not add credentials to
build variables, source files, URLs, logs, analytics or session exports.

## Visual contract

Light mode; yellow, lime and purple accents; translucent panels; near-black borders
and offset shadows. Monospace metadata contrasts with readable Thai body text.
Primary actions remain legible without animation. Tilt is limited to decorative
labels and marks. Content panels and editable fields remain aligned.

The shared SVG layer contains bounded connection paths, a morphing outline and
node highlights. Gradients animate transforms; connection paths animate their
stroke offset. No animation loop updates React state per frame. Background effects
pause when hidden or when the user pauses Motion FX. System reduced-motion takes
priority. Smaller mobile gradients remain static; print suppresses all decoration.
60 fps is a design target, not a guarantee for every device/browser.

Verify 320, 390, 768, 1024 and 1440 px widths. Navigation, input, settings, practice,
preparation and history must remain usable without horizontal scrolling. Keep
visible keyboard focus, semantic labels and the skip link. Do not hide real errors
or patch console methods to manufacture a zero-error result.

## Async and provider contract

Each operation captures its own provider settings and credentials. Abort on stale
context, navigation where relevant, explicit stop and timeout. Validate user input
and structured model output with Zod. Never mark a truncated, invalid or interrupted
answer complete. A failed consistency review preserves the draft with a visible
unavailable state. Evidence quotes must match supplied facts.

Retry at most once, before text only, on a qualifying transient failure. An
independent provider is required after Gemini quota exhaustion. Free-only selection
requires verified zero pricing; account-wide daily quota stops that account.
No paid fallback, silent grounding removal or mixing partial answers across models.

## Privacy and storage contract

Profiles, sessions and preferences are stored locally. Keys default to tab-only
storage; explicit remember uses namespaced localStorage with provider separation.
Remembered keys are not encrypted: same-origin scripts or device users may access
them. Browser storage is not a secure vault. Privacy wipe removes app-owned history
and credential namespaces without deleting unrelated site storage.

AI input and credentials go directly to the chosen provider. The app cannot claim
that AI processing is 100% on-device. Browser speech may use a vendor cloud service.
Local Ollama runs on the user's computer at port 11434; the service must permit the
site origin with OLLAMA_ORIGINS and the browser may require Local Network permission.
Provider CORS, private-network rules and account quotas can block direct requests.
The UI reports such failures; it never falls back through an undisclosed proxy.
