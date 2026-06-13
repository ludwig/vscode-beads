// src/backend/__tests__/doltMode.test.ts
import { backendKindForMode, detectDoltMode, DoltModeProbe } from "../doltMode";

function probe(over: Partial<DoltModeProbe>): DoltModeProbe {
  return {
    readMetadata: over.readMetadata ?? (async () => null),
    doltShow: over.doltShow ?? (async () => ""),
  };
}

describe("detectDoltMode", () => {
  it("returns server when metadata.json dolt_mode is server", async () => {
    const mode = await detectDoltMode(probe({ readMetadata: async () => JSON.stringify({ dolt_mode: "server" }) }));
    expect(mode).toBe("server");
  });

  it("returns embedded when metadata.json dolt_mode is embedded", async () => {
    const mode = await detectDoltMode(probe({ readMetadata: async () => JSON.stringify({ dolt_mode: "embedded" }) }));
    expect(mode).toBe("embedded");
  });

  it("falls back to bd dolt show when metadata lacks dolt_mode", async () => {
    const mode = await detectDoltMode(
      probe({
        readMetadata: async () => JSON.stringify({ backend: "dolt" }),
        doltShow: async () => "  Mode:     server\n",
      })
    );
    expect(mode).toBe("server");
  });

  it("falls back to bd dolt show when metadata JSON is malformed", async () => {
    const mode = await detectDoltMode(
      probe({
        readMetadata: async () => "{not json",
        doltShow: async () => "  Mode:     embedded (in-process Dolt engine)\n",
      })
    );
    expect(mode).toBe("embedded");
  });

  it("detects server from a running-server line in bd dolt show", async () => {
    const mode = await detectDoltMode(probe({ doltShow: async () => "Dolt server: running\n  Port: 61597\n" }));
    expect(mode).toBe("server");
  });

  it("defaults to embedded (CLI-safe) when nothing is determinable", async () => {
    const mode = await detectDoltMode(
      probe({
        readMetadata: async () => null,
        doltShow: async () => {
          throw new Error("bd not found");
        },
      })
    );
    expect(mode).toBe("embedded");
  });
});

describe("backendKindForMode", () => {
  it("maps server to sql and embedded to cli", () => {
    expect(backendKindForMode("server")).toBe("sql");
    expect(backendKindForMode("embedded")).toBe("cli");
  });
});
