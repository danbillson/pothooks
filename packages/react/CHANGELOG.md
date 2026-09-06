# @pothooks/react

## 0.1.1

### Patch Changes

- fd7ddfb: Fix App Router and JSON payload imports
  
  - `@pothooks/react` now emits `"use client"` at the top of the bundle. Without
    it, importing `Handwriting` into a server component threw `useRef only works
    in Client Components`. The finished SVG still renders on the server.
  - `Payload["v"]` widens from the literal `1` to `number`, so
    `import payload from './signature.json'` typechecks without a cast. The
    runtime version guard in `renderMarkup` is unchanged and still rejects
    anything other than 1.
  - Document that `title` falls back to `payload.meta.text`, which is optional
    and not guaranteed to read as an accessible name.
- Updated dependencies [fd7ddfb]
  - @pothooks/core@0.1.2

## 0.1.0

### Minor Changes

- 2420f3b: First usable release.
  
  `@pothooks/core` renders a payload to a finished SVG — in the DOM, as a string,
  or as attributes plus markup for a framework to mount — and drives it from a
  single requestAnimationFrame loop, honouring the recorded per-stroke cadence.
  `prefers-reduced-motion`, hidden tabs and off-screen pieces are handled in core,
  so every wrapper inherits them.
  
  `@pothooks/react` adds `<Handwriting>`: server-rendered fully drawn, animated
  after hydration, with `mount` / `visible` / `hover` / `manual` triggers and a
  stable `Playback` ref.

### Patch Changes

- Updated dependencies [2420f3b]
  - @pothooks/core@0.1.0
