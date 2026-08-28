# Liquid Glass Navbar

Build a reusable, floating top navbar matching your screenshot's layout with a heavy iOS 26-style liquid glass treatment, then mount it in the root layout so it appears across the app.

## Layout (matches screenshot)

```text
[ logo ]   …   [ Home* | Jobs | Feed ]   …   [ profile | bell | logout ]
```

- Pill-shaped bar, floating ~16px from top, centered with side margins, max-width container
- Left cluster: logo icon
- Center cluster: Home / Jobs / Feed with lucide icons (Home, Briefcase, Rss). Active item gets an inner glass "chip" highlight (Home active in screenshot)
- Right cluster: User, Bell, LogOut icon buttons
- Small chevron tab centered above the bar (collapse affordance), animates rotate on toggle
- Mobile: collapses to logo + hamburger; sheet opens the same items vertically

## Liquid Glass treatment (heavy)

- `backdrop-filter: blur(24px) saturate(180%)` via Tailwind `backdrop-blur-2xl backdrop-saturate-150`
- Translucent surface: layered `bg-white/15` over a subtle radial highlight gradient for the "lens" feel
- Thin inner + outer borders to simulate refraction edges (`border-white/30` + inset `ring-1 ring-white/10`)
- Soft specular highlight: pseudo-element with linear-gradient top white/40 → transparent, masked to top half
- Drop shadow: large, low-opacity (`shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)]`)
- Active nav chip uses a stronger inner glass: brighter tint + inner shadow for "depressed glass" look
- Subtle hover: scale 1.03 + brightness lift on icon buttons (framer-motion)
- Respects light/dark: tokens for glass surface, border, highlight added to `src/styles.css`

## Files

- `src/components/liquid-glass-nav.tsx` — the navbar (client component, uses `Link` + `useRouterState` for active state)
- `src/components/ui/glass-button.tsx` — small icon button variant with the glass hover state
- `src/styles.css` — add `--glass-surface`, `--glass-border`, `--glass-highlight`, `--glass-shadow` tokens (light + dark) and a `@utility glass-panel` for the core effect
- `src/routes/__root.tsx` — render `<LiquidGlassNav />` above `<Outlet />` inside `RootComponent` so it shows on every route
- `src/routes/jobs.tsx`, `src/routes/feed.tsx` — minimal stub routes so the nav links resolve under TanStack Router's type-safe routing (index already exists for Home)

## Behavior

- Active link detected via `useRouterState({ select: r => r.location.pathname })`
- Chevron toggles a collapsed state (bar slides up, leaving just the chevron tab) using framer-motion
- Logout button calls a `onLogout` prop (no auth wired yet — placeholder handler)
- Accessible: each icon button has `aria-label`; nav uses `<nav aria-label="Primary">`

## Out of scope

- No auth/logout logic, no notifications data — just the UI shell
- No backend changes
