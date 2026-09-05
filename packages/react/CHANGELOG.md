# @pothooks/react

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
