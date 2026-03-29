const assert = require("node:assert/strict");
const { createSign, generateKeyPairSync } = require("node:crypto");
const test = require("node:test");

const {
  assertAllowedRemoteUrl,
  assertManifestSignature,
  canonicalizeUnsignedManifest,
} = require("./manifest-security");

test("assertAllowedRemoteUrl accepts configured https hosts", () => {
  const allowedUrl = assertAllowedRemoteUrl(
    "https://myapk.sgp1.cdn.digitaloceanspaces.com/releases/app.apk",
    ["myapk.sgp1.cdn.digitaloceanspaces.com"],
    "download asset arm64-v8a",
  );
  assert.equal(
    allowedUrl,
    "https://myapk.sgp1.cdn.digitaloceanspaces.com/releases/app.apk",
  );
});

test("assertAllowedRemoteUrl rejects non-https and unexpected hosts", () => {
  assert.throws(
    () =>
      assertAllowedRemoteUrl(
        "http://myapk.sgp1.cdn.digitaloceanspaces.com/releases/app.apk",
        ["myapk.sgp1.cdn.digitaloceanspaces.com"],
        "download asset arm64-v8a",
      ),
    /must use https/,
  );
  assert.throws(
    () =>
      assertAllowedRemoteUrl(
        "https://evil.example/releases/app.apk",
        ["myapk.sgp1.cdn.digitaloceanspaces.com"],
        "download asset arm64-v8a",
      ),
    /host is not allowed/,
  );
});

test("assertManifestSignature verifies signed manifests", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const manifest = {
    tag_name: "v1.0.2+45",
    html_url: "https://github.com/example/repo/releases/tag/v1.0.2%2B45",
    body: "Release notes",
    assets: [
      {
        name: "app-arm64-v8a-release.apk",
        browser_download_url:
          "https://myapk.sgp1.cdn.digitaloceanspaces.com/releases/v1.0.2+45/app-arm64-v8a-release.apk",
      },
    ],
  };
  const signer = createSign("RSA-SHA256");
  signer.update(canonicalizeUnsignedManifest(manifest));
  signer.end();
  manifest.signature = {
    algorithm: "RSA-SHA256",
    key_id: "test-key",
    value: signer.sign(privateKey).toString("base64"),
  };

  assert.doesNotThrow(() =>
    assertManifestSignature(manifest, {
      requireManifestSignature: true,
      manifestSignatureKeyId: "test-key",
      manifestPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    }),
  );
});

test("assertManifestSignature fails loudly when required config is missing", () => {
  assert.throws(
    () =>
      assertManifestSignature(
        { tag_name: "v1.0.2+45" },
        {
          requireManifestSignature: true,
          manifestSignatureKeyId: "test-key",
          manifestPublicKeyPem: "",
        },
      ),
    /MANIFEST_PUBLIC_KEY_PEM is not configured/,
  );
});

test("verifyManifestSignature returns disabled status when no public key configured", () => {
  const status = assertManifestSignature(
    { tag_name: "v1.0.2+45" },
    {
      requireManifestSignature: false,
      manifestSignatureKeyId: "test-key",
      manifestPublicKeyPem: "",
    },
  );
  assert.equal(status, undefined);
});

test("assertManifestSignature throws when enabled but not verified", () => {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(
    () =>
      assertManifestSignature(
        { tag_name: "v1.0.2+45" },
        {
          requireManifestSignature: false,
          manifestSignatureKeyId: "test-key",
          manifestPublicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
        },
      ),
  );
});

test("canonicalizeSignedJson rejects excessively deep objects", () => {
  let value = { leaf: true };
  for (let i = 0; i < 100; i += 1) {
    value = { next: value };
  }
  assert.throws(() => canonicalizeUnsignedManifest(value), /max depth/);
});

test("canonicalizeSignedJson rejects undefined values explicitly", () => {
  assert.throws(
    () => canonicalizeUnsignedManifest({ value: undefined }),
    /encountered unsupported value/,
  );
});
