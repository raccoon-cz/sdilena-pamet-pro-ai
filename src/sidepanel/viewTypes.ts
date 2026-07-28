import type { AppStore } from "./store";

export type ViewName = "overview" | "memories" | "profiles" | "providers" | "settings";

export interface ViewContext {
  store: AppStore;
  refresh: () => Promise<void>;
  navigate: (view: ViewName, intent?: string) => void;
  consumeIntent: () => string | undefined;
}

export type ViewRenderer = (root: HTMLElement, ctx: ViewContext) => void;
