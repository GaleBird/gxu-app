const assert = require("node:assert/strict");
const test = require("node:test");

const { shouldCountDownload, shouldTrackDownload } = require("./server");

test("shouldTrackDownload excludes github routes and targets", () => {
  assert.equal(shouldTrackDownload("github", "github"), false);
  assert.equal(shouldTrackDownload("github", "arm64-v8a"), false);
  assert.equal(shouldTrackDownload("android", "github"), false);
});

test("shouldCountDownload respects request counting flag", () => {
  assert.equal(shouldCountDownload("android", "arm64-v8a", true), true);
  assert.equal(shouldCountDownload("android", "arm64-v8a", false), false);
  assert.equal(shouldCountDownload("github", "github", true), false);
});
