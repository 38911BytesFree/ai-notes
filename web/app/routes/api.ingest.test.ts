// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/services/notes-api.server", () => ({
  ingest: vi.fn(async () => ({ ok: true, data: { id: "n1" } })),
}));
vi.mock("~/services/ratelimit.server", () => ({ rateLimit: () => true }));

import { action } from "./api.ingest";
import * as notesApi from "~/services/notes-api.server";

function post(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request("http://localhost/api/ingest", { method: "POST", body: fd });
}

async function call(fields: Record<string, string>) {
  await action({ request: post(fields), params: {}, context: {} } as any);
  return vi.mocked(notesApi.ingest).mock.calls[0][1];
}

describe("api.ingest action keep_transcript", () => {
  beforeEach(() => vi.mocked(notesApi.ingest).mockClear());

  it("passes keep_transcript=false when the user unchecks the box", async () => {
    expect(await call({ input: "hello world", keep_transcript: "false" })).toMatchObject({ keep_transcript: false });
  });

  it("passes keep_transcript=true when checked", async () => {
    expect(await call({ input: "hello world", keep_transcript: "true" })).toMatchObject({ keep_transcript: true });
  });

  it("omits keep_transcript when absent so the API applies the stored default", async () => {
    expect(await call({ input: "hello world" })).not.toHaveProperty("keep_transcript");
  });
});
