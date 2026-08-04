import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GET as getHealth } from "../app/api/health/route";
import {
  advanceJudgeDemo,
  createJudgeDemoSession,
  createPresentationFallbackSession,
  exitJudgeDemo,
  restartJudgeDemo,
} from "../lib/demo/judge-mode";
import { getSimulationInterval, type SimulationSpeed } from "../lib/demo/simulation";
import { buildDemoReport, renderDemoReportMarkdown } from "../lib/demo/report";
import { createSeedState } from "../lib/demo/seed";
import { CalleProvider, getCallProvider } from "../lib/calle/client";
import { MockCallProvider } from "../lib/calle/mock-provider";

describe("Judge Demo Mode", () => {
  it("starts on step one with the recommended fast simulation", () => {
    const session = createJudgeDemoSession("persisted-normal-store");
    expect(session).toMatchObject({ active: true, step: 1, speed: "fast_demo" });
    expect(session.normalStoreSnapshot).toBe("persisted-normal-store");
  });

  it("advances through seven bounded steps and exits without losing the normal snapshot", () => {
    let session = createJudgeDemoSession("normal-state");
    for (let index = 0; index < 10; index += 1) session = advanceJudgeDemo(session);
    expect(session.step).toBe(7);
    const exited = exitJudgeDemo(session);
    expect(exited.active).toBe(false);
    expect(exited.restoreSnapshot).toBe("normal-state");
  });

  it("restarts at step one while preserving the original normal-store snapshot", () => {
    const advanced = advanceJudgeDemo(createJudgeDemoSession("normal-state"));
    expect(restartJudgeDemo(advanced)).toMatchObject({ active: true, step: 1, normalStoreSnapshot: "normal-state" });
  });

  it("starts presentation fallback on the main scenario with an instant deterministic result", () => {
    const session = createPresentationFallbackSession("normal-state");
    expect(session).toMatchObject({
      active: true,
      step: 1,
      speed: "instant",
      presentationFallback: true,
      normalStoreSnapshot: "normal-state",
    });

    expect(restartJudgeDemo(advanceJudgeDemo(session))).toMatchObject({
      step: 1,
      speed: "instant",
      presentationFallback: true,
      normalStoreSnapshot: "normal-state",
    });
  });
});

describe("simulation speeds", () => {
  it.each<[SimulationSpeed, number]>([
    ["real_time", 5_000],
    ["fast_demo", 2_000],
    ["instant", 0],
  ])("maps %s to a deterministic interval", (speed, expected) => {
    expect(getSimulationInterval(speed)).toBe(expected);
  });
});

describe("health endpoint", () => {
  it("returns safe demo runtime information", async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      app: "Arvanta ProcureBridge Recovery Agent",
      mode: "demo",
      callProvider: "mock",
    });
  });
});

describe("CALL-E demo fallback", () => {
  it("uses mock when credentials are absent or the operator explicitly switches to demo", () => {
    expect(getCallProvider({})).toBeInstanceOf(MockCallProvider);
    expect(getCallProvider({ CALLE_API_URL: "https://api.example", CALLE_API_KEY: "key", CALLE_AGENT_ID: "agent" }, { forceMock: true })).toBeInstanceOf(MockCallProvider);
  });

  it("does not expose a failed live provider response body", async () => {
    const provider = new CalleProvider({ CALLE_API_URL: "https://api.example", CALLE_API_KEY: "secret", CALLE_AGENT_ID: "agent" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("internal provider detail", { status: 503 });
    try {
      await expect(provider.createCall({ callId: "call-1", customerId: "cust-1", invoiceId: "inv-1", phone: "+620000", language: "id", scenario: "promise_to_pay", disclosure: "AI" })).rejects.toThrow("status 503");
      await expect(provider.createCall({ callId: "call-1", customerId: "cust-1", invoiceId: "inv-1", phone: "+620000", language: "id", scenario: "promise_to_pay", disclosure: "AI" })).rejects.not.toThrow("internal provider detail");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("downloadable demo evidence", () => {
  it("includes the decision trail but masks phone and email", () => {
    const state = createSeedState();
    state.approvals.push({ callId: "call-sinar", objective: "Confirm payment", minimumPayment: 5_000_000, extensionAllowed: true, maximumFollowUpDate: "2026-08-14", language: "Bahasa Indonesia", callTime: "10:00", aiDisclosureApproved: true, dataConfirmed: true, approvedBy: "Nadia Pratama", approvedAt: "2026-08-04T03:00:00.000Z" });
    state.calls.push({ id: "call-sinar", customerId: "cust-sinar", invoiceId: "inv-sinar", provider: "mock", providerCallId: "mock-call-sinar", status: "result_pending_review", startedAt: "2026-08-04T03:00:00.000Z", endedAt: "2026-08-04T03:00:42.000Z", durationSeconds: 42, outcome: "promise_to_pay", sentiment: "cooperative", recordingUrl: null, transcript: [], aiSummary: "Customer promised a partial payment.", humanApprovedBy: "Nadia Pratama", humanApprovedAt: "2026-08-04T03:00:00.000Z", scenario: "promise_to_pay" });
    const report = buildDemoReport(state, "call-sinar");
    const markdown = renderDemoReportMarkdown(report);
    expect(markdown).toContain("Demo Data");
    expect(markdown).toContain("PT Sinar Jaya Retail");
    expect(markdown).toContain("INV-2026-0812");
    expect(markdown).not.toContain("+62 812 4433 1098");
    expect(markdown).not.toContain("budi@sinarjaya.demo");
    expect(report.customer.phone).toMatch(/MASKED/);
  });
});

describe("judge-facing routes and documentation hygiene", () => {
  it.each([
    ["architecture", "app/architecture/page.tsx", "Implemented"],
    ["technical notes", "app/technical-notes/page.tsx", "What is real"],
  ])("ships the %s route", (_name, path, marker) => {
    expect(readFileSync(path, "utf8")).toContain(marker);
  });

  it("keeps metadata and canonical configuration free of localhost", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(layout).toContain("canonical");
  });

  it("contains no local Windows path in judge documentation", () => {
    const documents = ["README.md", "docs/submission.md", "docs/demo-script.md", "docs/architecture.md", "docs/security.md"];
    for (const document of documents) expect(readFileSync(document, "utf8")).not.toMatch(/[A-Z]:[\\/]Users[\\/]/i);
  });

  it("ships a secret-free main-branch CI quality gate", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("contents: read");
    for (const command of ["npm ci", "npm run typecheck", "npm run lint", "npm run test", "npm run build"]) expect(workflow).toContain(command);
    expect(workflow).not.toMatch(/secrets\.|deploy/i);
  });

  it("documents coverage and explicit production gaps", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("npm run test:coverage");
    expect(readme).toContain("## 15. Production gaps");
  });
});
