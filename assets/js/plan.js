/*
 * Plan-aware UI helpers for signed-in pages.
 *
 * The server enforces every plan limit (aervo-backend/utils/planAccess.js); this
 * file only explains them: lock icons on tabs, an upgrade card in place of a
 * locked view, and a readable message when Ask Aervo's monthly allowance is used.
 * It reads `planFeatures` from /api/user/me, which pages already fetch.
 *
 *   AervoPlan.dashboardLocked(user, view)  -> true if this tab needs a paid plan
 *   AervoPlan.markTabs(user)               -> adds a lock to locked [data-view] tabs
 *   AervoPlan.upgradeCard(opts)            -> HTML for a locked view
 *   AervoPlan.chatError(data)              -> text for a failed chat reply
 */
(function () {
  var PLAN_NAMES = { free: "Lite", essential: "Essential", pro: "Pro", business: "Business" };

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function features(user) {
    return (user && user.planFeatures) || null;
  }

  // Lite (trial over, no plan) gets the Overview tab; the rest need Essential+
  function dashboardLocked(user, view) {
    var f = features(user);
    if (!f || view === "overview") return false;
    return !f.fullDashboard;
  }

  function markTabs(user) {
    var f = features(user);
    if (!f || f.fullDashboard) return;
    document.querySelectorAll(".nav-tab[data-view], .mobile-nav-tab[data-view]").forEach(function (tab) {
      if (tab.getAttribute("data-view") === "overview" || tab.querySelector(".plan-lock")) return;
      tab.classList.add("plan-locked");
      tab.insertAdjacentHTML("beforeend", ' <span class="plan-lock" aria-label="Upgrade to unlock">🔒</span>');
    });
  }

  function upgradeCard(opts) {
    opts = opts || {};
    var plan = opts.plan || "Essential";
    var bullets = (opts.bullets || [])
      .map(function (b) {
        return "<li>" + esc(b) + "</li>";
      })
      .join("");
    return (
      '<div class="card plan-upgrade">' +
      '<div class="plan-upgrade-icon" aria-hidden="true">🔒</div>' +
      '<h2 class="plan-upgrade-title">' + esc(opts.title || "Unlock this view") + "</h2>" +
      '<p class="plan-upgrade-text">' + esc(opts.text || "This is included with " + plan + " and above.") + "</p>" +
      (bullets ? '<ul class="plan-upgrade-list">' + bullets + "</ul>" : "") +
      '<a class="btn btn-primary" href="/pricing">See ' + esc(plan) + " plans</a>" +
      "</div>"
    );
  }

  function chatError(data) {
    if (data && (data.code === "AI_LIMIT" || data.code === "PLAN_LIMIT") && data.message) {
      return data.message + " See plans at aervoapp.com/pricing.";
    }
    return null;
  }

  // Shared styles (kept here so every page gets the same look)
  var css =
    ".plan-lock{font-size:.85em;opacity:.8}" +
    ".plan-locked{opacity:.75}" +
    ".plan-upgrade{max-width:560px;margin:var(--space-8) auto;text-align:center;padding:var(--space-8) var(--space-6)}" +
    ".plan-upgrade-icon{font-size:var(--fs-32);margin-bottom:var(--space-3)}" +
    ".plan-upgrade-title{font-size:var(--fs-20);margin-bottom:var(--space-2)}" +
    ".plan-upgrade-text{color:var(--text-secondary);margin-bottom:var(--space-5)}" +
    ".plan-upgrade-list{list-style:none;display:flex;flex-wrap:wrap;justify-content:center;gap:var(--space-2);margin-bottom:var(--space-6)}" +
    ".plan-upgrade-list li{font-size:var(--fs-12);color:var(--text-secondary);padding:var(--space-1) var(--space-3);border-radius:var(--radius-pill);border:1px solid var(--border);background:var(--surface-raised)}";
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  window.AervoPlan = {
    PLAN_NAMES: PLAN_NAMES,
    dashboardLocked: dashboardLocked,
    markTabs: markTabs,
    upgradeCard: upgradeCard,
    chatError: chatError,
  };
})();
