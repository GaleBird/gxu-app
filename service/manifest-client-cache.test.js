const assert = require("node:assert");
const { after, test } = require("node:test");
const { fetchManifest } = require("./manifest-client");
const config = require("./config");

const originalFetch = globalThis.fetch;
const originalTtl = config.manifestCacheTtlMs;

function mockFetch(handler) {
  globalThis.fetch = async () => handler();
}

after(() => {
  globalThis.fetch = originalFetch;
  config.manifestCacheTtlMs = originalTtl;
});

// The module keeps one cache slot; tests below run in sequence and rely on
// the state left by the previous steps to exercise the cache paths.
const manifestA = {
  tag_name: "v1.0.7+51",
  assets: [],
};
const manifestB = {
  tag_name: "v1.0.8+52",
  assets: [],
};

test("fetchManifest rejects when upstream fails and nothing is cached", async () => {
  config.manifestCacheTtlMs = 60000;
  mockFetch(() => Promise.reject(new Error("upstream down")));
  await assert.rejects(() => fetchManifest(), /upstream down/);
});

test("fetchManifest caches a successful fetch", async () => {
  let calls = 0;
  mockFetch(() => {
    calls += 1;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifestA),
    });
  });
  const first = await fetchManifest();
  assert.equal(first.manifest.tag_name, "v1.0.7+51");
  const second = await fetchManifest();
  assert.equal(calls, 1);
  assert.equal(second.manifest.tag_name, "v1.0.7+51");
});

test("fetchManifest serves the cached manifest when upstream fails", async () => {
  mockFetch(() => Promise.reject(new Error("upstream down")));
  const result = await fetchManifest();
  assert.equal(result.manifest.tag_name, "v1.0.7+51");
});

test("fetchManifest refreshes after the cache TTL expires", async () => {
  config.manifestCacheTtlMs = 0;
  mockFetch(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifestB),
    }),
  );
  const result = await fetchManifest();
  assert.equal(result.manifest.tag_name, "v1.0.8+52");
});
