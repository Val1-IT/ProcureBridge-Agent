export const INITIAL_DEMO_SESSION_ID = "demo_initial_browser_session_0001";

export function isValidDemoSessionId(value: unknown): value is string {
  return typeof value === "string" && /^demo_[A-Za-z0-9_-]{20,100}$/.test(value);
}

export function createDemoSessionId(): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `demo_${id.replaceAll("-", "_")}`;
}
