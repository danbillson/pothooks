/**
 * The payload is the contract between the Pothooks app (which records
 * handwriting and exports) and this runtime (which replays it).
 *
 * This type is duplicated in the Pothooks repo on purpose — see project.md §7.
 * `fixtures/signature.json` is checked into both repos byte-identical and is
 * what actually keeps them honest.
 */
export interface Payload {
  /** Format version. Bump on any breaking change. Only 1 renders; the
   *  runtime rejects anything else, so this stays wide enough to accept a
   *  plain `import payload from "./signature.json"`. */
  v: number;
  /** SVG viewBox for the whole piece of text, e.g. "0 -120 1840 320". */
  viewBox: string;
  /** Strokes in the order the hand drew them. */
  strokes: Stroke[];
  /** Optional. Not required to render. `text` doubles as the default
   *  accessible name, so write what was actually written, not a label. */
  meta?: { text?: string; family?: string };
}

export interface Stroke {
  /** Closed outline of this stroke, as an SVG path `d`. Already in viewBox
   *  space (y-down). Filled — this is the visible ink. */
  o: string;
  /** Open centreline of the same stroke, as an SVG path `d`, same space.
   *  Never rendered; it drives the reveal mask. */
  c: string;
  /** Mask stroke-width, in viewBox units. Wide enough to cover `o` entirely. */
  w: number;
  /**
   * Milliseconds to wait after the previous stroke finished.
   *
   * Zero is meaningful and must not be given a floor: it marks the first
   * stroke of a piece, and a piece that continues the previous one with the
   * hand never leaving the paper. The exporter cuts a stroke wherever it
   * crosses or nears its own earlier path — otherwise the reveal of one part
   * uncovers ink belonging to another — and the parts come across as
   * consecutive strokes with no pen-up between them. A real pen-up is never
   * recorded as zero.
   */
  delay: number;
  /** Milliseconds this stroke takes to draw. */
  dur: number;
  /** Optional intra-stroke cadence. Parallel arrays, both normalised 0–1,
   *  both starting at 0 and ending at 1, same length, `k` non-decreasing.
   *  `k` is time, `p` is fraction of the centreline revealed. */
  k?: number[];
  p?: number[];
  /** Ordinal of the glyph this stroke belongs to. */
  g?: number;
}
