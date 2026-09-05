# @pothooks/core

Framework-agnostic runtime for replaying handwriting recorded by
[Pothooks](https://pothooks.com). No dependencies.

```bash
npm install @pothooks/core
```

```ts
import { render, play, type Payload } from '@pothooks/core';

const svg = render(payload);          // finished, fully drawn — safe to serialise
document.body.append(svg);

const playback = play(svg, { speed: 1, loop: 2000 });
```

## API

### `render(payload, opts?): SVGSVGElement`

Builds the SVG in its final, fully-drawn state.

### `renderToString(payload, opts?): string`

The same thing as markup, for a server. `renderMarkup()` returns
`{ attrs, inner }` if you need to compose the root `<svg>` yourself — that is
what `@pothooks/react` uses.

`RenderOptions`:

| Option | Meaning |
| --- | --- |
| `idPrefix` | Prefix for this instance's mask ids. Defaults to a generated one; pass a stable value when server and client markup must match. |
| `color` | CSS colour for the ink. The ink is always `currentColor`; this sets `color` on the `<svg>`. |
| `title` | Accessible name. Defaults to `payload.meta.text`; without either, the SVG is marked decorative. |

### `play(svg, opts?): Playback`

Drives an already-rendered SVG — including one that arrived as server-rendered
markup, since the timing rides along on the mask paths as `data-ph-*`
attributes.

One `requestAnimationFrame` loop for the whole piece, writing
`stroke-dashoffset` on each mask path. Not one animation per stroke: a
signature is 40+ strokes.

```ts
interface Playback {
  play(): void;
  pause(): void;
  restart(): void;
  seek(t: number): void;      // 0–1 across the whole piece
  setInView(v: boolean): void; // feeds the same pause gate as tab visibility
  readonly duration: number;   // ms, at the recorded cadence
  readonly playing: boolean;
  destroy(): void;             // leaves the ink drawn
}
```

`PlayOptions`: `speed`, `loop` (`true`, or ms to pause between loops),
`startDelay`, `autoplay` (default `true`), `onDone`, `reducedMotion`.

## Behaviour worth knowing

- **`prefers-reduced-motion: reduce`** renders finished and never animates or
  loops. Handled here, so every wrapper inherits it.
- **Hidden tabs pause**, via `visibilitychange`. Wrappers feed an
  `IntersectionObserver` into the same gate with `setInView()`.
- **Mask ids are unique per instance.** Two pieces on one page with colliding
  ids would be the first bug this library shipped.
- **Every mask states an explicit region** sized to the viewBox plus a stroke
  of margin. The default (`-10% -10% 120% 120%`) resolves against the viewport
  under `maskUnits="userSpaceOnUse"` and clips all the ink above the origin.
- **No global CSS.** Everything is inline on the SVG.

Using React? Reach for
[`@pothooks/react`](https://github.com/danbillson/pothooks/tree/main/packages/react)
instead — it wires all of the above up for you and renders correctly on a
server.
