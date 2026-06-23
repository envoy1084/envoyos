<wizard-report>
# PostHog post-wizard report

The wizard has completed a full PostHog integration for the Astro hybrid portfolio project. Client-side analytics are initialized in every page via a `PostHog` component added to the root layout. A server-side singleton (`posthog-node`) is available in `src/lib/posthog-server.ts` for future API routes. The `portfolio_viewed` event fires on every homepage visit, marking the top of the engagement funnel.

| Event              | Description                                                                       | File                    |
| ------------------ | --------------------------------------------------------------------------------- | ----------------------- |
| `portfolio_viewed` | Visitor lands on and views the portfolio homepage — top of the engagement funnel. | `src/pages/index.astro` |

## Next steps

We've built some insights and a dashboard to track portfolio engagement:

- [Analytics basics (wizard) — Dashboard](https://us.posthog.com/project/482727/dashboard/1749934)
- [Portfolio Views (Total)](https://us.posthog.com/project/482727/insights/ZjtWf0uT)
- [Daily Unique Visitors](https://us.posthog.com/project/482727/insights/VJZkIp9G)
- [Views by Country](https://us.posthog.com/project/482727/insights/QflkKklg)
- [New vs Returning Visitors](https://us.posthog.com/project/482727/insights/50uw5eSO)
- [Views by Referrer](https://us.posthog.com/project/482727/insights/LzxvV4kN)

## Verify before merging

- [ ] Run a full production build (`pnpm build`) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST` to `.env.example` and any monorepo bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
