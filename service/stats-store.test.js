const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { StatsStore } = require("./stats-store");

async function createTempStatsFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gxuapp-stats-"));
  return path.join(dir, "download-counts.json");
}

test("StatsStore.increment aggregates site + app totals", async () => {
  const filePath = await createTempStatsFile();
  const store = new StatsStore(filePath);

  const afterSite = await store.increment("download/arm64", "asset-1", "site");
  assert.equal(afterSite.siteDownloads, 1);
  assert.equal(afterSite.appDownloads, 0);
  assert.equal(afterSite.totalDownloads, 1);

  const afterApp = await store.increment("download/arm64", "asset-1", "app");
  assert.equal(afterApp.siteDownloads, 1);
  assert.equal(afterApp.appDownloads, 1);
  assert.equal(afterApp.totalDownloads, 2);
});

test("StatsStore.increment rejects unknown sources", async () => {
  const filePath = await createTempStatsFile();
  const store = new StatsStore(filePath);

  await assert.rejects(
    () => store.increment("download/arm64", "asset-1", "typo"),
    /unknown download source/,
  );
});

