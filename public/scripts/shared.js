const FALLBACK_DOWNLOADS = [
  { id: "arm64-v8a", label: "Android arm64", href: "/download/arm64-v8a" },
  { id: "armeabi-v7a", label: "Android 32-bit", href: "/download/armeabi-v7a" },
  { id: "x86_64", label: "Android x86_64", href: "/download/x86_64" },
];

const GALLERY_INTERVAL_MS = 3200;
const numberFormatter = new Intl.NumberFormat("zh-CN");
const SIGNATURE_COPY = {
  verified: {
    label: "已验签",
    message: "当前清单已通过服务端验签。",
  },
  disabled: {
    label: "未启用",
    message: "当前官网未启用清单验签。",
  },
  missing_signature: {
    label: "缺少签名",
    message: "公钥已配置，但线上清单缺少签名。",
  },
  unsupported_algorithm: {
    label: "算法不符",
    message: "线上清单使用了当前服务不支持的签名算法。",
  },
  key_id_mismatch: {
    label: "Key 不符",
    message: "线上清单 key_id 与当前服务配置不一致。",
  },
  invalid_signature: {
    label: "签名异常",
    message: "线上清单签名与当前公钥不匹配。",
  },
  verification_error: {
    label: "校验失败",
    message: "服务端执行验签时发生异常。",
  },
};
const DOWNLOAD_HINTS = {
  "arm64-v8a": "默认推荐，多数手机直接选这个。",
  "armeabi-v7a": "面向较旧的 32 位设备。",
  x86_64: "主要用于模拟器或少量特殊设备。",
  x86: "适用于少量旧版 x86 设备。",
};
const SITE_DATA_SELECTORS = [
  "[data-site-version]",
  "[data-site-summary]",
  "[data-site-release-label]",
  "[data-site-release-link]",
  "[data-site-github-link]",
  "[data-site-release-notes]",
  "[data-site-note-count]",
  "[data-site-download-total]",
  "[data-site-download-matrix]",
  "[data-site-signature-status]",
  "[data-site-signature-message]",
];

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
}

function setLink(selector, href, label) {
  document.querySelectorAll(selector).forEach((element) => {
    element.href = href;
    if (label) {
      const labelTarget = element.querySelector("[data-link-label]");
      if (labelTarget) {
        labelTarget.textContent = label;
        return;
      }

      const directSpan = Array.from(element.children).find((child) => child.tagName === "SPAN");
      if (directSpan) {
        directSpan.textContent = label;
        return;
      }

      const textNodes = Array.from(element.childNodes).filter(
        (node) => node.nodeType === Node.TEXT_NODE,
      );
      const meaningfulTextNode = textNodes.find((node) => String(node.nodeValue ?? "").trim());
      if (meaningfulTextNode) {
        meaningfulTextNode.nodeValue = label;
        textNodes.filter((node) => node !== meaningfulTextNode).forEach((node) => {
          node.nodeValue = "";
        });
        return;
      }

      element.appendChild(document.createTextNode(label));
    }
  });
}

