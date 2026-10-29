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
    var isApi = false;
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(API) === 0) {
        isApi = true;
        init = Object.assign({}, init || {}, { credentials: "include" });
      }
    } catch (e) {}
    var p = nativeFetch.call(this, input, init);
    if (!isApi) return p;
    return p.then(function (res) {
      // Signed in here, but the server says the session is over (idle timeout,
      // logged out elsewhere, password changed): go to the login page cleanly.
      if ((res.status === 401 || res.status === 403) && isCookieSession()) {
        res
          .clone()
          .json()
          .then(function (b) {
            if (
              b &&
              (b.code === "SESSION_ENDED" ||
                b.message === "Invalid or expired token" ||
                b.message === "Authentication required")
            )
              sessionEnded("expired");
          })
          .catch(function () {});
      }
      return res;
    });
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
      localStorage.removeItem("aervo_last_activity");
      localStorage.removeItem("aervo_founder");
      localStorage.removeItem("aervo_team");
      localStorage.removeItem("aervo_staff");
    } catch (e) {}
  }

  // Server-side redirects after OAuth sign-in carry ?session=1 (nothing secret)
  var arrivedViaOAuth = false;
  try {
    var q = new URLSearchParams(window.location.search);
    if (q.get("session") === "1") {
      arrivedViaOAuth = true;
      mark();
      // a fresh sign-in: restart the inactivity clock
      localStorage.setItem("aervo_last_activity", String(Date.now()));
      q.delete("session");
      var rest = q.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (rest ? "?" + rest : "") + window.location.hash,
      );
    }
  } catch (e) {}

  // ── signed-in state + inactivity sign-out ────────────────────────────────────
  // Only for normal browser sessions (cookie). Inside the Shopify admin iframe the
  // session belongs to Shopify's own admin session, so we leave that alone.
  var embedded = window.self !== window.top;
  function isCookieSession() {
    try {
      return !embedded && localStorage.getItem("aervo_token") === MARKER;
    } catch (e) {
      return false;
    }
  }
  var onAuthPage = /^\/(login|onboarding|forgot-password|reset-password|welcome|team\/join)(\/|$)/.test(
    window.location.pathname,
  );

  var ending = false;
  function sessionEnded(reason) {
    if (ending || onAuthPage) return;
    ending = true;
    try {
      localStorage.removeItem("aervo_token");
      localStorage.removeItem("aervo_user");
      localStorage.removeItem("aervo_platforms");
      localStorage.removeItem("aervo_last_activity");
    } catch (e) {}
    window.location.href = "/login?reason=" + encodeURIComponent(reason || "expired");
  }

  var IDLE_MS = 30 * 60 * 1000; // matches the server (it reports the real value on each ping)
  var WARN_MS = 2 * 60 * 1000; // warn this long before signing out
  var PING_MS = 4 * 60 * 1000; // renew the server session at most this often while active
  var ACT_KEY = "aervo_last_activity"; // shared by all tabs: activity in one keeps all alive
  var lastTouch = 0;
  var lastPing = 0;
  var warning = null;

  function lastActivity() {
    try {
      return Number(localStorage.getItem(ACT_KEY)) || Date.now();
    } catch (e) {
      return Date.now();
    }
  }
  function touch() {
    var t = Date.now();
    if (t - lastTouch < 1000) return;
    lastTouch = t;
    try {
      localStorage.setItem(ACT_KEY, String(t));
    } catch (e) {}
  }
  function ping() {
    lastPing = Date.now();
    return nativeFetch
      .call(window, API + "/api/session/ping", { method: "POST", credentials: "include" })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) return sessionEnded("expired");
        return r.json().then(function (b) {
          if (b && b.idleMinutes) IDLE_MS = b.idleMinutes * 60 * 1000;
        });
      })
      .catch(function () {});
  }
  function onActivity() {
    if (warning) return; // once the warning is up, only its button extends the session
    touch();
    if (Date.now() - lastPing > PING_MS) ping();
  }

  function idleSignOut() {
    if (ending || onAuthPage) return;
    // clear THIS device only (the idle one); other devices keep their own sessions
    nativeFetch
      .call(window, API + "/api/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "device" }),
      })
      .catch(function () {})
      .then(function () {
        sessionEnded("idle");
      });
  }

  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function showWarning() {
    if (warning || !document.body) return; // (this script runs in <head>, before <body> exists)
    var el = document.createElement("div");
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "idleTitle");
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.7);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)";
    el.innerHTML =
      '<div style="max-width:380px;width:100%;padding:24px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:#070b17;color:#e5ecff;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 40px 80px rgba(0,0,0,.6)">' +
      '<div id="idleTitle" style="font-size:18px;font-weight:700;margin-bottom:8px">Still there?</div>' +
      '<div style="font-size:14px;line-height:1.5;color:#9ca7d6">For your security you\'ll be signed out in <strong id="idleCount" style="color:#e5ecff">2:00</strong> because there has been no activity.</div>' +
      '<div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">' +
      '<button type="button" id="idleStay" style="flex:1;min-height:40px;padding:0 16px;border:0;border-radius:999px;background:linear-gradient(90deg,#29c8ff,#7c5cff);color:#050816;font-weight:600;font-size:13px;cursor:pointer">Stay signed in</button>' +
      '<button type="button" id="idleOut" style="flex:1;min-height:40px;padding:0 16px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:transparent;color:#e5ecff;font-size:13px;cursor:pointer">Sign out now</button>' +
      "</div></div>";
    document.body.appendChild(el);
    warning = el;
    el.querySelector("#idleStay").addEventListener("click", function () {
      touch();
      lastTouch = 0;
      touch();
      hideWarning();
      ping();
    });
    el.querySelector("#idleOut").addEventListener("click", function () {
      nativeFetch
        .call(window, API + "/api/logout", { method: "POST", credentials: "include" })
        .catch(function () {})
        .then(function () {
          clearLocal();
          ending = true;
          window.location.href = "/login";
        });
    });
    el.querySelector("#idleStay").focus();
  }
  function hideWarning() {
    if (warning && warning.parentNode) warning.parentNode.removeChild(warning);
    warning = null;
  }

  function tick() {
    if (!isCookieSession() || onAuthPage || ending) return;
    var idle = Date.now() - lastActivity();
    if (idle >= IDLE_MS) {
      hideWarning();
      idleSignOut();
    } else if (idle >= IDLE_MS - WARN_MS) {
      showWarning();
      var c = warning && warning.querySelector("#idleCount");
      if (c) c.textContent = fmt(IDLE_MS - idle);
    } else if (warning) {
      hideWarning(); // activity in another tab (or "Stay") brought us back
    }
  }

  if (isCookieSession() && !onAuthPage) {
    if (!localStorage.getItem(ACT_KEY)) touch();
    [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
      "wheel",
    ].forEach(function (evt) {
      window.addEventListener(evt, onActivity, { passive: true, capture: true });
    });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) tick(); // e.g. laptop woke up after being asleep
    });
    setInterval(tick, 1000);
    // first check once the page has a <body> to show the warning in
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tick);
    } else {
      tick();
    }
  }

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

  // ── employees ──────────────────────────────────────────────────────────────
  // Someone invited onto a business's team (supervisor or member) who has no
  // store of their own. They get the employee experience: the store's home page,
  // Messages and Settings, branded with the store they work for. Owners, and staff
  // who also run their own store, keep the normal app.
  var STAFF_KEY = "aervo_staff";

  function isStaff(me) {
    return !!(me && me.team && me.team.role !== "owner" && !platformsFrom(me).length);
  }

  // Cache the answer (with the store's name/logo) so the next page can switch
  // to the employee layout before /api/user/me comes back
  function rememberStaff(me) {
    try {
      if (isStaff(me)) {
        var st = me.team.store || {};
        localStorage.setItem(
          STAFF_KEY,
          JSON.stringify({ role: me.team.role, team: me.team.name, store: st.name || me.team.name, logoUrl: st.logoUrl || null }),
        );
      } else {
        localStorage.removeItem(STAFF_KEY);
      }
    } catch (e) {}
  }

  // { role, team, store, logoUrl } or null
  function cachedStaff() {
    try {
      return JSON.parse(localStorage.getItem(STAFF_KEY) || "null");
    } catch (e) {
      return null;
    }
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
    rememberStaff(me);
    if (isStaff(me)) return "/team";
    var avail = platformsFrom(me);
    var pref = activePlatform();
    var key = pref && avail.indexOf(pref) > -1 ? pref : avail[0];
    if (key) return HOMES[key];
    return "/dashboard";
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
    isStaff: isStaff,
    rememberStaff: rememberStaff,
    cachedStaff: cachedStaff,
    normalizeShop: normalizeShop,
    arrivedViaOAuth: arrivedViaOAuth,
    // a fresh sign-in counts as activity (and starts the inactivity clock)
    mark: function () {
      mark();
      try {
        localStorage.setItem(ACT_KEY, String(Date.now()));
      } catch (e) {}
    },
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
