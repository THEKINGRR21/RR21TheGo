# PRODUCT_BRIEF.md

## 1. What we are building, and why it deserves to exist

**RR21** is the company. **Go** is the product — written with the tick as part of the wordmark. In stores it reads *RR21 Go*.

Go is a calorie and macro tracker. There are a thousand of those. Here is the one sentence that makes this one different:

> **Every other tracker estimates your maintenance calories once, on day one, from a population formula — and then never checks whether it was right. Go measures it from your own data and corrects itself.**

That is the thesis. Everything in this product either serves that sentence or gets cut.

**Why it matters.** A person sets up a diet app. It computes their maintenance at 2,850 kcal from a formula, tells them to eat 2,400, and they do — faithfully, for eight weeks. But their real maintenance was 3,050. They were never in a deficit. They lost nothing, blamed themselves, and quit. The app never noticed, because the app never looked.

Go looks. After 14 days of consistent logging plus weight entries, Go runs an energy-balance reconciliation against observed reality and tells you what your maintenance *actually* is. Then it adjusts your target and tells you it did.

**The tagline we design toward, even if we never print it:** *Measured, not guessed.*

**Anti-thesis — what we are not.** We are not a coach. We are not a nutritionist. We are not a motivational app. We do not shame, streak-guilt, or gamify hunger. Go is an **instrument**. Instruments report. The whole aesthetic follows from that word.

---

## 2. Who it's for

Primary: adults 18–35 who lift or train seriously, are running a deliberate cut or bulk, and have already outgrown apps that treat them like a beginner. They know what a macro is. They will log four times a day if — and only if — logging takes under five seconds.

Secondary: anyone tracking intake for a real reason (medical, athletic, recomposition) who is frustrated by consumer apps that hide the math.

**Explicitly not for:** under-18s (age-gate at signup — see §9), and anyone whose inputs suggest we would be doing harm by helping (see §9, non-negotiable).

**The five-second rule.** From cold app icon tap to "logged," for a food the user has eaten before: **≤3 taps, ≤5 seconds, works with no signal.** If a feature makes that number worse, the feature loses. This is the single hardest engineering constraint in the product and it drives the offline architecture, the search ranking, and the home screen layout.

---

## 3. Recommended stack

Justify or overrule each of these in the Implementation Plan — don't just accept them.

| Layer | Choice | Why |
|---|---|---|
| App | **Expo (React Native) + TypeScript**, expo-router | One codebase → iOS + Android + web. The web target matters: it lets Antigravity's browser subagent actually *verify* the UI, which it cannot do against a native simulator. That verification loop is worth more than the marginal polish of pure SwiftUI. |
| Styling | **NativeWind** (Tailwind for RN) driven by the tokens in §6 | Tokens live in one file. No hex literals anywhere else in the codebase — enforced by lint rule. |
| Motion | **Reanimated 3** + **react-native-svg** | The tick (§6) is an animated SVG stroke. This is non-negotiable infrastructure, not a nice-to-have. |
| Local store | **SQLite** (op-sqlite or expo-sqlite) as the source of truth on-device | Offline-first. The user logs in a gym basement. See §7. |
| Sync / server state | **TanStack Query** over a write queue | Optimistic writes, replay on reconnect. |
| API | **Hono** or **Next.js route handlers**, deployed to Cloud Run or Vercel | Thin. All third-party API calls proxy through here so no key ever reaches the client. |
| ORM | **Drizzle** | Typed schema, migrations in the repo, plays well with Neon. |
| DB | **Neon Postgres** | Already chosen. Branching is genuinely useful — give every milestone its own DB branch. |
| Auth | **Managed provider** (Clerk, Neon Auth/Stack, or Better Auth) issuing JWTs | **Do not roll your own auth.** Do not store passwords. Ship Sign in with Apple (Apple requires it if you offer any other social login) + Google + email. |
| Nutrition data | **USDA FoodData Central** (base) + **Open Food Facts** (barcodes) | Both openly licensed → we may cache them, which is what makes offline search possible. |

