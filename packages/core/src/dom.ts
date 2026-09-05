export const SVG_NS = 'http://www.w3.org/2000/svg';

export interface El {
  name: string;
  attrs: Record<string, string>;
  children?: El[];
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

export function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ESCAPES[c]!);
}

export function serialize(el: El): string {
  const attrs = Object.entries(el.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');
  if (!el.children?.length) return `<${el.name}${attrs}/>`;
  return `<${el.name}${attrs}>${el.children.map(serialize).join('')}</${el.name}>`;
}

export function toDom(el: El): SVGElement {
  const node = document.createElementNS(SVG_NS, el.name) as SVGElement;
  for (const [k, v] of Object.entries(el.attrs)) node.setAttribute(k, v);
  for (const child of el.children ?? []) node.appendChild(toDom(child));
  return node;
}

let counter = 0;

/** Per-instance id prefix. Colliding mask ids across two components on one
 *  page is the first bug this library could ship. */
export function uid(): string {
  return `ph${(counter++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Ids end up inside `url(#…)`; keep them to a safe alphabet. React's
 *  `useId()` in particular hands back `:r0:`. */
export function safeId(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_-]/g, '');
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `ph${cleaned}`;
}
