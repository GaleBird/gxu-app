const assert = require("node:assert");
const { after, test } = require("node:test");
const { fetchManifest } = require("./manifest-client");
const config = require("./config");

const originalFetch = globalThis.fetch;
const originalTtl = config.manifestCacheTtlMs;

function mockFetch(handler) {
  globalThis.fetch = async () => handler();
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
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

test("fetchManifest serves the cached manifest when the upstream fails", async () => {
  config.manifestCacheTtlMs = 0; // force the stale path
  mockFetch(() => Promise.reject(new Error("upstream down")));
  const result = await fetchManifest();
  assert.equal(result.manifest.tag_name, "v1.0.7+51");
  await tick(); // let the background refresh fail
  const again = await fetchManifest();
  assert.equal(again.manifest.tag_name, "v1.0.7+51");
});

test("fetchManifest serves stale data immediately and refreshes in the background", async () => {
  config.manifestCacheTtlMs = 0;
  let calls = 0;
  mockFetch(() => {
    calls += 1;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifestB),
    });
  });
  const stale = await fetchManifest();
  assert.equal(stale.manifest.tag_name, "v1.0.7+51");
  await tick(); // let the background refresh land
  assert.equal(calls, 1);
  const refreshed = await fetchManifest();
  assert.equal(refreshed.manifest.tag_name, "v1.0.8+52");
});

test("concurrent stale callers share one background refresh", async () => {
  config.manifestCacheTtlMs = 0;
  let calls = 0;
  mockFetch(() => {
    calls += 1;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(manifestA),
    });
  });
  const results = await Promise.all([
    fetchManifest(),
    fetchManifest(),
    fetchManifest(),
  ]);
  assert.ok(results.every((item) => item.manifest.tag_name === "v1.0.8+52"));
  assert.equal(calls, 1);
});

test("stale responses stay instant even when the upstream hangs", async () => {
  config.manifestCacheTtlMs = 0;
  mockFetch(() => new Promise(() => {})); // never settles
  const started = Date.now();
  const result = await fetchManifest();
  assert.ok(Date.now() - started < 100);
  assert.equal(result.manifest.tag_name, "v1.0.7+51");
});