**⚠️ Read this before choosing a nutrition provider.** Commercial nutrition APIs commonly prohibit persistent local storage of their food database in their terms. Our offline requirement *depends* on caching. So: build the search layer against USDA FDC + Open Food Facts, which we can legally mirror. If you later add a commercial provider for restaurant coverage, treat it as a live-query-only source, never cached, and put it behind an interface so it can't leak into the offline path. **Read the actual ToS of any provider before integrating it, and surface what you find to me.** Also note Open Food Facts is ODbL — attribution and share-alike obligations attach to the *database*; check what that means for us and report back.

**If we go SwiftUI instead:** everything in §5, §6, §7, §9 still holds. Swap Reanimated→SwiftUI `Canvas`/`trim`, SQLite→SwiftData/GRDB, NativeWind→a `Theme` enum. Accept that Antigravity's browser verification loop no longer covers the UI, and compensate with snapshot tests.

---

## 4. Data model

Multi-tenant from line one. A bug that shows user A's food diary to user B is the bug that kills the company.

```sql
-- Identity is owned by the auth provider. We key off its subject claim.
create table users (
  id              uuid primary key default gen_random_uuid(),
  auth_subject    text unique not null,            -- JWT `sub`
  email           citext unique not null,
  display_name    text,
  sex_at_birth    text check (sex_at_birth in ('male','female')),  -- BMR formulas need this; it is not a gender field, label it honestly in UI
  birth_date      date not null,                   -- age-gate; see §9
  height_cm       numeric(5,1),
  units           text not null default 'metric' check (units in ('metric','imperial')),
  timezone        text not null default 'UTC',     -- "today" is user-local, never server-local
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz                      -- soft delete; hard-purge job at 30d
);

-- Targets are versioned, never overwritten. When the calibration engine (§8)
-- changes a target, we INSERT. The history IS the product.
create table targets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  effective_from    date not null,
  kcal              integer not null,
  protein_g         integer not null,
  fat_g             integer not null,
  carb_g            integer not null,
  basis             text not null check (basis in ('estimated','calibrated','manual')),
  bmr_kcal          integer,
  tdee_kcal         integer,
  formula           text,                          -- 'mifflin_st_jeor' | 'katch_mcardle'
  rationale         text not null,                 -- human-readable. Shown in the UI. Always.
  created_at        timestamptz not null default now()
);

create table body_metrics (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  measured_on    date not null,
  weight_kg      numeric(5,2),
  body_fat_pct   numeric(4,1),
  lean_mass_kg   numeric(5,2),                     -- if present, we use Katch-McArdle, not Mifflin
  source         text not null default 'manual' check (source in ('manual','inbody','dexa','scale')),
  created_at     timestamptz not null default now(),
  unique (user_id, measured_on, source)
);

-- Cached, legally-mirrorable food reference data. Shared across users.
create table foods (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('usda','off','user')),
  source_id         text,
  barcode           text,
  name              text not null,
  brand             text,
  kcal_per_100g     numeric(7,2) not null,
  protein_per_100g  numeric(6,2),
  fat_per_100g      numeric(6,2),
  carb_per_100g     numeric(6,2),
  fiber_per_100g    numeric(6,2),
  owner_user_id     uuid references users(id) on delete cascade,  -- non-null only for source='user'
  search_vector     tsvector,
  created_at        timestamptz not null default now(),
  unique (source, source_id)
);
create index on foods using gin (search_vector);
create index on foods (barcode) where barcode is not null;

-- Servings are the whole game. Nobody eats 100g of anything on purpose.
create table food_servings (
  id           uuid primary key default gen_random_uuid(),
  food_id      uuid not null references foods(id) on delete cascade,
  label        text not null,                      -- "1 medium (118 g)", "1 cup, chopped"
  grams        numeric(7,2) not null,
  is_default   boolean not null default false
);

create table entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  food_id       uuid not null references foods(id),
  logged_for    date not null,                     -- user-local date, NOT derived server-side
  meal          text check (meal in ('breakfast','lunch','dinner','snack')),
  grams         numeric(7,2) not null,
  -- Nutrition is SNAPSHOTTED at log time. If USDA revises a food next year,
  -- the user's history must not silently rewrite itself.
  kcal          numeric(7,2) not null,
  protein_g     numeric(6,2),
  fat_g         numeric(6,2),
  carb_g        numeric(6,2),
  client_id     text not null,                     -- idempotency key from the device queue
  logged_at     timestamptz not null default now(),
  unique (user_id, client_id)
);
create index on entries (user_id, logged_for);
```

