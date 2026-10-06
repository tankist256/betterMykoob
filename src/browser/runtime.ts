export interface BrowserRuntime {
  navigate(url: string): void;
  reload(): void;
}

export const runtime: BrowserRuntime = {
  navigate(url) { window.location.assign(url); },
  reload() { window.location.reload(); },
};
