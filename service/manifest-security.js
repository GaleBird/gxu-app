const { createVerify } = require("node:crypto");

const HTTPS_PROTOCOL = "https:";
const SIGNATURE_ALGORITHM = "RSA-SHA256";
const MISSING_PUBLIC_KEY_MESSAGE = "MANIFEST_PUBLIC_KEY_PEM is not configured";
const DEFAULT_MAX_CANONICALIZE_DEPTH = 32;
const DEFAULT_MAX_CANONICALIZE_NODES = 50_000;
const DEFAULT_MAX_CANONICALIZE_BYTES = 2_000_000;

function parseOptionalLimit(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function canonicalizeLimitsFromEnv() {
  return {
    maxDepth: parseOptionalLimit(
      process.env.MANIFEST_CANONICALIZE_MAX_DEPTH,
      DEFAULT_MAX_CANONICALIZE_DEPTH,
    ),
    maxNodes: parseOptionalLimit(
      process.env.MANIFEST_CANONICALIZE_MAX_NODES,
      DEFAULT_MAX_CANONICALIZE_NODES,
    ),
    maxBytes: parseOptionalLimit(
      process.env.MANIFEST_CANONICALIZE_MAX_BYTES,
      DEFAULT_MAX_CANONICALIZE_BYTES,
    ),
  };
}

function assertAllowedRemoteUrl(rawUrl, allowedHosts, label) {
  const value = String(rawUrl ?? "").trim();
  if (!value) {
    throw new Error(`${label} is missing`);
  }
  const url = new URL(value);
  if (url.protocol !== HTTPS_PROTOCOL) {
    throw new Error(`${label} must use https`);
  }
  if (!allowedHosts.includes(url.hostname)) {
    throw new Error(`${label} host is not allowed: ${url.hostname}`);
  }
  return url.toString();
}

function verifyManifestSignature(manifest, config) {
  const baseStatus = buildBaseStatus(config);
  const disabledStatus = ensurePublicKeyConfigured(config, baseStatus);
  if (disabledStatus) {
    return disabledStatus;
  }

  const signature = getSignature(manifest);
  if (!signature) {
    return finalizeSignatureStatus(
      { ...baseStatus, status: "missing_signature" },
      config,
      "公钥已配置，但线上清单缺少签名。",
    );
  }

  const algorithm = String(signature.algorithm ?? "").trim();
  const keyId = String(signature.key_id ?? "").trim();
  const statusWithKey = { ...baseStatus, keyId: keyId || baseStatus.keyId };

  const algorithmProblem = getAlgorithmProblem(algorithm);
  if (algorithmProblem) {
    return finalizeSignatureStatus(
      { ...statusWithKey, status: "unsupported_algorithm" },
      config,
      algorithmProblem,
    );
  }

  const keyIdProblem = getKeyIdProblem(keyId, config);
  if (keyIdProblem) {
    return finalizeSignatureStatus(
      { ...statusWithKey, status: "key_id_mismatch" },
      config,
      keyIdProblem,
    );
  }

  return verifySignatureValue(manifest, signature, config, statusWithKey);
}

function finalizeSignatureStatus(status, config, message) {
  const result = { ...status, message };
  if (config.requireManifestSignature) {
    throw new Error(message);
  }
  return result;
}

function canonicalizeUnsignedManifest(manifest) {
  return canonicalizeSignedJson(stripSignature(manifest));
}

function canonicalizeSignedJson(value) {
  const limits = canonicalizeLimitsFromEnv();
  const budget = { nodes: 0, bytes: 0, ...limits };
  return canonicalizeSignedJsonWithBudget(value, 0, budget);
}

function stripSignature(manifest) {
  const source = manifest && typeof manifest === "object" ? manifest : {};
  const { signature, ...unsignedManifest } = source;
  return unsignedManifest;
}

function canonicalizeSignedJsonWithBudget(value, depth, budget) {
  ensureCanonicalizeBudget(depth, budget);
  budget.nodes += 1;

  if (Array.isArray(value)) {
    return canonicalizeArrayWithBudget(value, depth, budget);
  }

  if (value && typeof value === "object") {
    return canonicalizeObjectWithBudget(value, depth, budget);
  }

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("manifest canonicalization encountered unsupported value");
  }
  return recordCanonicalizeBytes(serialized, budget);
}

