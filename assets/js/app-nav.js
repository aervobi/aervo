/*
 * Shared navigation for the signed-in app. Include with a plain (synchronous)
 * script tag where the old <nav> used to be, so the markup exists before the
 * page's own scripts run:
 *
 *   <script src="/assets/js/app-nav.js" data-active="reports"></script>
 *
 * data-active  Optional. Which link is current: reports | intelligence |
 *              integrations | settings | founder. Setting it also adds a "Dashboard"
 *              link (sub-pages need a way back; dashboards use their tabs).
 * data-accent  Optional "r,g,b" override. Normally omitted: the bar follows the
 *              page's --accent-rgb token (see tokens.css).
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
  var accent = script.getAttribute("data-accent") || "";
  var accentStyle = accent ? ' style="--nav-accent:' + accent + '"' : "";

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

  var S = window.AervoSession || null;

  // Visiting a dashboard makes it the "active" one (remembered per device), so
  // sub-pages like Reports and Settings link back to the one you were using.
  var DASH = [
    ["/dashboard/shopify", "shopify"],
    ["/dashboard/square", "square"],
    ["/dashboard/ims", "ims"],
  ];
  var pathKey = null;
  DASH.forEach(function (d) {
    if (window.location.pathname.indexOf(d[0]) === 0) pathKey = d[1];
  });
  if (pathKey && S) S.setActivePlatform(pathKey);

  var activeKey = (S && S.activePlatform()) || null;
  var home =
    script.getAttribute("data-home") ||
    (activeKey ? S.HOMES[activeKey] : homeFor(readUser().platform));

  var links = [
    ["reports", "/reports", "📊", "Reports"],
    ["intelligence", "/intelligence", "🧠", "Intelligence"],
    ["integrations", "/integrations", "⚙️", "Integrations"],
    ["settings", "/settings", "👤", "Settings"],
  ];
  // Founder accounts get a link to /founder (the page and its data are checked
  // on the server; this only decides whether to show the link)
  var FOUNDER_KEY = "aervo_founder";
  var FOUNDER_LINK = ["founder", "/founder", "🛠️", "Founder"];
  var founderCached = false;
  try {
    founderCached = localStorage.getItem(FOUNDER_KEY) === "1";
  } catch (e) {}
  if (founderCached || active === "founder") links.unshift(FOUNDER_LINK);

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
    '<nav class="nav" id="appNav"' + accentStyle + ">" +
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
    '<div class="mobile-menu" id="mobileMenu"' + accentStyle + ">" +
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
    // Links animate `all`, so without this the measurements below would read
    // mid-transition (compact) sizes and the bar would grow past its box later.
    nav.classList.add("nav-measuring");
    setStep(0);
    if (window.innerWidth > 768) { // CSS collapses everything below this
      for (var n = 1; n <= steps.length && needed() > nav.clientWidth; n++) {
        setStep(n);
      }
    }
    void nav.offsetWidth; // commit the final state before transitions return
    nav.classList.remove("nav-measuring");
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
  // Content can also grow without a DOM change (late font swap, image decode),
  // so refit whenever one of the bar's parts changes size.
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(queueFit);
    nav.querySelectorAll(".nav-brand, .nav-center, .nav-right").forEach(function (el) {
      Array.prototype.forEach.call(el.children, function (child) {
        ro.observe(child);
      });
    });
  }

  function logout() {
    // Ends the session on the server too (cookie + every other device's token)
    var done = function () {
      window.location.href = "/login";
    };
    if (window.AervoSession) {
      window.AervoSession.logout().then(done, done);
    } else {
      try {
        localStorage.removeItem("aervo_token");
        localStorage.removeItem("aervo_user");
      } catch (e) {}
      done();
    }
  }
  document.querySelectorAll("[data-logout]").forEach(function (el) {
    el.addEventListener("click", logout);
  });

  // ── Account data: platform sync + the switcher ──────────────────────────────
  // /api/user/me tells us which data sources the account has. We (1) remember
  // `platform` so "home" links are right, and (2) show a Shopify / Square / IMS
  // switcher when there are two or more. The last result is cached so the
  // switcher appears instantly on the next page, then refreshed in the background.
  var LABELS = {
    shopify: ["🛍️", "Shopify"],
    square: ["⬛", "Square"],
    ims: ["📦", "IMS"],
  };
  var CACHE_KEY = "aervo_platforms";

  function currentKey(avail) {
    if (pathKey && avail.indexOf(pathKey) > -1) return pathKey;
    var pref = S && S.activePlatform();
    return pref && avail.indexOf(pref) > -1 ? pref : avail[0];
  }

  function optionHtml(key, current) {
    var l = LABELS[key];
    return (
      '<button type="button" class="platform-opt' + (key === current ? " active" : "") +
      '" data-platform="' + key + '" aria-pressed="' + (key === current) + '">' +
      '<span class="nav-ico">' + l[0] + "</span>" + l[1] + "</button>"
    );
  }

  function renderSwitcher(avail) {
    var old = document.querySelector("#appNav .platform-switch");
    if (old) old.remove();
    var oldMobile = document.querySelector("#mobileMenu .mobile-platforms");
    if (oldMobile) oldMobile.remove();
    if (!S || !avail || avail.length < 2) return;

    var cur = currentKey(avail);
    var opts = avail.map(function (k) { return optionHtml(k, cur); }).join("");

    var right = document.querySelector("#appNav .nav-right");
    right.insertAdjacentHTML(
      "afterbegin",
      '<div class="platform-switch" role="group" aria-label="Switch dashboard">' + opts + "</div>"
    );
    menu.insertAdjacentHTML(
      "afterbegin",
      '<div class="mobile-platforms has-options"><div class="platform-label">SWITCH DASHBOARD</div>' + opts + "</div>"
    );

    // sub-pages (Reports, Settings...) follow the active platform
    if (!script.getAttribute("data-home")) {
      document.querySelectorAll("[data-home]").forEach(function (a) {
        a.setAttribute("href", S.HOMES[cur]);
      });
    }
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-platform]");
    if (!b || !S) return;
    var key = b.getAttribute("data-platform");
    S.setActivePlatform(key);
    if (/^\/dashboard\//.test(window.location.pathname)) {
      window.location.href = S.HOMES[key];
    } else {
      window.location.reload(); // Reports / Intelligence / ... re-read the active source
    }
  });

  function setFounder(isFounder) {
    try {
      if (isFounder) localStorage.setItem(FOUNDER_KEY, "1");
      else localStorage.removeItem(FOUNDER_KEY);
    } catch (e) {}
    var existing = document.querySelectorAll('#appNav a[href="/founder"], #mobileMenu a[href="/founder"]');
    if (isFounder && !existing.length) {
      var desk = document.querySelector('#appNav .nav-right a[href="/settings"]');
      var mob = document.querySelector('#mobileMenu .mobile-links a[href="/settings"]');
      if (desk) desk.insertAdjacentHTML("beforebegin", linkHtml("nav-link", FOUNDER_LINK, true));
      if (mob) mob.insertAdjacentHTML("beforebegin", linkHtml("mobile-link", FOUNDER_LINK, false));
    } else if (!isFounder && active !== "founder") {
      existing.forEach(function (a) { a.remove(); });
    }
  }

  var user = readUser();
  var token = null;
  try {
    token = localStorage.getItem("aervo_token");
  } catch (e) {}

  // 1) instant render from the last known answer
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && cached.avail) renderSwitcher(cached.avail);
  } catch (e) {}

  // 2) refresh from the server
  if (token && window.fetch) {
    fetch("https://api.aervoapp.com/api/user/me", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.user) return;
        var avail = S ? S.platformsFrom(d) : [];
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ avail: avail, t: Date.now() }));
          var u = readUser();
          if (d.user.platform && u.platform !== d.user.platform) {
            u.platform = d.user.platform;
            localStorage.setItem("aervo_user", JSON.stringify(u));
          }
        } catch (e) {}
        renderSwitcher(avail);
        setFounder(!!d.user.isFounder);
        if (!script.getAttribute("data-home") && !activeKey && d.user.platform) {
          document.querySelectorAll("[data-home]").forEach(function (a) {
            a.setAttribute("href", homeFor(d.user.platform));
          });
        }
      })
      .catch(function () {});
  }
})();
