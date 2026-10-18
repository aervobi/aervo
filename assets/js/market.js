/*
 * Intelligence Center → Local Market tab.
 * Data: aervo-backend/routes/market.js (/api/market/area, /snapshot, /forecast).
 * Plan limits are enforced by the server; a 403 PLAN_LIMIT shows an upgrade card
 * in that panel. Everything from the server goes through esc() before innerHTML.
 */
(function () {
  var API = "https://api.aervoapp.com";
  var root = document.getElementById("section-market");
  if (!root) return;

  var state = { area: null, categories: {}, forecast: null, sel: 0 };

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function call(method, path, body) {
    return fetch(API + path, {
      method: method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (d) {
          d.__status = r.status;
          return d;
        });
    });
  }
  var fmt = function (n) {
    return n == null ? "—" : Number(n).toLocaleString();
  };
  var money = function (n) {
    return n == null ? "—" : "$" + Math.round(n / 1000) + "K";
  };
  var pctTxt = function (n) {
    return n == null ? "—" : n + "%";
  };

  function lockedHtml(title, data, bullets) {
    var plan = (data && data.requiredPlanName) || "a higher plan";
    return (
      '<div class="mk-locked">' +
      '<div aria-hidden="true">🔒</div>' +
      "<p>" + esc(title) + " is included with " + esc(plan) + " and above.</p>" +
      (bullets ? '<p class="mk-note">' + esc(bullets) + "</p>" : "") +
      '<a class="btn btn-primary btn-sm" href="/pricing">See plans</a>' +
      "</div>"
    );
  }

  // ── layout ──────────────────────────────────────────────────────────────
  function shell() {
    var a = state.area;
    root.innerHTML =
      '<div class="mk-head">' +
      '<div class="mk-chips">' +
      (a
        ? '<span class="mk-chip">📍 <strong>' + esc(a.city) + ", " + esc(a.state) + "</strong>" + (a.zip ? " · " + esc(a.zip) : "") + "</span>" +
          '<span class="mk-chip">' + esc(a.categoryLabel) + "</span>" +
          '<span class="mk-chip live">Live data</span>'
        : '<span class="mk-chip">📍 Set your store\'s area to get started</span>') +
      "</div>" +
      '<button class="btn btn-ghost btn-sm" type="button" id="mkEditArea">' + (a ? "Change area or category" : "Set area") + "</button>" +
      "</div>" +
      '<form class="mk-panel" id="mkAreaForm" hidden>' +
      '<div class="mk-form">' +
      '<div><label for="mkZip">Store ZIP code</label><input class="input" id="mkZip" inputmode="numeric" maxlength="5" placeholder="79912" value="' + esc(a && a.zip) + '"/></div>' +
      '<div><label for="mkCat">Business type</label><select class="input" id="mkCat">' +
      Object.keys(state.categories)
        .map(function (k) {
          return '<option value="' + esc(k) + '"' + (a && a.category === k ? " selected" : "") + ">" + esc(state.categories[k]) + "</option>";
        })
        .join("") +
      "</select></div>" +
      '<button class="btn btn-primary btn-sm" type="submit">Save</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="mkCancel">Cancel</button>' +
      "</div>" +
      '<div class="mk-note">We use your area for local data and weather. It isn\'t shown to anyone else.</div>' +
      "</form>" +
      '<div class="mk-grid">' +
      '<section class="mk-panel mk-span-8" id="mkForecast" aria-label="Next 7 days"></section>' +
      '<section class="mk-panel mk-span-4" aria-label="Coming next">' +
      '<div class="mk-panel-head"><div><div class="mk-title">Coming next</div><div class="mk-sub">More of your local market, rolling out soon</div></div></div>' +
      '<ul class="mk-soon">' +
      '<li><span aria-hidden="true">📰</span><div><b>Weekly AI briefing</b>Local news, trends and events that affect your store, with sources.</div></li>' +
      '<li><span aria-hidden="true">🎯</span><div><b>Competitor radar</b>Nearby businesses like yours and what their customers say.</div></li>' +
      '<li><span aria-hidden="true">🔥</span><div><b>Trending near you</b>New openings and the fastest-growing spots around you.</div></li>' +
      '<li><span aria-hidden="true">💡</span><div><b>Opportunities</b>Gaps in your market that fit what you do well.</div></li>' +
      "</ul></section>" +
      '<section class="mk-panel mk-span-12" id="mkSnapshot" aria-label="Your area at a glance"></section>' +
      "</div>";

    var form = document.getElementById("mkAreaForm");
    document.getElementById("mkEditArea").addEventListener("click", function () {
      form.hidden = !form.hidden;
      if (!form.hidden) document.getElementById("mkZip").focus();
    });
    document.getElementById("mkCancel").addEventListener("click", function () {
      form.hidden = true;
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      call("PUT", "/api/market/area", {
        zip: document.getElementById("mkZip").value.trim(),
        category: document.getElementById("mkCat").value,
      }).then(function (d) {
        btn.disabled = false;
        if (!d.success) return showToast(d.message || "Couldn't save your area.", "error");
        showToast("Area saved", "success");
        load();
      });
    });
  }

  function panelHead(title, sub, tier) {
    return (
      '<div class="mk-panel-head"><div><div class="mk-title">' + esc(title) + '</div><div class="mk-sub">' + esc(sub) + "</div></div>" +
      (tier ? '<span class="mk-tier ' + (tier === "Pro" ? "pro" : "") + '">' + esc(tier) + "</span>" : "") +
      "</div>"
    );
  }

  // ── forecast ────────────────────────────────────────────────────────────
  function renderForecast(d) {
    var el = document.getElementById("mkForecast");
    var head = panelHead("Next 7 days: expected traffic", "Weather, paydays and holidays, measured against your own sales", "Pro");
    if (d.__status === 403) return (el.innerHTML = head + lockedHtml("The 7-day forecast", d, "See busy and slow days coming, with what to do about them."));
    if (!d.success) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.message || "The forecast isn't available right now.") + "</p>");
    if (d.needsSetup) return (el.innerHTML = head + '<p class="mk-empty">Set your store\'s ZIP code above to see your forecast.</p>');

    state.forecast = d;
    var days = d.days || [];
    var vals = days.map(function (x) {
      return x.pct == null ? 0 : x.pct;
    });
    var hasPct = days.some(function (x) {
      return x.pct != null;
    });
    var maxAbs = Math.max.apply(null, vals.map(function (v) { return 100 + v; }).concat([100]));
    var note =
      d.basis.confidence === "none"
        ? "Connect Square or add sales in IMS and this becomes a forecast of your own traffic. For now it shows weather and holidays."
        : d.basis.confidence === "early"
        ? "Early forecast: it gets sharper after 6 weeks of sales."
        : "Based on " + d.basis.salesDays + " days of your sales. % is compared with your average day.";

    el.innerHTML =
      head +
      '<div class="mk-days" role="list">' +
      days
        .map(function (x, i) {
          var h = x.pct == null ? 0 : Math.max(6, Math.round(((100 + x.pct) / maxAbs) * 100));
          var tag = (x.reasons || []).filter(function (r) { return r.kind !== "weekday"; })[0];
          return (
            '<button type="button" class="mk-day" role="listitem" data-i="' + i + '" aria-label="' + esc(x.weekday + ": " + x.title) + '">' +
            '<span class="mk-day-name">' + esc(x.weekday) + "</span>" +
            '<span class="mk-day-wx" title="' + esc(x.weather.label) + '">' + esc(x.weather.icon) + "</span>" +
            '<span class="mk-day-temp">' + (x.weather.tmax != null ? esc(x.weather.tmax) + "°" : "") + "</span>" +
            (hasPct
              ? '<span class="mk-bar-wrap">' + (x.pct == null ? "" : '<span class="mk-bar' + (x.pct < 0 ? " low" : "") + '" style="height:' + h + '%"></span>') + "</span>" +
                '<span class="mk-delta ' + (x.pct == null ? "" : x.pct >= 0 ? "mk-up" : "mk-down") + '">' +
                (x.closed ? "Closed" : x.pct == null ? "—" : (x.pct >= 0 ? "+" : "") + x.pct + "%") + "</span>"
              : "") +
            '<span class="mk-tag">' + esc(tag ? (tag.kind === "rain" ? "Rain" : tag.kind === "payday" ? "Payday" : tag.kind === "heat" ? "Heat" : tag.text) : "") + "</span>" +
            "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="mk-detail" id="mkDayDetail"></div>' +
      '<div class="mk-note">' + esc(note) + " · " + esc((d.sources || []).join(" · ")) + "</div>";

    el.querySelector(".mk-days").addEventListener("click", function (e) {
      var b = e.target.closest(".mk-day");
      if (b) pickDay(Number(b.getAttribute("data-i")));
    });
    // open on the most notable day
    var best = 0;
    days.forEach(function (x, i) {
      if (Math.abs(x.pct || 0) > Math.abs(days[best].pct || 0)) best = i;
    });
    pickDay(best);
  }

  function pickDay(i) {
    var d = state.forecast;
    if (!d) return;
    var x = d.days[i];
    document.querySelectorAll("#mkForecast .mk-day").forEach(function (b, j) {
      b.classList.toggle("sel", i === j);
    });
    var reasons = (x.reasons || [])
      .map(function (r) {
        return "<li>" + esc(r.text) + (r.effect != null ? " (" + (r.effect >= 0 ? "+" : "") + r.effect + "%)" : "") + " <em>· " + esc(r.basis) + "</em></li>";
      })
      .join("");
    var date = new Date(x.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    document.getElementById("mkDayDetail").innerHTML =
      "<div><h4>" + esc(date) + " · " + esc(x.title) + "</h4>" +
      (reasons ? '<ul class="mk-reasons">' + reasons + "</ul>" : '<p class="mk-note">' + esc(x.weather.label) + (x.weather.precipProb != null ? ", " + x.weather.precipProb + "% chance of rain" : "") + "</p>") +
      "</div>" +
      (x.action ? '<span class="mk-action">' + esc(x.action) + "</span>" : "");
  }

  // ── snapshot ────────────────────────────────────────────────────────────
  function renderSnapshot(d) {
    var el = document.getElementById("mkSnapshot");
    var a = state.area;
    var head = panelHead((a ? a.city : "Your area") + " at a glance", "Public data for the people who live around your store", "Essential+");
    if (d.__status === 403) return (el.innerHTML = head + lockedHtml("Local market data", d, "Who lives around your store, and what that means for you."));
    if (!d.success) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.message || "Local data isn't available right now.") + "</p>");
    if (d.needsSetup) return (el.innerHTML = head + '<p class="mk-empty">Set your store\'s ZIP code above to see local data.</p>');
    if (d.unavailable) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.unavailable) + "</p>");

    var s = d.snapshot;
    var A = s.area;
    var U = s.us;
    var vs = function (a1, u1, unit) {
      if (a1 == null || u1 == null) return "";
      return "US: " + (unit === "$" ? money(u1) : unit === "%" ? pctTxt(u1) : fmt(u1));
    };
    el.innerHTML =
      head +
      '<div class="mk-stats">' +
      stat("People in your ZIP", fmt(A.population), "") +
      stat("Median age", A.medianAge != null ? A.medianAge : "—", vs(A.medianAge, U.medianAge)) +
      stat("Household income", money(A.medianIncome), vs(A.medianIncome, U.medianIncome, "$")) +
      stat("Hispanic / Latino", pctTxt(A.hispanicPct), vs(A.hispanicPct, U.hispanicPct, "%")) +
      stat("Bachelor's degree+", pctTxt(A.degreePct), vs(A.degreePct, U.degreePct, "%")) +
      stat("Renters", pctTxt(A.rentersPct), vs(A.rentersPct, U.rentersPct, "%")) +
      "</div>" +
      (s.localAngle ? '<div class="mk-angle"><strong>Local angle:</strong> ' + esc(s.localAngle) + "</div>" : "") +
      '<div class="mk-note">Source: ' + esc(s.source) + (s.localAngle ? ". Local angle written by Aervo AI from these figures." : "") + "</div>";
  }
  function stat(label, value, note) {
    return (
      '<div class="mk-stat"><div class="mk-stat-label">' + esc(label) + '</div><div class="mk-stat-value">' + esc(value) + "</div>" +
      '<div class="mk-stat-note">' + esc(note) + "</div></div>"
    );
  }

  // ── load ────────────────────────────────────────────────────────────────
  function load() {
    root.innerHTML = '<div class="mk-panel"><p class="mk-empty">Loading your local market…</p></div>';
    return call("GET", "/api/market/area").then(function (a) {
      state.area = a.area || null;
      state.categories = a.categories || {};
      shell();
      if (!state.area) document.getElementById("mkAreaForm").hidden = false;
      call("GET", "/api/market/forecast").then(renderForecast);
      call("GET", "/api/market/snapshot").then(renderSnapshot);
    });
  }

  var loaded = false;
  window.AervoMarket = {
    // called when the tab is opened (loads once)
    show: function () {
      if (loaded) return;
      loaded = true;
      load();
    },
  };
  // The page may have opened this tab before this script loaded
  if (root.style.display !== "none") window.AervoMarket.show();
})();
