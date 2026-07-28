/** Bezpečné lokální ID. Nativní `crypto.randomUUID()` je dostupné ve všech
 * kontextech rozšíření (service worker, content script, extension page),
 * takže nepotřebujeme žádnou externí knihovnu. */
export function createId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