**Isolation, defence in depth — all three, not one:**
1. **Postgres RLS** on every user-owned table, keyed off the JWT subject. Enable it and write a test that proves it: authenticate as user A, query user B's rows directly, assert zero rows.
2. Every server query filters by `user_id` from the *verified token*. Never from a request body, a query param, or a header the client controls.
3. An integration test that tries to read across tenants and **must** fail.

**Two design decisions above that you should not silently "simplify":** targets are append-only, and entry nutrition is snapshotted. Both look like redundancy. Both are load-bearing. Ask me before touching either.

---

## 5. Screens

### Onboarding — "calibrate the instrument"
Sex at birth, birth date, height, current weight, activity, goal (cut / maintain / gain), rate.

Then the fork that expresses the whole product:

> **Have you had a body composition scan?** (InBody, DEXA, or any scan that gave you a lean mass or body-fat number)
> — **Yes** → enter lean mass → we compute BMR with **Katch–McArdle** (`370 + 21.6 × LBM_kg`), which uses *your* body, not a population average.
> — **No** → **Mifflin–St Jeor**, and we say plainly: *this is an estimate from a formula. We'll measure the real number in about two weeks.*

Onboarding ends on a **target card** that shows the math: BMR → activity multiplier → TDEE → deficit → target. Every number is tappable and explains itself. **We never show a number we won't explain.**

### Home — the tick
The only screen most users see. See §6 for the tick. It shows:
- The tick, drawn to `consumed ÷ target`
- Remaining kcal, in the biggest type in the app
- Three thin macro bars: protein / fat / carbs, each against its target
- Today's entries, newest first, swipe-to-delete
- One primary action: **Log**

Nothing else. No feed, no tips, no banner, no upsell.

### Log — the five-second path
Search-first, with a keyboard already up. Results ranked: **(1) foods you personally log most, (2) recent, (3) global**. Personal frequency beats global relevance, always — after two weeks the top three results should be what this person actually eats, and the flow becomes tap-tap-done.

Barcode scan available from the same screen. Serving picker defaults to the last serving *this user* chose for *this food*.

**Empty state copy:** "Nothing logged yet. Start with what you ate most recently." Not "Oops! No foods!" Instruments don't chirp.

### Weight
One number, one field, a chart. The chart shows a **7-day moving average as the solid line and the daily readings as faint dots** — because daily weight is mostly water and showing it as the primary line teaches people to panic about noise. This is a wellbeing decision, not a chart-style decision.

### Trends
Intake vs. target over time. Weight trend. And the calibration verdict (§8) when it exists.

### Settings
Targets (view history — every past target with the rationale that produced it), units, notifications, **export my data**, **delete my account**.

---

## 6. Design system

**The word to design against is `instrument`.** Not "gym." Not "hardcore." A lab bench, a telemetry HUD, a stadium clock. It reports, it does not shout.

The brief pins the palette: **black and fluorescent green**. That is a constraint, not a suggestion — build it. But black + neon green is also the single most common look an AI reaches for when it has no idea what to do, so we have to earn it. We earn it with three rules:

