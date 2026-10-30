/*
 * Shared navigation for the signed-in app. Include with a plain (synchronous)
 * script tag where the old <nav> used to be, so the markup exists before the
 * page's own scripts run:
 *
 *   <script src="/assets/js/app-nav.js" data-active="reports"></script>
 *
 * data-active  Optional. Which page is current: reports | intelligence |
 *              integrations | messages | settings | founder | team | team-manage.
 *              Setting it also adds a "Dashboard" link (sub-pages need a way
 *              back; dashboards use their tabs).
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
 * Layout: the bar keeps only the everyday pages (Dashboard, Reports,
 * Intelligence), a Messages icon and the account button. Everything else sits
 * in the account menu, grouped as Workspace (Team, Integrations) and Account
 * (Settings, Founder console, Log out). The mobile drawer shows the same groups.
 *
 * This file owns: logout, the account menu, the store switcher, the mobile
 * drawer toggle, the home URL, and the Messages unread badge
 * (window.AervoNav.setUnread).
 *
 * Employee mode: people invited onto a business's team with no store of their
 * own (AervoSession.isStaff) get the store's logo and name, and only Home
 * (/team), Messages, Team (supervisors) and Settings. Store-owner pages
 * (dashboards, reports, intelligence, integrations) send them to /team, except
 * the owner's dashboards for a supervisor the owner lets view them (read-only;
 * session.js marks those requests and the server enforces it).
 */
