# Free tooling this repo qualifies for — the $0 roster

Agent-compiled (Claude, September 2026). What being a public, Apache-2.0 repo buys at zero budget, filtered to what a client-only PWA plus one small Worker can actually use, with a verdict per item. Adopted items graduate into docs/code-standards.md or a spec; this file is the source list.

## Adopt

- **Biome** — adopted 2026-09-17 (PR #54), lint-only. See docs/code-standards.md, Tooling. The ESLint path is blocked until typescript-eslint supports TypeScript 7 (target: TS 7.1, beta ~Oct 2026); if type-aware `no-unsafe-*` rules become worth their weight before Biome stabilizes its types domain, the candidate is oxlint + tsgolint (59 of typescript-eslint's 61 type-aware rules against TS 7 today).
- **Sentry open-source sponsorship** — [sentry.io/for/open-source](https://sentry.io/for/open-source/): 5M errors/mo, Business-tier features, no term limit; "a friendly license like Apache or MIT" is the stated bar, no stars floor. Apply at sentry.io/sponsorship after creating the org (sponsorship binds to one org; US/EU data residency is fixed at org creation). Ship errors-only (~30 KB gzip), `breadcrumbsIntegration({ console: false, dom: false })`, a `beforeSend` stripping query strings, and the `tunnel` option through the relay so browsers never talk to Sentry directly. Pin the SDK below v11 — v11's `dataCollection` defaults flip permissive (userInfo/cookies/httpHeaders/urlQueryParams all true). Even configured tight, Sentry derives geo from IP server-side, so privacy.html changes in the same commit that adds the SDK.
- **CodeQL default setup** — free on public repos, JS/TS needs no config. Two clicks in Settings → Code security.
- **Secret scanning push protection** — free and default-on for new public personal repos since March 2024; this repo may predate that, so verify it's actually on. Relevant: `CLOUDFLARE_API_TOKEN` and the relay keys live in repo/Worker secrets.
- **Private vulnerability reporting** — free, off by default, one toggle. Gives researchers a channel that isn't a public issue.
- **PR CI** — no service needed; the gap was ours. Fixed in PR #54 (`.github/workflows/ci.yml`); previously npm test only ran inside the push-to-main deploy.
- **Lighthouse CI** — via `treosh/lighthouse-ci-action` (maintained; Google's own lhci is stalled at v0.15.1) with `upload-artifact`, not `temporary-public-storage` (public links, 7-day retention). Assert LCP and CLS budgets plus TBT as the responsiveness proxy. **Lab runs cannot measure INP** — no user, no interactions; Lighthouse has no INP audit. Never label a TBT budget as an INP target.
- **Cloudflare Web Analytics** — free, cookieless, script-tag on non-proxied hosts like Pages, and it reports real-user Core Web Vitals *including INP*, which is the number Lighthouse structurally can't produce and CrUX won't at this traffic (CrUX needs thousands of monthly Chrome sessions). The only honest INP source available to this site.
- **BrowserStack Open Source** ([browserstack.com/open-source](https://www.browserstack.com/open-source)) and **TestingBot** ([testingbot.com/open-source](https://testingbot.com/open-source)) — real iOS Safari devices at $0. TestingBot publishes its criteria (public repo, OSI license, active, non-commercial); BrowserStack's are unpublished. Apply to both. The iOS Simulator misses memory-pressure tab eviction, A2HS/standalone behavior, and real scrolling; Playwright WebKit is trunk WebKit with UA emulation — a good CI regression net, never "tested on iOS Safari."
- **Cloudflare Workers Logs** — free plan: 200k events/day, 3-day retention. `worker/wrangler.toml` has no observability block today; add one.
- **Cloudflare preview deploys** — Pages free tier (500 builds/mo, unlimited preview deployments) or Workers Builds (3,000 min/mo) give per-PR preview URLs. For a phone-first site, opening a branch URL on the actual phone before merge is worth more than most dashboards. GitHub Pages stays production.
- **Renovate** (Mend cloud, free on public repos) over Dependabot version updates — grouping, scheduling, and the `customManagers:biomeVersions` preset that keeps the pinned Biome version and its `$schema` URL in sync. Keep Dependabot security alerts; running both version-updaters means duplicate PRs against one lockfile.
- **size-limit + `andresz1/size-limit-action`** — no account, comments the bundle diff on PRs, fails on budget breach. Install cost is the metric for someone opening the app mid-attack on cellular.
- **UptimeRobot free** — 50 monitors at 5-min interval; two monitors (site, relay) is five minutes of setup.

## Skip, with reasons

- **Codecov / Coveralls** — token required for uploads from protected branches, vendor churn (Codecov sold to Harness, June 2026), and a PR comment tells a solo maintainer nothing a red check doesn't. `vitest --coverage` with a failing threshold does the job with no account.
- **GitHub artifact attestations** — free, but provenance for a Pages deploy nobody redistributes buys nothing.
- **Copilot OSS-maintainer program** — eligibility is an unpublished popularity bar this repo doesn't clear; not a lever we can pull.
- **Visual regression (Chromatic/Percy/Argos)** — nothing to hang it on without Storybook; if chart rendering starts regressing, Argos (5,000 free screenshots/mo) riding the Playwright run is the one to try.
- **Sauce Labs OSS** — the program page 404s; no application path found.
- **GitHub Pages limits are a non-issue** — 1 GB site / 100 GB/mo soft bandwidth / 10-min deploy timeout, and the 10-builds-per-hour soft cap doesn't apply to Actions-based deploys, which this repo uses.
