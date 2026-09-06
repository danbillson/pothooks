---
'@pothooks/core': patch
---

Size each mask to its own stroke, and park the hidden dash clear of the path.

A `<mask>` is an offscreen surface the renderer allocates and composites, and
its region says how big. Every mask was sized to the whole viewBox, so a piece
with two hundred strokes asked for two hundred full-canvas buffers and
playback fell to a few frames a second — measured in Chromium, a 240-stroke
piece ran at 433ms a frame. Each region is now the bounding box of the one
stroke it uncovers, read from the ink's own path data, so nothing measures the
DOM and a server render is unchanged. The same piece now holds a flat 16.7ms.

The dash pattern moves from `1 1` to `2 3`, with the offset running `2` → `1`
and parking at `3` while a stroke waits. With a dash exactly one path long, the
hidden state puts a boundary precisely on each end of the path, and the mask
has round caps — so a renderer that emits the zero-length dash it finds there
paints a disc where the pen has not yet arrived. `DASH` is exported for anyone
driving the markup themselves.