(function () {
  var script = document.currentScript;
  if (!script) return;

  var API = "https://api.aervoapp.com";
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

  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }

  function stored(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function escHtml(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // csv and ims both mean the manual Inventory Management System.
  function homeFor(platform) {
    if (platform === "csv" || platform === "ims") return "/dashboard/ims";
    if (platform === "square") return "/dashboard/square";
    return "/dashboard/shopify";
  }

  var S = window.AervoSession || null;

  var staff = S && S.cachedStaff ? S.cachedStaff() : null;
  // Pages hide store-owner-only parts with [data-owner-only] (see app-nav.css)
  document.documentElement.classList.toggle("staff-mode", !!staff);
  var OWNER_ONLY = /^\/(dashboard|reports|intelligence|integrations|founder)(\/|$)/;
  var viewing = !!(staff && S.storeView && S.storeView()); // supervisor on the owner's dashboard
  if (staff && !viewing && OWNER_ONLY.test(window.location.pathname)) {
    window.location.replace("/team");
    return;
  }

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
  if (pathKey && S && !staff) S.setActivePlatform(pathKey);

  var activeKey = (S && S.activePlatform()) || null;
  var home = staff
    ? "/team"
    : script.getAttribute("data-home") ||
      (activeKey ? S.HOMES[activeKey] : homeFor(readUser().platform));

  // Every "home" link (logo, Dashboard) goes through here, so redrawn menus keep it
  function setHome(url) {
    home = url;
    PAGES.dashboard[1] = url;
    document.querySelectorAll("[data-home]").forEach(function (a) {
      a.setAttribute("href", url);
    });
  }

  // ── what the account can see ───────────────────────────────────────────────
  // Cached so the bar is right on first paint; refreshed from /api/user/me.
  var FOUNDER_KEY = "aervo_founder";
  var TEAM_KEY = "aervo_team"; // the person's team role, if on a team
  var nav$ = {
    founder: stored(FOUNDER_KEY) === "1" || active === "founder",
    teamRole: stored(TEAM_KEY) || (active === "messages" || active === "team-manage" ? "member" : null),
    me: (function () {
      var u = readUser();
      return { name: u.name || u.companyName || "", email: u.email || "", avatarUrl: u.avatarUrl || null };
    })(),
    planNote: null, // { text, href } for a trial countdown / Lite reminder
  };
  if (staff) nav$.teamRole = staff.role;
  var isManager = function (role) { return role === "owner" || role === "supervisor"; };

  // [key, href, icon, label]
  var PAGES = {
    dashboard: ["dashboard", home, "🏠", "Dashboard"],
    home: ["team", "/team", "🏠", "Home"],
    reports: ["reports", "/reports", "📊", "Reports"],
    intelligence: ["intelligence", "/intelligence", "🧠", "Intelligence"],
    integrations: ["integrations", "/integrations", "🔌", "Integrations"],
    team: ["team-manage", "/team/manage", "👥", "Team"],
    messages: ["messages", "/messages", "💬", "Messages"],
    settings: ["settings", "/settings", "⚙️", "Settings"],
    founder: ["founder", "/founder", "🛠️", "Founder console"],
  };

  // Pages in the bar itself
  function primaryPages() {
    if (staff) {
      var dashes = staff.dashboards || [];
      if (!dashes.length) return [PAGES.home];
      var dash = viewing && pathKey ? pathKey : dashes[0];
      return [PAGES.home, ["store", S.HOMES[dash], "📊", "Store dashboard"]];
    }
    var out = [];
    if (active) out.push(PAGES.dashboard); // dashboards have their own tabs
    out.push(PAGES.reports, PAGES.intelligence);
    return out;
  }

  // Groups in the account menu (and the drawer)
  function menuGroups() {
    var workspace = [];
    if (nav$.teamRole && !staff) workspace.push(PAGES.home.slice(0, 3).concat("Team home"));
    if (isManager(nav$.teamRole)) workspace.push(PAGES.team);
    if (!staff) workspace.push(PAGES.integrations);
    var account = [PAGES.settings];
    if (nav$.founder && !staff) account.push(PAGES.founder);
    return [
      ["Workspace", workspace],
      ["Account", account],
    ].filter(function (g) { return g[1].length; });
  }

  var showMessages = function () { return !!nav$.teamRole; };

  function pageLink(cls, p, opts) {
    opts = opts || {};
    var isActive = p[0] === active || (p[0] === "store" && viewing);
    return (
      '<a class="' + cls + (isActive ? " active" : "") + '" href="' + escHtml(p[1]) + '"' +
      (p[0] === "dashboard" ? " data-home" : "") +
      (isActive ? ' aria-current="page"' : "") + ">" +
      '<span class="nav-ico" aria-hidden="true">' + p[2] + "</span>" +
      "<span>" + p[3] + "</span>" +
      (p[0] === "messages" ? '<span class="nav-badge" data-msg-badge hidden></span>' : "") +
      "</a>"
    );
  }

  function initial(text) {
    return escHtml(String(text || "?").trim().charAt(0).toUpperCase() || "?");
  }

  function avatarHtml(cls) {
    var me = nav$.me;
    if (me.avatarUrl && /^https:\/\//.test(me.avatarUrl)) {
      return '<span class="' + cls + '"><img src="' + escHtml(me.avatarUrl) + '" alt="" /></span>';
    }
    return '<span class="' + cls + '" aria-hidden="true">' + initial(me.name || me.email) + "</span>";
  }

  // The store an employee works for, next to the Aervo logo
  function storeBadge(st) {
    var mark = st.logoUrl && /^https:\/\//.test(st.logoUrl)
      ? '<img src="' + escHtml(st.logoUrl) + '" alt="" />'
      : escHtml(String(st.store || "?").trim().charAt(0).toUpperCase());
    return (
      '<span class="nav-store" title="You\'re on the ' + escHtml(st.store) + ' team">' +
      '<span class="nav-store-mark">' + mark + "</span>" +
      '<span class="nav-store-name">' + escHtml(st.store) + "</span></span>"
    );
  }

  // ── markup ─────────────────────────────────────────────────────────────────
  var navHtml =
    '<nav class="nav" id="appNav"' + accentStyle + ' aria-label="Main">' +
    '<a class="nav-brand" data-home href="' + escHtml(home) + '" aria-label="' + (staff ? "Aervo home" : "Aervo dashboard") + '">' +
    '<img class="nav-logo" src="/assets/images/logo.png" alt="Aervo">' +
    (staff ? storeBadge(staff) : slot("appNavBrandExtra")) +
    "</a>" +
    '<div class="nav-center">' + (staff && !viewing ? "" : slot("appNavCenter")) + "</div>" +
    '<div class="nav-right">' +
    '<div class="nav-switch-slot"></div>' +
    (staff ? "" : slot("appNavRightExtra")) +
    '<div class="nav-primary">' + primaryPages().map(function (p) { return pageLink("nav-link", p); }).join("") + "</div>" +
    '<a class="nav-icon-btn' + (active === "messages" ? " active" : "") + '" id="navMessages" href="/messages" aria-label="Messages" title="Messages"' +
    (active === "messages" ? ' aria-current="page"' : "") + (showMessages() ? "" : " hidden") + ">" +
    '<span aria-hidden="true">💬</span><span class="nav-badge nav-badge-dot" data-msg-badge hidden></span></a>' +
    '<div class="nav-dd nav-account" id="navAccount"></div>' +
    '<button type="button" class="nav-menu-btn" id="mobileMenuBtn" aria-label="Menu" aria-expanded="false" aria-controls="mobileMenu">☰</button>' +
    "</div></nav>" +
    '<div class="mobile-menu" id="mobileMenu"' + accentStyle + ">" +
    '<div class="mobile-switch-slot"></div>' +
    (staff && !viewing ? "" : slot("appNavMobile")) +
    '<div class="mobile-links" id="mobileLinks"></div></div>';

  script.insertAdjacentHTML("beforebegin", navHtml);
  if (viewing) {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div class="nav-view-banner" role="status">👁 Viewing ' + escHtml(staff.store) + "'s dashboard · read-only</div>"
    );
  }

  var nav = document.getElementById("appNav");
  var menu = document.getElementById("mobileMenu");
  var btn = document.getElementById("mobileMenuBtn");
  var accountBox = document.getElementById("navAccount");
  var mobileLinks = document.getElementById("mobileLinks");
  var messagesBtn = document.getElementById("navMessages");
  var unreadCount = 0;

  // Account menu + drawer links are redrawn whenever what the account can see changes
  function renderMenus() {
    var groups = menuGroups();
    var inMenu = groups.some(function (g) {
      return g[1].some(function (p) { return p[0] === active; });
    });
    var me = nav$.me;
    var wasOpen = accountBox.classList.contains("open");

    accountBox.innerHTML =
      '<button type="button" class="nav-dd-btn nav-account-btn' + (inMenu ? " active" : "") + '" aria-haspopup="true" aria-expanded="' + wasOpen + '" aria-controls="navAccountMenu" aria-label="Account menu">' +
      avatarHtml("nav-avatar") + '<span class="nav-caret" aria-hidden="true"></span></button>' +
      '<div class="nav-dd-panel" id="navAccountMenu">' +
      '<div class="nav-dd-head">' + avatarHtml("nav-avatar nav-avatar-lg") +
      '<div class="nav-dd-who"><div class="nav-dd-name">' + escHtml(me.name || "Your account") + "</div>" +
      (me.email ? '<div class="nav-dd-email">' + escHtml(me.email) + "</div>" : "") + "</div></div>" +
      (nav$.planNote ? '<a class="nav-dd-plan" href="' + escHtml(nav$.planNote.href) + '">' + escHtml(nav$.planNote.text) + "<span aria-hidden=\"true\">→</span></a>" : "") +
      groups
        .map(function (g) {
          return '<div class="nav-dd-group"><div class="nav-dd-label">' + g[0] + "</div>" +
            g[1].map(function (p) { return pageLink("nav-dd-item", p); }).join("") + "</div>";
        })
        .join("") +
      '<div class="nav-dd-group"><button type="button" class="nav-dd-item" data-logout><span class="nav-ico" aria-hidden="true">↪</span><span>Log out</span></button></div>' +
      "</div>";
    accountBox.classList.toggle("open", wasOpen);

    // Drawer: everyday pages, then the same groups as the account menu
    var go = primaryPages().slice();
    if (showMessages()) go.push(PAGES.messages);
    mobileLinks.innerHTML =
      '<div class="mobile-group">' + go.map(function (p) { return pageLink("mobile-link", p); }).join("") + "</div>" +
      groups
        .map(function (g) {
          return '<div class="mobile-group"><div class="mobile-label">' + g[0] + "</div>" +
            g[1].map(function (p) { return pageLink("mobile-link", p); }).join("") + "</div>";
        })
        .join("") +
      '<div class="mobile-group">' +
      (nav$.planNote ? '<a class="mobile-link mobile-plan" href="' + escHtml(nav$.planNote.href) + '"><span class="nav-ico" aria-hidden="true">✨</span><span>' + escHtml(nav$.planNote.text) + "</span></a>" : "") +
      '<button type="button" class="mobile-link" data-logout><span class="nav-ico" aria-hidden="true">↪</span><span>Log out</span></button></div>';

    messagesBtn.hidden = !showMessages();
    setUnread(unreadCount);
  }

  // ── dropdowns (account menu, store switcher) ─────────────────────────────────
  function closeDropdowns(except) {
    nav.querySelectorAll(".nav-dd.open").forEach(function (dd) {
      if (dd === except) return;
      dd.classList.remove("open");
      var b = dd.querySelector(".nav-dd-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }
  nav.addEventListener("click", function (e) {
    var b = e.target.closest(".nav-dd-btn");
    if (!b) return;
    var dd = b.closest(".nav-dd");
    var open = !dd.classList.contains("open");
    closeDropdowns(dd);
    dd.classList.toggle("open", open);
    b.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      var first = dd.querySelector(".nav-dd-panel a, .nav-dd-panel button");
      if (first && e.detail === 0) first.focus(); // opened from the keyboard
    }
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".nav-dd")) closeDropdowns();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var openDd = nav.querySelector(".nav-dd.open");
    if (openDd) {
      closeDropdowns();
      var b = openDd.querySelector(".nav-dd-btn");
      if (b) b.focus();
    }
    setMenu(false);
  });

  // ── mobile drawer ──────────────────────────────────────────────────────────
  function setMenu(open) {
    menu.classList.toggle("active", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  btn.addEventListener("click", function () {
    setMenu(!menu.classList.contains("active"));
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth > 768) setMenu(false);
  });

  // ── logout ─────────────────────────────────────────────────────────────────
  function logout() {
    // Ends the session on the server too (cookie + every other device's token)
    var done = function () {
      window.location.href = "/login";
    };
    if (window.AervoSession) {
      window.AervoSession.logout().then(done, done);
    } else {
      store("aervo_token", null);
      store("aervo_user", null);
      done();
    }
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("[data-logout]")) logout();
  });

  // ── unread badge ───────────────────────────────────────────────────────────
  function setUnread(n) {
    unreadCount = Math.max(0, Number(n) || 0);
    document.querySelectorAll("[data-msg-badge]").forEach(function (b) {
      b.hidden = !unreadCount;
      b.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    });
    messagesBtn.setAttribute("aria-label", unreadCount ? "Messages, " + unreadCount + " unread" : "Messages");
    btn.classList.toggle("has-unread", unreadCount > 0);
  }

  var token = stored("aervo_token");
  var unreadTimer = null;
  function pollUnread() {
    if (document.hidden) return;
    fetch(API + "/api/messages/unread", { headers: { Authorization: "Bearer " + token, "X-Aervo-Self": "1" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && typeof d.unread === "number") setUnread(d.unread);
      })
      .catch(function () {});
  }
  // The Messages page keeps its own live count; other pages check now and then
  function syncUnreadPolling() {
    var want = showMessages() && active !== "messages" && token;
    if (want && !unreadTimer) {
      pollUnread();
      unreadTimer = setInterval(pollUnread, 60000);
      document.addEventListener("visibilitychange", pollUnread);
    } else if (!want && unreadTimer) {
      clearInterval(unreadTimer);
      unreadTimer = null;
      document.removeEventListener("visibilitychange", pollUnread);
      setUnread(0);
    }
  }

  window.AervoNav = { setUnread: setUnread };

  renderMenus();
  syncUnreadPolling();

  // ── fit the bar ────────────────────────────────────────────────────────────
  // Pages differ a lot (6 tabs on IMS, none on Settings), so measure instead of
  // guessing breakpoints. Steps are applied cumulatively until the content fits:
  //   nav-compact          drop icons, tighten spacing
  //   nav-links-collapsed  the everyday links move into the drawer
  //   nav-tabs-collapsed   view tabs move into the drawer too
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
    // Links animate, so without this the measurements below would read
    // mid-transition sizes and the bar would grow past its box later.
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
    attributeFilter: ["style", "src", "hidden"],
  });
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(queueFit);
    nav.querySelectorAll(".nav-brand, .nav-center, .nav-right").forEach(function (el) {
      Array.prototype.forEach.call(el.children, function (child) {
        ro.observe(child);
      });
    });
  }

  // ── store switcher (Shopify / Square / IMS) ────────────────────────────────
  // Shown when the account has two or more data sources. The last answer is
  // cached so it appears instantly on the next page, then refreshed.
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

  function optionHtml(key, current, cls) {
    var l = LABELS[key];
    return (
      '<button type="button" class="' + cls + (key === current ? " active" : "") +
      '" data-platform="' + key + '" aria-pressed="' + (key === current) + '">' +
      '<span class="nav-ico" aria-hidden="true">' + l[0] + "</span><span>" + l[1] + "</span>" +
      (key === current ? '<span class="nav-check" aria-hidden="true">✓</span>' : "") +
      "</button>"
    );
  }

  function renderSwitcher(avail) {
    var deskSlot = nav.querySelector(".nav-switch-slot");
    var mobSlot = menu.querySelector(".mobile-switch-slot");
    deskSlot.innerHTML = "";
    mobSlot.innerHTML = "";
    if (staff) avail = viewing ? staff.dashboards : [];
    if (!S || !avail || avail.length < 2) return;

    var cur = currentKey(avail);
    var l = LABELS[cur];
    deskSlot.innerHTML =
      '<div class="nav-dd nav-switch">' +
      '<button type="button" class="nav-dd-btn nav-switch-btn" aria-haspopup="true" aria-expanded="false" aria-label="Store: ' + l[1] + '. Switch store">' +
      '<span class="nav-ico" aria-hidden="true">' + l[0] + '</span><span class="nav-switch-name">' + l[1] + '</span><span class="nav-caret" aria-hidden="true"></span></button>' +
      '<div class="nav-dd-panel nav-dd-panel-left"><div class="nav-dd-label">Switch store</div>' +
      avail.map(function (k) { return optionHtml(k, cur, "nav-dd-item"); }).join("") +
      "</div></div>";
    mobSlot.innerHTML =
      '<div class="mobile-group mobile-platforms"><div class="mobile-label">Store</div><div class="mobile-platform-row">' +
      avail.map(function (k) { return optionHtml(k, cur, "platform-opt"); }).join("") +
      "</div></div>";

    // sub-pages (Reports, Settings...) follow the active platform
    if (!script.getAttribute("data-home") && !staff) setHome(S.HOMES[cur]);
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

  // 1) instant render from the last known answer
  try {
    var cached = JSON.parse(stored(CACHE_KEY) || "null");
    if (cached && cached.avail) renderSwitcher(cached.avail);
  } catch (e) {}

  // 2) refresh from the server
  if (token && window.fetch) {
    fetch(API + "/api/user/me", {
      headers: { Authorization: "Bearer " + token, "X-Aervo-Self": "1" }, // this person, even on a store view
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.user) return;
        // Became (or stopped being) an employee since the cached answer: store the
        // new answer and redraw this page once in the right layout
        if (S && S.isStaff) {
          var nowStaff = S.isStaff(d);
          S.rememberStaff(d);
          if (nowStaff !== !!staff) {
            var flag = "aervo_staff_reload";
            var again = false;
            try {
              again = sessionStorage.getItem(flag) === "1";
              sessionStorage.setItem(flag, "1");
            } catch (e) {}
            if (!again) {
              window.location.reload();
              return;
            }
          } else {
            try {
              sessionStorage.removeItem("aervo_staff_reload");
            } catch (e) {}
          }
        }

        var u = d.user;
        var avail = S ? S.platformsFrom(d) : [];
        store(CACHE_KEY, JSON.stringify({ avail: avail, t: Date.now() }));
        var cachedUser = readUser();
        if (u.platform && cachedUser.platform !== u.platform) {
          cachedUser.platform = u.platform;
          store("aervo_user", JSON.stringify(cachedUser));
        }
        renderSwitcher(avail);

        // Founder link (the page and its data are checked on the server)
        store(FOUNDER_KEY, u.isFounder && !staff ? "1" : null);
        store(TEAM_KEY, d.team ? d.team.role : null);
        nav$.founder = (!!u.isFounder || active === "founder") && !staff;
        nav$.teamRole = d.team ? d.team.role : active === "messages" || active === "team-manage" ? "member" : null;
        nav$.me = { name: u.name || u.companyName || "", email: u.email || "", avatarUrl: u.avatarUrl || null };
        // Trial countdown / Lite reminder (nothing for paying accounts or staff)
        nav$.planNote = null;
        if (!staff) {
          if (u.trial) {
            nav$.planNote = { text: "Pro trial · " + u.trial.daysLeft + " day" + (u.trial.daysLeft === 1 ? "" : "s") + " left", href: "/pricing" };
          } else if (u.billingPlan === "free" && u.plan === "free") {
            nav$.planNote = { text: "Lite plan · choose a plan", href: "/pricing" };
          }
        }
        renderMenus();
        syncUnreadPolling();

        if (!script.getAttribute("data-home") && !activeKey && u.platform && avail.length < 2) setHome(homeFor(u.platform));
      })
      .catch(function () {});
  }
})();