function fetchJson(url) {
  return fetch(url, {
    headers: { Accept: "application/json" },
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status}`);
    }
    return response.json();
  });
}

function renderDownloadMatrix(downloads) {
  const items = normalizeDownloadItems(downloads);
  document.querySelectorAll("[data-site-download-matrix]").forEach((element) => {
    element.replaceChildren(...items.map(buildDownloadTile));
  });
}

const DOWNLOAD_TILE_ICONS = {
  "arm64-v8a": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20M12 2l4 4M12 2L8 6"/></svg>`,
  "armeabi-v7a": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"/></svg>`,
  "x86_64": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>`,
  "github": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`,
};

function normalizeDownloadItems(downloads) {
  if (!Array.isArray(downloads)) {
    throw new Error("downloads must be an array");
  }
  const items = downloads.length > 0 ? [...downloads] : [...FALLBACK_DOWNLOADS];

  if (!items.some((item) => item?.id === "github")) {
    items.push({ id: "github", label: "GitHub Releases", href: "/download/github" });
  }

  return items;
}

function assertNonEmptyString(value, context) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

function assertRelativePath(href, context) {
  const value = assertNonEmptyString(href, context);
  if (!value.startsWith("/") || value.startsWith("//")) {
    throw new Error(`${context} must be a relative path`);
  }
  return value;
}

function buildDownloadTile(item) {
  const id = assertNonEmptyString(item?.id, "download id");
  const label = assertNonEmptyString(item?.label, `download label (${id})`);
  const href = assertRelativePath(item?.href, `download href (${id})`);
  const hint = getDownloadHint(id);
  const icon = DOWNLOAD_TILE_ICONS[id] || DOWNLOAD_TILE_ICONS["arm64-v8a"];
  const actionLabel = id === "github" ? "跳转" : "下载";

  const tile = document.createElement("a");
  tile.className = "download-tile";
  tile.href = href;

  const tileIcon = document.createElement("div");
  tileIcon.className = "tile-icon";
  tileIcon.setAttribute("aria-hidden", "true");
  tileIcon.innerHTML = icon;

  const tileContent = document.createElement("div");
  tileContent.className = "tile-content";

  const strong = document.createElement("strong");
  strong.textContent = label;
  tileContent.appendChild(strong);

  if (hint) {
    const span = document.createElement("span");
    span.textContent = hint;
    tileContent.appendChild(span);
  }

  const tileAction = document.createElement("div");
  tileAction.className = "tile-action";
  tileAction.textContent = actionLabel;

  tile.append(tileIcon, tileContent, tileAction);
  return tile;
}

function getDownloadHint(id) {
  return DOWNLOAD_HINTS[id] || "";
}

function renderNotes(notes) {
  if (!Array.isArray(notes) || notes.some((item) => typeof item !== "string")) {
    throw new Error("notes must be an array of strings");
  }
  const items = notes.length > 0 ? notes : ["当前发布未附带额外更新说明。"];
  document.querySelectorAll("[data-site-release-notes]").forEach((element) => {
    const children = items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    });
    element.replaceChildren(...children);
  });
  setText("[data-site-note-count]", `${notes.length}`);
}

function renderUpdate(update) {
  setText("[data-site-version]", update.version);
  setText("[data-site-summary]", update.summary);
  setText("[data-site-release-label]", update.releaseLabel);
  setLink("[data-site-release-link]", update.releaseUrl);
  setLink("[data-site-github-link]", "/download/github", "GitHub 备用入口");
  renderNotes(update.notes);
  renderDownloadMatrix(update.downloads);
  renderSignature(update.signature);
}

function renderStats(stats) {
  setText("[data-site-download-total]", numberFormatter.format(stats.totalDownloads));
}

function renderSignature(signature) {
  const status = signature?.status ?? "disabled";
  const copy = SIGNATURE_COPY[status] ?? {
    label: "状态未知",
    message: signature?.message || "当前清单验签状态未知。",
  };

  document.querySelectorAll("[data-site-signature-status]").forEach((element) => {
    element.textContent = copy.label;
    element.dataset.signatureState = status;
  });

  setText(
    "[data-site-signature-message]",
    signature?.message || copy.message,
  );
}

function markCurrentNav() {
  const currentPage = document.body.dataset.page;
  console.log("Current body data-page:", currentPage);

  const navLinks = document.querySelectorAll("[data-nav-link]");
  console.log("Found nav links:", navLinks.length);

  navLinks.forEach((element) => {
    const linkType = element.dataset.navLink;
    const isCurrent = linkType === currentPage;

    console.log(`Checking link ${linkType} against ${currentPage}: ${isCurrent}`);

    element.classList.toggle("is-current", isCurrent);
    if (isCurrent) {
      element.setAttribute("aria-current", "page");
    } else {
      element.removeAttribute("aria-current");
    }
  });
}

function setupRevealObserver() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((element) => {
      element.dataset.visible = "true";
    });
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.dataset.visible = "true";
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach((element) => observer.observe(element));
}

