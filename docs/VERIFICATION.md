# v4 verification and limits

The checked flow is browser → isolated provider settings → direct AI request →
streamed answer → evidence review → recoverable local session.

## Observed release checks

33 retained unit/regression tests and 7 static browser cases passed. Automated
WCAG A/AA checks passed on the retained desktop screens. The dependency cleanup
removed 95 installed packages, and 143 unused CSS rules were removed.

## Automated checks

- Formatting, strict TypeScript, unit/regression tests and a static production build.
- Browser checks at 320, 390, 768, 1024 and 1440 px across the retained destinations.
- Direct Gemini SDK streaming and evidence review through deterministic HTTP fixtures.
- Opt-in provider-key isolation, reset and preservation of unrelated localStorage.
- No application-backend request or console error in checked normal client flows.
- Retained regression coverage for local-session migration/expiry/corruption,
  evidence matching, bounded fallback, partial stream failures and free tier pricing.

The retired server/API and removed product screens are no longer tested or shipped.
Their former test counts do not describe this release. Existing historical practice
and preparation data remain part of the import/export contract.

## Limits

Provider traffic is intercepted for deterministic tests; no real account generation
or billing is tested. Actual provider CORS, live quota/model availability, microphone
hardware, browser speech services and local Ollama inference depend on the user's
environment. Catalog metadata does not prove inference access.

Local persistence is not encrypted. AI input leaves the device for a selected remote
provider. Evidence matching proves a quote occurs in user input, not that the claim
is true. The coach cannot promise a hiring outcome or claim suggested code ran.
