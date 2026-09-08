const fs = require("node:fs/promises");
const path = require("node:path");

const ALLOWED_SOURCES = new Set(["site", "app"]);

class StatsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.backupPath = `${filePath}.bak`;
    this.queue = Promise.resolve();
  }

  async snapshot() {
    return this.#read();
  }

  async increment(routeKey, assetKey, source = "site") {
    return this.#enqueue(async () => {
      const stats = await this.#read();
      if (!ALLOWED_SOURCES.has(source)) {
        throw new Error(`unknown download source: ${source}`);
      }
      if (source === "site") {
        stats.siteDownloads += 1;
      } else if (source === "app") {
        stats.appDownloads += 1;
      }
      stats.totalDownloads = stats.siteDownloads + stats.appDownloads;
      stats.routes[routeKey] = (stats.routes[routeKey] ?? 0) + 1;
      stats.assets[assetKey] = (stats.assets[assetKey] ?? 0) + 1;
      stats.sources[source] = (stats.sources[source] ?? 0) + 1;
      stats.updatedAt = new Date().toISOString();
      await this.#write(stats);
      return stats;
    });
  }

  #enqueue(task) {
    this.queue = this.queue.then(task, task);
    return this.queue;
  }

  async #read() {
    try {
      return await this.#readState(this.filePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        return this.#normalize({});
      }
      // A corrupt stats file must not take the download routes down with it:
      // fall back to the rolling backup, then to an empty state. The next
      // write heals the main file.
      console.warn(`stats file unreadable: ${error.message}; falling back to backup`);
      try {
        return await this.#readState(this.backupPath);
      } catch {
        return this.#normalize({});
      }
    }
  }

  async #readState(filePath) {
    const raw = await fs.readFile(filePath, "utf8");
    return this.#normalize(JSON.parse(raw));
  }

  async #write(stats) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    // Swap through a temp file so a crash mid-write can never leave a
    // truncated JSON behind, then refresh the backup from the verified-good
    // main file (never from a possibly-corrupt one).
    const tempPath = `${this.filePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
    await fs.rename(tempPath, this.filePath);
    try {
      await fs.copyFile(this.filePath, this.backupPath);
    } catch {
      // Backup is best effort.
    }
  }

  #normalize(raw) {
    const legacyTotal = Number.parseInt(raw.totalDownloads ?? 0, 10) || 0;
    const siteDownloads = Number.parseInt(raw.siteDownloads ?? legacyTotal, 10) || 0;
    const appDownloads = Number.parseInt(raw.appDownloads ?? 0, 10) || 0;
    return {
      totalDownloads: siteDownloads + appDownloads,
      siteDownloads,
      appDownloads,
      routes: raw.routes && typeof raw.routes === "object" ? raw.routes : {},
      assets: raw.assets && typeof raw.assets === "object" ? raw.assets : {},
      sources: raw.sources && typeof raw.sources === "object" ? raw.sources : {},
      updatedAt: raw.updatedAt || null,
    };
  }
}

module.exports = { StatsStore };
