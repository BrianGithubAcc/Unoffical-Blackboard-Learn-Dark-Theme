const defaultBannerColor = "#4b7ca8";
const themeScriptPrefix = "bb-dark-theme-site-";

function sitePattern(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) return null;
  return `${parsed.protocol}//${parsed.hostname}/*`;
}

function bannerColorWithAlpha(color, alpha) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

function shadeBannerColor(color) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `#${channels.map((channel) => Math.round(channel * 0.48).toString(16).padStart(2, "0")).join("")}`;
}

function scriptIdForOrigin(origin) {
  return `${themeScriptPrefix}${origin.replace(/[^\da-z_-]/gi, "-")}`;
}

function validHttpOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return /^https?:$/.test(parsed.protocol) && parsed.origin === origin;
  } catch {
    return false;
  }
}

async function registerThemeForOrigin(origin) {
  if (!validHttpOrigin(origin)) return false;
  const pattern = sitePattern(origin);
  const saved = await browser.storage.local.get({ enabledOrigins: [] });
  if (!saved.enabledOrigins.includes(origin)) return false;
  if (!(await browser.permissions.contains({ origins: [pattern] }))) return false;

  const id = scriptIdForOrigin(origin);
  const [existing] = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing && existing.runAt === "document_start" &&
      existing.matches?.includes(pattern) && existing.css?.includes("theme.css") &&
      existing.js?.includes("page-theme.js") && existing.js?.includes("site-bootstrap.js")) {
    return true;
  }
  if (existing) await browser.scripting.unregisterContentScripts({ ids: [id] });

  await browser.scripting.registerContentScripts([{
    id,
    matches: [pattern],
    css: ["theme.css"],
    js: ["page-theme.js", "site-bootstrap.js"],
    runAt: "document_start",
    persistAcrossSessions: true
  }]);
  return true;
}

async function unregisterThemeForOrigin(origin) {
  if (!validHttpOrigin(origin)) return;
  const id = scriptIdForOrigin(origin);
  const [existing] = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing) await browser.scripting.unregisterContentScripts({ ids: [id] });
}

async function restoreThemeContentScripts() {
  const [{ enabledOrigins }, registered] = await Promise.all([
    browser.storage.local.get({ enabledOrigins: [] }),
    browser.scripting.getRegisteredContentScripts()
  ]);
  const desiredOrigins = new Set();
  for (const origin of enabledOrigins) {
    if (!validHttpOrigin(origin)) continue;
    const pattern = sitePattern(origin);
    if (await browser.permissions.contains({ origins: [pattern] })) desiredOrigins.add(origin);
  }

  const desiredIds = new Set([...desiredOrigins].map(scriptIdForOrigin));
  const staleIds = registered
    .filter((script) => script.id.startsWith(themeScriptPrefix) && !desiredIds.has(script.id))
    .map((script) => script.id);
  if (staleIds.length) await browser.scripting.unregisterContentScripts({ ids: staleIds });

  await Promise.all([...desiredOrigins].map((origin) => registerThemeForOrigin(origin)));
}

async function applySavedTheme(tabId, pageUrl) {
  let parsedUrl;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    return false;
  }

  const pattern = sitePattern(pageUrl);
  if (!pattern) return false;

  const saved = await browser.storage.local.get({ enabledOrigins: [], bannerColor: defaultBannerColor });
  if (!saved.enabledOrigins.includes(parsedUrl.origin)) return false;
  if (!(await browser.permissions.contains({ origins: [pattern] }))) return false;

  const color = /^#[\da-f]{6}$/i.test(saved.bannerColor) ? saved.bannerColor : defaultBannerColor;
  const shade = shadeBannerColor(color);
  await browser.scripting.insertCSS({
    target: { tabId },
    files: ["theme.css"]
  });
  await browser.scripting.executeScript({
    target: { tabId },
    args: [true, color, bannerColorWithAlpha(color, 0.82), bannerColorWithAlpha(shade, 0.78)],
    func: setPageTheme
  });
  return true;
}

async function restoreOpenTabs() {
  await restoreThemeContentScripts().catch(() => {});
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map((tab) => {
    if (!tab.id || !tab.url) return Promise.resolve();
    return applySavedTheme(tab.id, tab.url).catch(() => {});
  }));
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "register-theme-site") return registerThemeForOrigin(message.origin);
  if (message?.type === "unregister-theme-site") return unregisterThemeForOrigin(message.origin);
});

browser.runtime.onStartup.addListener(restoreOpenTabs);
browser.runtime.onInstalled.addListener(restoreOpenTabs);
