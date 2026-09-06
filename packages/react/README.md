# @pothooks/react

React component for replaying handwriting recorded by
[Pothooks](https://pothooks.com). Wraps
[`@pothooks/core`](https://github.com/danbillson/pothooks/tree/main/packages/core).

```bash
npm install @pothooks/react
```

```tsx
import { Handwriting } from '@pothooks/react';

<Handwriting payload={payload} trigger="visible" speed={1} loop color="#111" />
```

Renders the finished SVG on the server, then animates after hydration — never a
blank first paint, and never a blank box under `prefers-reduced-motion`.

## Props

| Prop | Default | Meaning |
| --- | --- | --- |
| `payload` | — | The exported Pothooks payload. |
| `trigger` | `"visible"` | `"mount"`, `"visible"`, `"hover"` or `"manual"`. |
| `speed` | `1` | `1` is the recorded cadence. |
| `loop` | `false` | `true`, or ms to pause between loops. |
| `startDelay` | `0` | Ms before the first stroke. |
| `color` | inherits | Ink colour. The ink is `currentColor`, so this just sets `color`. |
| `title` | `payload.meta.text` | Accessible name. Without either, the SVG is decorative. Pass it explicitly unless you trust the payload's `meta.text` to be the words as written. |
| `reducedMotion` | `"respect"` | `"ignore"` only if the motion *is* the content. |
| `onDone` | — | Fires each time the piece finishes, including on every loop. |

Any other SVG prop (`className`, `style`, `width`, …) passes through to the
root `<svg>`.

`trigger="visible"` uses an `IntersectionObserver`; it starts playback the first
time the piece is on screen and then keeps feeding the pause gate, so scrolling
away stops the loop rather than leaving it burning frames.

## Manual control

```tsx
const playback = useRef<Playback>(null);

<Handwriting ref={playback} payload={payload} trigger="manual" />
<button onClick={() => playback.current?.restart()}>Replay</button>
```

The ref is a stable [`Playback`][playback] facade — it keeps working when a
prop change rebuilds the underlying loop.

[playback]: https://github.com/danbillson/pothooks/tree/main/packages/core#playsvg-opts-playback

`react` is a peer dependency (>=18).
