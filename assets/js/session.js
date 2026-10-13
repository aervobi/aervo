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

  window.AervoSession = {
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
