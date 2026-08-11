import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErpCommandProvider, useErpCommands } from "../components/erp-command-provider";
import { createErpSeedState } from "../lib/erp/seed";

describe("ERP command provider public surface", () => {
  it("exposes closed named intents instead of an arbitrary command callback", () => {
    let exposed: ReturnType<typeof useErpCommands> | null = null;
    const initial = createErpSeedState();

    function Probe() {
      exposed = useErpCommands();
      return createElement("span", null, "ready");
    }

    renderToStaticMarkup(createElement(
      ErpCommandProvider,
      { getLatestErp: () => initial, commitErp: async () => ({ ok: true as const }) },
      createElement(Probe),
    ));

    expect(exposed).not.toBeNull();
    expect(Object.keys(exposed!)).toContain("createPurchaseRequest");
    expect(Object.keys(exposed!)).toContain("recordPayment");
    expect(Object.keys(exposed!)).not.toContain("run");
  });

  it("does not report command success until asynchronous CAS succeeds", async () => {
    let exposed: ReturnType<typeof useErpCommands> | null = null;
    const initial = createErpSeedState();
    let release!: (value: { ok: false; reason: "LOCK_UNAVAILABLE"; state: typeof initial }) => void;
    const commit = new Promise<{ ok: false; reason: "LOCK_UNAVAILABLE"; state: typeof initial }>((resolve) => { release = resolve; });

    function Probe() {
      exposed = useErpCommands();
      return createElement("span", null, "ready");
    }

    renderToStaticMarkup(createElement(
      ErpCommandProvider,
      { getLatestErp: () => initial, commitErp: () => commit },
      createElement(Probe),
    ));

    const pending = exposed!.setActiveRole("warehouse", "2026-08-10T00:00:00.000Z");
    expect(pending).toBeInstanceOf(Promise);
    let settled = false;
    void Promise.resolve(pending).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    release({ ok: false, reason: "LOCK_UNAVAILABLE", state: initial });
    const result = await pending;
    expect(result).toMatchObject({
      ok: false,
      state: initial,
      error: { code: "LOCK_UNAVAILABLE" },
    });
  });
});