1. **The green is ink, not paint.** It appears as thin strokes, small caps micro-labels, one number, and the tick. It never fills a large area, never a full-width button fill, never a card background. On an OLED at 6am, a big green fill is a physical assault. Restraint is what makes it read as *expensive* rather than as *gamer*.
2. **The black is not `#000000`.** Pure black crushes on OLED and makes the green vibrate. We use a near-black with a slight cool cast.
3. **One place gets all the boldness: the tick.** Everything else is quiet.

### Tokens
Define once, in `theme/tokens.ts`. **A lint rule bans hex literals everywhere else in the codebase.** Enforce it in CI.

```ts
export const color = {
  void:     '#08090A',  // app background — near-black, cool cast, not #000
  carbon:   '#121417',  // cards, sheets
  graphite: '#1E2126',  // borders, dividers, input fields, the unfilled tick
  signal:   '#C8FF00',  // THE fluorescent green. Hi-vis lime. Ink, not paint.
  ember:    '#FF5A3C',  // over-target and destructive only. Used maybe twice in the app.
  chalk:    '#F2F4F0',  // primary text
  ash:      '#8A9089',  // secondary text, labels
} as const;
```

### Type
- **Display / all numerals: Archivo, Expanded, 700–800.** Wide, athletic, scoreboard. Numbers are the hero of this app, so the numerals get the characterful face. Tabular figures on, always — a number must not shimmy when it counts up.
- **Body: Inter Tight.** Compact, quiet, excellent at small sizes on a phone.
- **Micro-labels: JetBrains Mono, uppercase, ~10px, +0.12em tracking.** `REMAINING` · `PROTEIN` · `CALIBRATED`. This is where the instrument-panel feeling lives.

Scale: 56 / 34 / 22 / 17 / 15 / 13 / 10. Respect Dynamic Type — the layout must survive the largest accessibility text size without clipping. Test it.

### The signature: the tick
**This is the one thing to get right.** The product is called Go and its mark is a tick. So the tick is not decoration sitting next to a progress ring — **the tick *is* the progress ring.** Delete the ring.

- Draw the checkmark as a single SVG path. Animate `strokeDashoffset` from 1 → 0 as `consumed ÷ target` goes 0 → 1.
- **0%:** a ghost tick in `graphite`. Present, unfilled, waiting. The empty state is the logo.
- **In progress:** the stroke draws in `signal`, in real time, as food is logged. Ease-out, ~450ms, spring-damped. The user *watches their day fill the mark.*
- **100%:** the stroke completes with a single crisp snap and one haptic tap. Once. It does not celebrate, it does not confetti. It's a click, like a torque wrench reaching spec.
- **Over target:** the stroke completes, shifts to `ember`, and the overshoot draws as a short tail *overrunning* the tick's terminal — the mark literally overshoots. Neutral, informational, unmistakable at a glance.
- The same path is the app icon, the splash, the loading indicator (drawing on a loop), and the success state. **One mark, everywhere.**

Consequence to accept: `signal` and `ember` are the only two colors carrying critical status, and they are green vs. red-orange — **the exact axis of the most common colorblindness.** So status is *never* encoded by color alone. The overshoot tail, the `+180 OVER` label, and the icon change carry the meaning independently. Verify with a deuteranopia simulation as an acceptance criterion.

### Motion
Purposeful only. The tick drawing. Number counting up (tabular figures, ~250ms). Sheet transitions. Nothing else moves. Honour `prefers-reduced-motion` / Reduce Motion: the tick jumps to its value instead of drawing, and the haptic still fires.

### Brand lockup
`RR21` sits in JetBrains Mono, uppercase, `ash`, wide tracking — small, corporate, quiet. `Go` sits in Archivo Expanded, `chalk`, with the tick as the trailing glyph in `signal`.

**System rule: RR21 is never rendered in `signal`.** The parent brand stays neutral; only the product's tick carries the green.

### Voice
Plain, active, no filler. Errors state what happened and what to do — they never apologize and never blame. Empty states are invitations. Sentence case everywhere except the mono micro-labels. The interface never uses the words "oops," "yay," "crushing it," "cheat," "guilty," "sinful," "earned," or "burned off."

