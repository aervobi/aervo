/*
 * Shared navigation for the signed-in app. Include with a plain (synchronous)
 * script tag where the old <nav> used to be, so the markup exists before the
 * page's own scripts run:
 *
 *   <script src="/assets/js/app-nav.js" data-active="reports" data-accent="143,191,255"></script>
 *
 * data-active  Optional. Which link is current: reports | intelligence |
 *              integrations | settings. Setting it also adds a "Dashboard"
 *              link (sub-pages need a way back; dashboards use their tabs).
 * data-accent  Optional "r,g,b" used for active tabs/links.
 * data-home    Optional. Override the home/dashboard URL.
 *
 * Page-specific pieces are supplied as <template> elements placed before the
 * script tag (all optional):
 *   #appNavBrandExtra  extra markup inside the logo link (e.g. company logo)
 *   #appNavCenter      centre of the bar (view tabs / integration switcher)
 *   #appNavRightExtra  extras before the shared links (e.g. shop badge)
 *   #appNavMobile      first section of the mobile drawer (view tabs)
 *
 * This file owns: logout, the mobile-drawer toggle, and the home URL.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var active = script.getAttribute("data-active") || "";
  var accent = script.getAttribute("data-accent") || "143,191,255";

  function slot(id) {
    var t = document.getElementById(id);
    return t ? t.innerHTML : "";
  }

  function readUser() {
    try {
      return JSON.parse(localStorage.getItem("aervo_user") || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  // csv and ims both mean the manual Inventory Management System.
  function homeFor(platform) {
    if (platform === "csv" || platform === "ims") return "/dashboard/ims";
    if (platform === "square") return "/dashboard/square";
    return "/dashboard/shopify";
  }

  var home = script.getAttribute("data-home") || homeFor(readUser().platform);

  var links = [
    ["reports", "/reports", "📊", "Reports"],
    ["intelligence", "/intelligence", "🧠", "Intelligence"],
    ["integrations", "/integrations", "⚙️", "Integrations"],
    ["settings", "/settings", "👤", "Settings"],
  ];

  function linkHtml(cls, l, withIcon) {
    var isActive = l[0] === active;
    return (
      '<a class="' + cls + (isActive ? " active" : "") + '" href="' + l[1] + '"' +
      (isActive ? ' aria-current="page"' : "") + ">" +
      (withIcon ? '<span class="nav-ico">' + l[2] + "</span>" : l[2] + " ") +
      l[3] + "</a>"
    );
  }

  var desktopLinks =
    (active
      ? '<a class="nav-link" data-home href="' + home + '"><span class="nav-ico">🏠</span>Dashboard</a>'
      : "") +
    links.map(function (l) { return linkHtml("nav-link", l, true); }).join("");

  var mobileLinks =
    (active
      ? '<a class="mobile-link" data-home href="' + home + '">🏠 Dashboard</a>'
      : "") +
    links.map(function (l) { return linkHtml("mobile-link", l, false); }).join("");

  var center = slot("appNavCenter");

  var navHtml =
    '<nav class="nav" id="appNav" style="--nav-accent:' + accent + '">' +
    '<a class="nav-brand" data-home href="' + home + '" aria-label="Aervo dashboard">' +
    '<img class="nav-logo" src="/assets/images/logo.png" alt="Aervo">' +
    slot("appNavBrandExtra") +
    "</a>" +
    '<div class="nav-center">' + center + "</div>" +
    '<div class="nav-right">' +
    slot("appNavRightExtra") +
    desktopLinks +
    '<button type="button" class="nav-menu-btn" id="mobileMenuBtn" aria-label="Menu" aria-expanded="false" aria-controls="mobileMenu">☰</button>' +
    '<button type="button" class="nav-link" id="logoutBtn" data-logout>Log out</button>' +
    "</div></nav>" +
    '<div class="mobile-menu" id="mobileMenu" style="--nav-accent:' + accent + '">' +
    slot("appNavMobile") +
    '<div class="mobile-links">' + mobileLinks +
    '<button type="button" class="mobile-link" data-logout>Log out</button></div></div>';

  script.insertAdjacentHTML("beforebegin", navHtml);

  var menu = document.getElementById("mobileMenu");
  var btn = document.getElementById("mobileMenuBtn");

  function setMenu(open) {
    menu.classList.toggle("active", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  btn.addEventListener("click", function () {
    setMenu(!menu.classList.contains("active"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setMenu(false);
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth > 768) setMenu(false);
  });

  // Fit the bar to the viewport. Pages differ a lot (6 tabs on IMS, none on
  // Settings), so measure instead of guessing breakpoints. Steps are applied
  // cumulatively until the content fits.
  var nav = document.getElementById("appNav");
  var steps = ["nav-compact", "nav-links-collapsed", "nav-tabs-collapsed"];
  function needed() {
    var cs = getComputedStyle(nav);
    var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    var gap = parseFloat(cs.columnGap) || 0;
    var b = nav.querySelector(".nav-brand");
    var c = nav.querySelector(".nav-center");
    var r = nav.querySelector(".nav-right");
    return pad + b.offsetWidth + c.scrollWidth + r.scrollWidth + gap * 2;
  }
  function setStep(n) {
    steps.forEach(function (cls, i) {
      nav.classList.toggle(cls, i < n);
      menu.classList.toggle(cls, i < n);
    });
  }
  function fit() {
    setStep(0);
    if (window.innerWidth <= 768) return; // CSS collapses everything
    for (var n = 1; n <= steps.length && needed() > nav.clientWidth; n++) {
      setStep(n);
    }
  }
  var fitQueued = false;
  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(function () {
      fitQueued = false;
      fit();
    });
  }
  fit();
  window.addEventListener("resize", queueFit);
  window.addEventListener("load", queueFit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queueFit);
  // Pages fill in badges / company logos after their API calls; refit then.
  // (Watches style + text only, never the class changes fit() itself makes.)
  new MutationObserver(queueFit).observe(nav, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "src"],
  });

  function logout() {
    try {
      localStorage.removeItem("aervo_token");
      localStorage.removeItem("aervo_user");
    } catch (e) {}
    window.location.href = "/login";
  }
  document.querySelectorAll("[data-logout]").forEach(function (el) {
    el.addEventListener("click", logout);
  });

  // The cached user may not carry `platform` yet. Fetch it once, remember it,
  // and point every "home" link at the right dashboard (skips the redirect hop
  // through /dashboard/shopify).
  var user = readUser();
  var token = null;
  try {
    token = localStorage.getItem("aervo_token");
  } catch (e) {}
  if (!user.platform && token && window.fetch) {
    fetch("https://api.aervoapp.com/api/user/me", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var p = d && d.user && d.user.platform;
        if (!p) return;
        var u = readUser();
        u.platform = p;
        try {
          localStorage.setItem("aervo_user", JSON.stringify(u));
        } catch (e) {}
        if (!script.getAttribute("data-home")) {
          document.querySelectorAll("[data-home]").forEach(function (a) {
            a.setAttribute("href", homeFor(p));
          });
        }
      })
      .catch(function () {});
  }
})();
