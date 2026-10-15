/*
 * Aervo session helper. Load first in <head> on every page that calls the API.
 *
 * The login lives in an httpOnly cookie that only the server can read, so page
 * scripts (and any injected script) never hold a usable token. This script:
 *   1. makes every request to the API carry that cookie (credentials: include)
 *   2. keeps a harmless marker in localStorage ("aervo_token" = "session"), so
 *      the existing "is anyone logged in?" checks keep working
 *   3. picks up the "?session=1" flag the server adds after Google sign-in
 *   4. provides AervoSession.logout(), which ends the session on the server
 *
 * (Inside the Shopify admin iframe, cookies are blocked by the browser, so that
 * one flow still uses a short-lived Bearer token from /auth/shopify/session-token.)
 */
(function () {
  var API = "https://api.aervoapp.com";
  var MARKER = "session";

  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(API) === 0) {
        init = Object.assign({}, init || {}, { credentials: "include" });
      }
    } catch (e) {}
    return nativeFetch.call(this, input, init);
  };

  function mark() {
    try {
      localStorage.setItem("aervo_token", MARKER);
    } catch (e) {}
  }

  function clearLocal() {
    try {
      localStorage.removeItem("aervo_token");
      localStorage.removeItem("aervo_user");
      localStorage.removeItem("aervo_platforms");
    } catch (e) {}
  }

  // Server-side redirects after OAuth sign-in carry ?session=1 (nothing secret)
  var arrivedViaOAuth = false;
  try {
    var q = new URLSearchParams(window.location.search);
    if (q.get("session") === "1") {
      arrivedViaOAuth = true;
      mark();
      q.delete("session");
      var rest = q.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (rest ? "?" + rest : "") + window.location.hash,
      );
    }
  } catch (e) {}

  // ── platforms ──────────────────────────────────────────────────────────────
  // A business can have several data sources (Shopify store, Square account, the
  // manual Inventory Management System). These helpers are shared by the login
  // page, the nav's switcher and the Intelligence page.
  var HOMES = {
    shopify: "/dashboard/shopify",
    square: "/dashboard/square",
    ims: "/dashboard/ims",
  };
  var PREF_KEY = "aervo_active_platform";

  // Which sources this account has, from a /api/user/me response
  function platformsFrom(me) {
    var out = [];
    var u = (me && me.user) || {};
    if (me && me.shop) out.push("shopify");
    if (u.squareMerchantId) out.push("square");
    if (u.platform === "csv" || u.platform === "ims") out.push("ims");
    if (!out.length) {
      if (u.platform === "square") out.push("square");
      else if (u.platform === "shopify") out.push("shopify");
    }
    return out;
  }

  function activePlatform() {
    try {
      var v = localStorage.getItem(PREF_KEY);
      return HOMES[v] ? v : null;
    } catch (e) {
      return null;
    }
  }

  function setActivePlatform(p) {
    if (!HOMES[p]) return;
    try {
      localStorage.setItem(PREF_KEY, p);
    } catch (e) {}
  }

  // Where to send someone after login: the dashboard they used last if they
  // still have it, otherwise the first one available.
  function pickHome(me) {
    var avail = platformsFrom(me);
    var pref = activePlatform();
    var key = pref && avail.indexOf(pref) > -1 ? pref : avail[0];
    return key ? HOMES[key] : "/dashboard";
  }

  // "your-store", "your-store.myshopify.com", "https://your-store.myshopify.com/"
  // or "https://admin.shopify.com/store/your-store/..." -> "your-store.myshopify.com"
  // (null if it can't be understood)
  function normalizeShop(input) {
    var s = String(input == null ? "" : input).trim().toLowerCase();
    if (!s) return null;
    s = s.replace(/^https?:\/\//, "");
    var admin = s.match(/^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/);
    if (admin) return admin[1] + ".myshopify.com";
    s = s.split(/[\/?#]/)[0];
    if (/^[a-z0-9][a-z0-9-]*$/.test(s)) return s + ".myshopify.com";
    if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return s;
    return null;
  }

  window.AervoSession = {
    HOMES: HOMES,
    platformsFrom: platformsFrom,
    activePlatform: activePlatform,
    setActivePlatform: setActivePlatform,
    pickHome: pickHome,
    normalizeShop: normalizeShop,
    arrivedViaOAuth: arrivedViaOAuth,
    mark: mark,
    clearLocal: clearLocal,
    // Ends the session on the server (every device), then clears local state.
    // Always completes, even if the network call fails.
    logout: function () {
      return nativeFetch
        .call(window, API + "/api/logout", { method: "POST", credentials: "include" })
        .catch(function () {})
        .then(clearLocal);
    },
  };
})();
