/* ---------------------------------------------------------------------------
   4-7-8 breathing — shared page bootstrap (window.BreathPage)

   Loaded in <head> on every page, deliberately render blocking: it applies the
   saved theme before the first paint, so a forced light/dark mode never flashes.
   It also picks the language for the bilingual sub-pages and keeps the browser
   UI color (theme-color) in sync. Being an external file keeps every page free
   of inline scripts, which lets the Content-Security-Policy stay strict.
--------------------------------------------------------------------------- */
(function () {
  "use strict";

  var STORAGE_KEY = "breathe478.settings";
  // mirrors --bg in styles.css for the light and dark palettes
  var THEME_COLOR = { light: "#e9ecef", dark: "#0e1116" };

  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) { /* no storage */ }

  var theme = saved.theme === "light" || saved.theme === "dark" ? saved.theme : "system";
  var en = saved.lang !== "de"; // English is the default

  /* 1) Theme before the first paint */
  if (theme !== "system") document.documentElement.setAttribute("data-theme", theme);

  /* 2) Browser UI color. The static <meta name="theme-color"> tags follow the
     system setting; when a theme is forced we prepend our own tag, because the
     browser uses the first one whose media query matches. */
  function applyThemeColor(t) {
    var head = document.head || document.getElementsByTagName("head")[0];
    var dyn = document.getElementById("themeColor");
    if (t !== "light" && t !== "dark") {
      if (dyn && dyn.parentNode) dyn.parentNode.removeChild(dyn);
      return;
    }
    if (!dyn) {
      dyn = document.createElement("meta");
      dyn.id = "themeColor";
      dyn.setAttribute("name", "theme-color");
      head.insertBefore(dyn, head.firstChild);
    }
    dyn.setAttribute("content", THEME_COLOR[t]);
  }
  applyThemeColor(theme);

  /* 3) Language. Pages that exist in one language only (the legal pages) opt out
     with data-lang-fixed, so their lang attribute keeps telling the truth. */
  if (!document.documentElement.hasAttribute("data-lang-fixed")) {
    document.documentElement.lang = en ? "en" : "de";
  }

  window.BreathPage = {
    lang: en ? "en" : "de",
    isEnglish: en,
    applyThemeColor: applyThemeColor
  };

  /* 4) Chrome of the bilingual sub-pages: show the matching language block and
     translate back link, title and description. The pages ship English as their
     static default, so English visitors never see a flash. */
  function decorate() {
    var blocks = document.querySelectorAll(".lang-block");
    for (var i = 0; i < blocks.length; i++) {
      blocks[i].hidden = blocks[i].getAttribute("data-lang") !== (en ? "en" : "de");
    }
    var back = document.getElementById("backLink");
    if (back) back.textContent = en ? "← Back" : "← Zurück";

    var body = document.body;
    if (!body) return;
    var title = body.getAttribute(en ? "data-title-en" : "data-title-de");
    if (title) document.title = title;
    var desc = body.getAttribute(en ? "data-desc-en" : "data-desc-de");
    var metaDesc = document.querySelector('meta[name="description"]');
    if (desc && metaDesc) metaDesc.setAttribute("content", desc);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorate);
  else decorate();
})();