function canonicalizeArrayWithBudget(value, depth, budget) {
  const items = [];
  for (const entry of value) {
    items.push(canonicalizeSignedJsonWithBudget(entry, depth + 1, budget));
  }
  return recordCanonicalizeBytes(`[${items.join(",")}]`, budget);
}

function canonicalizeObjectWithBudget(value, depth, budget) {
  const keys = Object.keys(value).sort();
  const pairs = [];
  for (const key of keys) {
    const serializedKey = JSON.stringify(key);
    const serializedValue = canonicalizeSignedJsonWithBudget(
      value[key],
      depth + 1,
      budget,
    );
    pairs.push(`${serializedKey}:${serializedValue}`);
  }
  return recordCanonicalizeBytes(`{${pairs.join(",")}}`, budget);
}

function ensureCanonicalizeBudget(depth, budget) {
  if (depth > budget.maxDepth) {
    throw new Error("manifest canonicalization exceeds max depth");
  }
  if (budget.nodes >= budget.maxNodes) {
    throw new Error("manifest canonicalization exceeds max nodes");
  }
  if (budget.bytes >= budget.maxBytes) {
    throw new Error("manifest canonicalization exceeds max bytes");
  }
}

function recordCanonicalizeBytes(value, budget) {
  budget.bytes += Buffer.byteLength(value, "utf8");
  if (budget.bytes > budget.maxBytes) {
    throw new Error("manifest canonicalization exceeds max bytes");
  }
  return value;
}

function buildBaseStatus(config) {
  return {
    enabled: Boolean(config.manifestPublicKeyPem),
    required: config.requireManifestSignature,
    verified: false,
    status: "disabled",
    keyId: config.manifestSignatureKeyId || "",
    message: "服务端未启用清单验签。",
  };
}

function ensurePublicKeyConfigured(config, baseStatus) {
  if (config.manifestPublicKeyPem) {
    return null;
  }
  if (config.requireManifestSignature) {
    throw new Error(MISSING_PUBLIC_KEY_MESSAGE);
  }
  return baseStatus;
}

function getSignature(manifest) {
  const signature = manifest?.signature;
  if (!signature || typeof signature !== "object") {
    return null;
  }
  return signature;
}

function getAlgorithmProblem(algorithm) {
  if (algorithm === SIGNATURE_ALGORITHM) {
    return null;
  }
  return `不支持的清单签名算法：${algorithm || "空值"}。`;
}

function getKeyIdProblem(keyId, config) {
  if (!config.manifestSignatureKeyId) {
    return null;
  }
  if (keyId === config.manifestSignatureKeyId) {
    return null;
  }
  return "清单签名 key_id 与当前服务配置不一致。";
}

function verifySignatureValue(manifest, signature, config, statusWithKey) {
  try {
    const verifier = createVerify(SIGNATURE_ALGORITHM);
    verifier.update(canonicalizeUnsignedManifest(manifest), "utf8");
    verifier.end();

    const signatureValue = Buffer.from(String(signature.value ?? ""), "base64");
    const isVerified = verifier.verify(config.manifestPublicKeyPem, signatureValue);
    if (!isVerified) {
      return finalizeSignatureStatus(
        { ...statusWithKey, status: "invalid_signature" },
        config,
        "清单签名与当前公钥不匹配。",
      );
    }
  } catch (error) {
    return finalizeSignatureStatus(
      { ...statusWithKey, status: "verification_error" },
      config,
      `清单验签执行失败：${error.message}`,
    );
  }

  return {
    ...statusWithKey,
    verified: true,
    status: "verified",
    message: "清单已通过服务端验签。",
  };
}

function assertManifestSignature(manifest, config) {
  const status = verifyManifestSignature(manifest, config);
  if (!status.enabled) {
    return;
  }
  if (status.verified) {
    return;
  }
  throw new Error(status.message);
}

module.exports = {
  assertAllowedRemoteUrl,
  assertManifestSignature,
  verifyManifestSignature,
  canonicalizeSignedJson,
  canonicalizeUnsignedManifest,
};