---

## 7. Offline-first

- SQLite on device is the read source of truth. The UI never blocks on the network.
- Writes go to a durable local queue with a `client_id` idempotency key, then replay on reconnect. The `unique (user_id, client_id)` constraint makes double-submits harmless.
- A user's own food history and their top ~2,000 foods are mirrored locally, so **search works with the radio off.**
- Conflict rule: last-write-wins per entry, and entries are immutable once written (edit = delete + insert).
- Sync state is visible but never anxious: a small `ash` dot, not a red banner. It resolves itself.

---

## 8. The calibration engine — this is the product

**Trigger:** the user has ≥14 days of logging, ≥10 of those days with ≥80% of entries logged in-day (not backfilled from memory at midnight), and ≥6 weight entries spanning ≥14 days.

**Method:**

```
observed_TDEE  =  mean_daily_intake  +  ( Δweight_kg × 7700 ÷ days_elapsed )
```

Use the **7-day moving average** of weight at each endpoint, never raw dailies.

**Then say it out loud:**

> **Calibrated.**
> Your estimated maintenance was **2,850**. Over 21 days, your actual maintenance measured **2,930**.
> We've moved your target from 2,400 to 2,480.
> *Based on 21 days, 19 logged, 8 weigh-ins.*

Always show the confidence basis. Always show the old number next to the new one.

**Guardrails on the engine:**
- Fewer than 14 days, or logging adherence under 80%? Show progress toward calibration, not a number. *"9 more days of consistent logging and we can measure your real maintenance."*
- Result more than ±25% from the formula estimate? Don't apply it. Flag it.
- Never apply a calibration that would push the target below the floors in §9. The floors win. Always.
- Re-calibrate every 21 days.

---

## 9. Non-negotiable wellbeing guardrails

- Target kcal may **never** be set below **1,500 (male) / 1,200 (female)**, and never below the user's calculated BMR. Clamped server-side.
- Deficit is capped at **25% of TDEE, or 750 kcal, whichever is smaller.**
- Rate of loss is capped at **1% of bodyweight per week.**
- If a goal weight implies **BMI < 18.5**, we do not compute it, we do not chart it, and we do not offer it.
- **Age gate:** under-18s are blocked at signup. Compute from `birth_date`, server-side.

**Explicit product bans:**
- ❌ Streaks, streak-loss anxiety
- ❌ "Net calories"
- ❌ Public leaderboards, social feeds, before/after photos
- ❌ Any copy that moralizes food: no "cheat," "guilt-free," "sinful," "earned," "burned off"
- ❌ Fasting timers, "extreme cut" presets
- ❌ Photo-based calorie estimation

**Required:**
- ✅ A **"hide numbers"** mode: log food, see the tick fill, never see a calorie count.
- ✅ Over-target is stated, never scolded: `+180 OVER`.
- ✅ A quiet, findable link in Settings to eating-disorder support resources.
- ✅ "This is not medical advice" — stated once, clearly, at onboarding.
- ✅ Explicit consent at signup, data export, account deletion. No health data to any analytics provider.
- Store listing: **"RR21 Go — Calorie Tracker"** and in-app: **"Go✓"**.

---

## 10. Quality bar

- **Accessibility:** WCAG 2.2 AA. Interactive targets ≥44×44. VoiceOver/TalkBack announcements. Dynamic Type support. Reduce Motion support. Colorblind-safe.
- **Performance budgets:**
  - Cold start: **< 2.0s**
  - Search: **< 100ms**
  - Log repeat: **≤3 taps, ≤5 seconds, aeroplane mode**
- **Testing:**
  - Unit: BMR/TDEE, targets, guardrails (adversarial), calibration math.
  - Integration: cross-tenant read failure.
  - E2E: onboarding → log → tick fills → offline log → reconnect → syncs.
- TypeScript strict. Zod at boundaries. Secure secrets. Conventional commits, PR per milestone.
