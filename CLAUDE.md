# cloudwatch-metrics — repo card

> A map, not a manual. Keep it ~1 screen; point to detail, don't inline it.

## What it is
A Node.js npm package (`cloudwatch-metrics`) that wraps `@aws-sdk/client-cloudwatch` to simplify creating and publishing custom CloudWatch metrics. It buffers data points and flushes them on a configurable interval to stay within CloudWatch rate limits.

## serves
role: Shared observability utility — provides the `Metric` class used by backend services to emit CloudWatch custom metrics with buffering, sampling, and summary-statistics support.
referenced-by: [any Mixmax backend service that emits custom CloudWatch metrics; published to npm as `cloudwatch-metrics`]

## Code map
- Entry point -> `index.js` (exports `initialize`, `Metric`)
- Summary statistics -> `src/summarySet.js`
- Tests -> `spec/`

## Conventions
- CommonJS (`require`/`module.exports`) throughout — match the existing style.
- `Metric` instances buffer puts internally; the interval (`sendInterval`, default 5 s) and capacity (`maxCapacity`, default 20) drive actual CloudWatch calls — never call `cloudwatch.send` directly.
- Disable metrics in dev/local via `{ enabled: false }` option, not by omitting the `Metric` instantiation.
- Dimension order in `summaryPut` is significant — changing order creates a separate summary key.

## Gotchas
- `put` is fire-and-forget; errors only surface via `sendCallback`. Always wire up `sendCallback` in production callers.
- `shutdown()` must be called before process exit (clears intervals and flushes remaining data points).
- High-resolution metrics require `{ storageResolution: 1 }` — omitting it defaults to standard 60 s resolution.

## Run / test
```sh
npm test          # runs jasmine specs
npm run lint      # eslint
npm run ci        # lint + test
```

Publish a new version:
```sh
GH_TOKEN=xxx npx semantic-release --no-ci
```

## Load the matching domain card
This repo is cross-cutting tooling — it owns no product domain, so there is no domain card to load. When working here, load the card of the consuming service/domain if the change is driven by its needs.
