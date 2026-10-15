const defaultBannerColor = "#4b7ca8";

function bannerColorWithAlpha(color, alpha) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `rgba(${channels.join(", ")}, ${alpha})`;
}

function shadeBannerColor(color) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  return `#${channels.map((channel) => Math.round(channel * 0.48).toString(16).padStart(2, "0")).join("")}`;
}

function applyThemeAtDocumentStart(color, shouldEnable = true) {
  const apply = () => {
    if (!shouldEnable) {
      setPageTheme(false);
      return;
    }
    const shade = shadeBannerColor(color);
    setPageTheme(true, color, bannerColorWithAlpha(color, 0.82), bannerColorWithAlpha(shade, 0.78));
  };

  if (document.documentElement) {
    apply();
    return;
  }

  const rootObserver = new MutationObserver(() => {
    if (!document.documentElement) return;
    rootObserver.disconnect();
    apply();
  });
  rootObserver.observe(document, { childList: true });
}

// Enable the page styles immediately; the stored tint is applied as soon as it is read.
applyThemeAtDocumentStart(defaultBannerColor);

browser.storage.local.get({ enabledOrigins: [], bannerColor: defaultBannerColor }).then((saved) => {
  if (!saved.enabledOrigins.includes(location.origin)) {
    applyThemeAtDocumentStart(defaultBannerColor, false);
    return;
  }

  const color = /^#[\da-f]{6}$/i.test(saved.bannerColor) ? saved.bannerColor : defaultBannerColor;
  applyThemeAtDocumentStart(color);
}).catch(() => {});
