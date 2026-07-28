/**
 * Minimální DOM helper. Záměrně nikde nepoužívá `innerHTML` — texty se
 * vždy nastavují přes `textContent`, takže uživatelský vstup (text
 * vzpomínky, název profilu…) nemůže být interpretován jako HTML/skript.
 */
type ElOptions = {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  onClick?: (e: MouseEvent) => void;
  title?: string;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title !== undefined) node.title = options.title;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      node.setAttribute(key, value);
    }
  }
  if (options.onClick) node.addEventListener("click", options.onClick as EventListener);
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mount(container: Element, ...children: Node[]): void {
  clear(container);
  for (const child of children) container.append(child);
}
