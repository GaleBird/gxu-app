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

test("StatsStore recovers from a corrupt file using the backup", async () => {
  const filePath = await createTempStatsFile();
  const store = new StatsStore(filePath);

  const first = await store.increment("download/arm64", "asset-1", "site");
  await fs.writeFile(filePath, "{ truncated", "utf8");

  const second = await store.increment("download/arm64", "asset-1", "site");
  assert.equal(second.siteDownloads, 2);
  assert.equal(second.totalDownloads, first.totalDownloads + 1);

  const healed = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(healed.siteDownloads, 2);
});

test("StatsStore starts fresh when the file is corrupt and no backup exists", async () => {
  const filePath = await createTempStatsFile();
  await fs.writeFile(filePath, "not json", "utf8");
  const store = new StatsStore(filePath);

  const after = await store.increment("download/arm64", "asset-1", "app");
  assert.equal(after.appDownloads, 1);
  assert.equal(after.totalDownloads, 1);

  const healed = JSON.parse(await fs.readFile(filePath, "utf8"));
  assert.equal(healed.appDownloads, 1);
});
