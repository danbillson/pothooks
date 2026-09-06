---
'@pothooks/core': patch
'@pothooks/react': patch
---

Fix App Router and JSON payload imports

- `@pothooks/react` now emits `"use client"` at the top of the bundle. Without
  it, importing `Handwriting` into a server component threw `useRef only works
  in Client Components`. The finished SVG still renders on the server.
- `Payload["v"]` widens from the literal `1` to `number`, so
  `import payload from './signature.json'` typechecks without a cast. The
  runtime version guard in `renderMarkup` is unchanged and still rejects
  anything other than 1.
- Document that `title` falls back to `payload.meta.text`, which is optional
  and not guaranteed to read as an accessible name.