function updateGalleryState(track, slides, dots, triggers, nextIndex) {
  const currentIndex = (nextIndex + slides.length) % slides.length;
  track.style.transform = `translateX(-${currentIndex * 100}%)`;
  slides.forEach((slide, index) => {
    slide.classList.toggle("is-active", index === currentIndex);
  });
  dots.forEach((dot, index) => {
    dot.classList.toggle("is-active", index === currentIndex);
    dot.setAttribute("aria-current", index === currentIndex ? "true" : "false");
  });
  triggers.forEach((trigger, index) => {
    const isActive = index === currentIndex;
    trigger.classList.toggle("is-active", isActive);
    trigger.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  return currentIndex;
}

function bindGalleryTrigger(element, handler) {
  element.addEventListener("click", handler);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  });
}

function validateGallery(track, slides, dots, triggers) {
  if (!track || slides.length === 0 || slides.length !== dots.length) {
    throw new Error("Gallery markup is incomplete");
  }
  if (triggers.length > 0 && triggers.length !== slides.length) {
    throw new Error("Gallery triggers do not match slide count");
  }
}

function bindGallerySelection(items, render, startTimer) {
  items.forEach((item, index) => bindGalleryTrigger(item, () => {
    render(index);
    startTimer();
  }));
}

function setupGalleryInstance(gallery) {
  const showcase = gallery.closest(".feature-showcase") || document;
  const track = gallery.querySelector("[data-gallery-track]");
  const slides = Array.from(gallery.querySelectorAll(".gallery-shot"));
  const dots = Array.from(gallery.querySelectorAll(".gallery-dot"));
  const prevButton = gallery.querySelector("[data-gallery-prev]");
  const nextButton = gallery.querySelector("[data-gallery-next]");
  const triggers = Array.from(showcase.querySelectorAll("[data-gallery-trigger]"));

  validateGallery(track, slides, dots, triggers);

  let currentIndex = 0;
  let timerId = 0;
  const render = (nextIndex) => {
    currentIndex = updateGalleryState(track, slides, dots, triggers, nextIndex);
  };
  const stopTimer = () => {
    if (!timerId) {
      return;
    }
    window.clearInterval(timerId);
    timerId = 0;
  };
  const startTimer = () => {
    stopTimer();
    timerId = window.setInterval(() => render(currentIndex + 1), GALLERY_INTERVAL_MS);
  };

  bindGallerySelection(dots, render, startTimer);
  bindGallerySelection(triggers, render, startTimer);
  prevButton?.addEventListener("click", () => {
    render(currentIndex - 1);
    startTimer();
  });
  nextButton?.addEventListener("click", () => {
    render(currentIndex + 1);
    startTimer();
  });
  gallery.addEventListener("mouseenter", stopTimer);
  gallery.addEventListener("mouseleave", startTimer);
  gallery.addEventListener("focusin", stopTimer);
  gallery.addEventListener("focusout", startTimer);

  render(0);
  startTimer();
}

function setupGallery() {
  document.querySelectorAll("[data-gallery]").forEach(setupGalleryInstance);
}

function renderFailureState() {
  setText("[data-site-version]", "暂不可用");
  setText("[data-site-summary]", "线上清单暂时不可达，但备用下载入口仍可使用。");
  setText("[data-site-note-count]", "--");
  setText("[data-site-download-total]", "--");
  setText("[data-site-release-label]", "备用下载");
  setLink("[data-site-release-link]", "/download/github", "备用下载");
  renderDownloadMatrix([]);
  renderNotes([]);
  renderSignature({
    status: "verification_error",
    message: "当前无法读取线上清单，暂时无法判断签名状态。",
  });
}

function loadSiteData() {
  return Promise.all([fetchJson("/api/update"), fetchJson("/api/stats")]).then(([update, stats]) => {
    renderUpdate(update);
    renderStats(stats);
  });
}

function shouldLoadSiteData() {
  return SITE_DATA_SELECTORS.some((selector) => document.querySelector(selector));
}

function initSite() {
  document.body.classList.add("is-ready");
  markCurrentNav();
  setupRevealObserver();
  setupGallery();
  if (!shouldLoadSiteData()) {
    return;
  }
  loadSiteData().catch((error) => {
    console.error(error);
    renderFailureState();
  });
}

// 兼容某些情况下 DOMContentLoaded 已经触发的情况
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initSite);
} else {
  initSite();
}
