# pothooks

Replay handwriting on the web. Given a payload exported by
[Pothooks](https://pothooks.com), draw the text as if a hand were writing it —
in the real stroke order, at the real recorded cadence.

Pothooks records handwriting as **centrelines**: the actual path of the pen,
with per-sample pressure and inter-sample milliseconds. This is not "animate a
font" — a font binary cannot carry that data. It is "replay a recording".

**Nothing in these packages computes geometry.** Pothooks precomputes every
path and every timing; the runtime interpolates numbers and sets attributes.
No curve fitting, no `getTotalLength()`, no measurement — which is what keeps
the bundle tiny and the render identical on a server and in a browser.

## Packages

| Package | What it is |
| --- | --- |
| [`@pothooks/core`](packages/core) | Framework-agnostic renderer and playback. No dependencies. |
| [`@pothooks/react`](packages/react) | `<Handwriting>`, SSR-correct. |

`@pothooks/vue` and a `<script>`-tag build come next.

## Quick look

```bash
git clone https://github.com/danbillson/pothooks.git
cd pothooks
pnpm install
pnpm run build
pnpm --filter @pothooks/playground dev
```

## How the reveal works

Each stroke ships as a filled outline (`o`) plus the pen's centreline (`c`).
The centreline is never drawn — it strokes a mask, wide enough to cover the
outline, with `pathLength="1"` and `stroke-dasharray="1 1"`. Animating
`stroke-dashoffset` from `1` to `0` wipes that mask along the pen path, so the
real outline, with its real pressure taper, is uncovered in the order it was
written.

Three rules follow from that, and all of them are load-bearing:

- **One mask per stroke.** A single wide mask leaks sideways at tight curves
  and uncovers a neighbouring stroke early.
- **The served state is the drawn state.** Markup ships fully inked; animation
  *removes* the ink and then restores it. Backwards, and every no-JS,
  reduced-motion or unsupported context shows a blank box.
- **Every mask states its region.** A `<mask>` with no `x`/`y`/`width`/`height`
  defaults to `-10% -10% 120% 120%`, and under `maskUnits="userSpaceOnUse"`
  those resolve against the *viewport*, not the masked shape. Ink sits at
  negative y, so the default region clips everything above the origin and
  leaves only the strokes nearest the baseline — which looks like a mask that
  is too narrow and is nothing of the sort.

Known limitation: a stroke that loops tightly back over itself (a cursive `l`)
can uncover a few pixels of its own far side early, because the mask is as wide
as the brush. Acceptable at speed.

## The payload

`Payload` is the contract between Pothooks and this runtime —
[`types.ts`](packages/core/src/types.ts) has the full shape, and it is short.
The `v` field is the version guard: the runtime refuses a payload it does not
understand rather than rendering it wrong.

[`fixtures/signature.json`](fixtures/signature.json) is a real exported payload.
The test suite renders it and asserts the SVG structure, so it doubles as the
reference for anyone generating payloads by hand.

## Repo

```
packages/core        the runtime
packages/react       the React wrapper
examples/playground  vite, not published
fixtures             the shared payload fixture
```

pnpm workspaces, Turborepo, Changesets, Vitest + happy-dom.

```bash
pnpm run build      # tsdown, per package
pnpm run test       # vitest + happy-dom
pnpm run typecheck
pnpm run lint       # oxlint
```

Releases go out from
[`.github/workflows/release.yml`](.github/workflows/release.yml) on a merge to
`main`: Changesets opens the version PR, and publishing uses npm trusted
publishing (OIDC), so there is no long-lived token in secrets and provenance
comes for free. Add a changeset with `pnpm changeset` in any PR that should
ship.

## Licence

MIT
