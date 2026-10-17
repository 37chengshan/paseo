# Native Grok question reproduction

This branch retains an intentionally failing regression for [#3490](https://github.com/getpaseo/paseo/issues/3490). It changes no production behavior.

Run from the repository root after installing dependencies and building server dependencies:

```sh
npm ci --no-audit --no-fund
npm run build:server-deps
npm run test:unit --workspace=@getpaseo/server -- src/server/agent/providers/grok-question-repro.test.ts
```

On main `f472c9d1f4339c0f36583e84bf62c80c12867110`, the test fails:

```text
Question permissions: 0 (expected 1)
Expected: {"outcome":"accepted","answers":{"Choose a color":["Blue"]}}
Received: {"code":-32601,"message":"\"Method not found\": _x.ai/ask_user_question"}
```

The test uses a deterministic subprocess with the real ACP SDK and stdio transport, through the public session API. It emits the native request, chooses Blue if a question permission arrives, and checks the response. It does not use a live model or render the app.

The same test passes unchanged on [#7015](https://github.com/getpaseo/paseo/pull/7015) at `b8a48e4825cf49d09f352a4b3d7793847657908c`. All 165 targeted local checks passed there: 146 ACP tests including this independent regression, 10 shared form-core tests, two serialization tests, and seven Chromium question-form tests.

The real Grok attempt ended during session initialization, before any question was emitted. Live question generation, the rendered card, lettered fallback, OpenCode comparison, and the contributor's newer report of Grok merging labels after answering remain unverified. Reproduction confidence is 3/5; diagnosis confidence is 5/5 for the reproduced protocol failure only.

The missing-handler analysis from [luoph](https://github.com/luoph) holds at the ACP boundary. The proposed fix and subsequent answer-identity work are by luoph and [RoundRedDot](https://github.com/RRD-dev); this branch retains independent verification rather than a replacement fix. Updates stay on [the issue](https://github.com/getpaseo/paseo/issues/3490).
