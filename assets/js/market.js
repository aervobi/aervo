/*
 * Intelligence Center → Local Market tab.
 * Data: aervo-backend/routes/market.js (/api/market/area, /briefing, /forecast, /trending,
 * /competitors, /snapshot).
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
      '<section class="mk-panel mk-brief mk-span-12" id="mkBriefing" aria-label="This week"></section>' +
      '<section class="mk-panel mk-span-8" id="mkForecast" aria-label="Next 7 days"></section>' +
      '<section class="mk-panel mk-span-4" id="mkTrending" aria-label="Trending near you"></section>' +
      '<section class="mk-panel mk-span-12" id="mkRadar" aria-label="Competitor radar"></section>' +
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

  // ── weekly briefing ─────────────────────────────────────────────────────
  var KIND_ICON = { event: "🎟️", trend: "📈", news: "📰", economy: "💵", competition: "🏪", weather: "🌦️", yours: "📊", other: "📌" };
  var pollTimer = null;
  var polls = 0;

  function safeUrl(u) {
    try {
      var x = new URL(u);
      return x.protocol === "https:" || x.protocol === "http:" ? x.href : null;
    } catch (e) {
      return null;
    }
  }
  function sourceChips(sources) {
    return (sources || [])
      .map(function (s) {
        var href = s.url && safeUrl(s.url);
        var label = s.title || (href ? new URL(href).host : "");
        return href
          ? '<a class="mk-src" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" title="' + esc(label) + '">' + esc(label) + "</a>"
          : '<span class="mk-src">' + esc(label) + "</span>";
      })
      .join("");
  }
  function itemHtml(it) {
    return (
      '<li class="mk-brief-item' + (it.kind === "yours" ? " yours" : "") + '">' +
      '<span class="mk-brief-ico" aria-hidden="true">' + (KIND_ICON[it.kind] || KIND_ICON.other) + "</span>" +
      '<div style="min-width:0"><b>' + esc(it.title) + "</b><p>" + esc(it.body) + "</p>" +
      (it.action ? '<div class="mk-brief-action">→ ' + esc(it.action) + "</div>" : "") +
      '<div class="mk-srcs">' + sourceChips(it.sources) + "</div></div></li>"
    );
  }

  function renderBriefing(d) {
    var el = document.getElementById("mkBriefing");
    if (!el) return;
    var a = state.area;
    var city = a ? a.city : "your area";
    var day = function (x, opts) {
      return new Date(x + "T12:00:00").toLocaleDateString(undefined, opts || { month: "short", day: "numeric" });
    };
    var next = d.nextBriefing ? day(d.nextBriefing, { weekday: "long", month: "short", day: "numeric" }) : "Monday";
    var sub = [city + (a && a.categoryLabel ? " · " + a.categoryLabel : "")];
    if (d.briefWeek) sub.push("week of " + day(d.briefWeek));
    sub.push("next brief " + next);
    var head =
      '<div class="mk-panel-head"><div><div class="mk-brief-title">Weekly Marketing Brief</div>' +
      '<div class="mk-sub">' + esc(sub.join(" · ")) + "</div></div>" +
      '<span class="mk-tier">Essential+</span></div>';

    if (d.__status === 403) return (el.innerHTML = head + lockedHtml("The Weekly Marketing Brief", d, "Every Monday: local events, news and trends that affect your store, with the marketing move to make and a source for every point."));
    if (!d.success) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.message || "Your Weekly Marketing Brief isn't available right now.") + "</p>");
    if (d.needsSetup) return (el.innerHTML = head + '<p class="mk-empty">Set your store\'s ZIP code above to get your Weekly Marketing Brief.</p>');
    if (d.unavailable) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.unavailable) + "</p>");

    var items = [];
    if (d.yourWeek) items.push(d.yourWeek);
    if (d.briefing) items = items.concat(d.briefing.items || []);

    var body = "";
    if (d.status === "scheduled") {
      body += '<p class="mk-empty">Your brief for ' + esc(city) + " arrives " + esc(next) + ". Briefs are researched once a week" + (d.briefing ? "; here's the latest one meanwhile." : ".") + "</p>";
    } else if (d.status === "paused") {
      body += '<p class="mk-empty">Your next brief is on its way' + (d.briefing ? "; here's the latest one meanwhile." : ". Check back soon.") + "</p>";
    } else if (d.status === "failed") {
      body += '<p class="mk-empty">We couldn\'t finish this week\'s research yet. We\'ll try again shortly.</p>';
    } else if (d.status !== "ready") {
      body += '<div class="mk-preparing"><span class="spinner-sm" aria-hidden="true"></span>Preparing your Weekly Marketing Brief for ' + esc(city) + ". This takes a minute or two…</div>";
    }
    if (d.briefing && d.briefing.headline) body += '<p class="mk-headline">' + esc(d.briefing.headline) + "</p>";
    if (items.length) body += '<ul class="mk-brief-list">' + items.map(itemHtml).join("") + "</ul>";
    if (d.briefing) {
      body +=
        '<div class="mk-note">A new brief every Monday. Every point links to where we found it; written by Aervo AI from public sources' +
        (d.briefing.generatedAt ? " on " + esc(new Date(d.briefing.generatedAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })) : "") +
        ". Double-check dates before you act.</div>";
    }
    el.innerHTML = head + body;

    // Still being prepared: check back for a few minutes
    clearTimeout(pollTimer);
    if (d.status === "preparing" && polls < 12) {
      polls++;
      pollTimer = setTimeout(function () {
        call("GET", "/api/market/briefing").then(renderBriefing);
      }, 15000);
    }
  }

  // ── trending near you ───────────────────────────────────────────────────
  var TYPE_ICON = [
    [/coffee|cafe/i, "☕"], [/bakery|dessert|ice cream/i, "🥐"], [/bar|pub|brew/i, "🍺"], [/restaurant|food|grill|taco|pizza|takeaway/i, "🍽️"],
    [/gym|fitness|yoga/i, "🏋️"], [/salon|barber|beauty|nail/i, "💇"], [/clothing|shoe|gift|book|store|shop/i, "🛍️"],
  ];
  function typeIcon(t) {
    for (var i = 0; i < TYPE_ICON.length; i++) if (TYPE_ICON[i][0].test(t || "")) return TYPE_ICON[i][1];
    return "📍";
  }
  function placeLink(p, label) {
    var href = p.mapsUrl && safeUrl(p.mapsUrl);
    return href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>" : esc(label);
  }

  function renderTrending(d) {
    var el = document.getElementById("mkTrending");
    if (!el) return;
    var head = panelHead("Trending near you", "Fastest-growing spots within " + ((d && d.radiusMiles) || 3) + " miles", "Pro");
    if (d.__status === 403) return (el.innerHTML = head + lockedHtml("Trending near you", d, "New openings and the fastest-growing spots around your store."));
    if (!d.success) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.message || "Not available right now.") + "</p>");
    if (d.needsSetup) return (el.innerHTML = head + '<p class="mk-empty">Set your store\'s ZIP code above to see what\'s trending.</p>');
    if (d.unavailable) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.unavailable) + "</p>");
    var places = d.places || [];
    if (d.mode === "popular") head = panelHead("Popular near you", "Most-loved spots within " + d.radiusMiles + " miles", "Pro");
    var rows = places
      .map(function (p) {
        var badge = p.isNew ? "New nearby" : d.mode === "trending" && p.growth > 0 ? "+" + fmt(p.growth) + " reviews" : p.rating != null ? "★ " + p.rating : "";
        return (
          '<div class="mk-trend">' +
          '<div class="mk-trend-ico" aria-hidden="true">' + typeIcon(p.type) + "</div>" +
          '<div class="mk-trend-main"><div class="mk-trend-name">' + placeLink(p, p.name) + "</div>" +
          '<div class="mk-trend-sub">' + (p.sameCategory ? '<span class="mk-pill">Like you</span> ' : "") +
          esc([p.type, p.miles != null ? p.miles + " mi" : null, d.mode === "popular" ? fmt(p.reviews) + " reviews" : null].filter(Boolean).join(" · ")) + "</div></div>" +
          '<div class="mk-trend-badge">' + esc(badge) + "</div></div>"
        );
      })
      .join("");
    var note =
      d.mode === "popular"
        ? "We started watching review growth here on " + new Date(d.trackingSince + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ". Fast risers and new openings show up after a week."
        : "Growth = new Google reviews over the last few weeks.";
    el.innerHTML = head + (rows ? '<div class="mk-trend-list">' + rows + "</div>" : '<p class="mk-empty">Nothing stands out nearby yet.</p>') + '<div class="mk-note">' + esc(note) + " Source: Google Maps.</div>";
  }

  // ── competitor radar ────────────────────────────────────────────────────
  function radarSvg(d) {
    var R = 96, C = 110, max = d.radiusMiles || 2;
    var dots = (d.competitors || [])
      .map(function (c, i) {
        var r = Math.min(c.miles / max, 1) * R;
        var rad = (c.bearing * Math.PI) / 180;
        var x = C + r * Math.sin(rad), y = C - r * Math.cos(rad);
        var letter = String.fromCharCode(65 + i);
        return (
          '<g><title>' + esc(letter + " · " + c.name + " · " + c.miles + " mi") + "</title>" +
          '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="7" fill="var(--primary-from)" stroke="var(--bg)" stroke-width="2"/>' +
          '<text x="' + x.toFixed(1) + '" y="' + (y - 11).toFixed(1) + '" fill="var(--text-secondary)" font-size="9" text-anchor="middle">' + letter + "</text></g>"
        );
      })
      .join("");
    return (
      '<svg viewBox="0 0 220 220" role="img" aria-label="Map of nearby competitors around your store">' +
      '<circle cx="110" cy="110" r="96" fill="none" stroke="var(--border)"/>' +
      '<circle cx="110" cy="110" r="48" fill="none" stroke="var(--border)"/>' +
      '<text x="110" y="10" fill="var(--text-muted)" font-size="9" text-anchor="middle">' + max + " mi</text>" +
      '<text x="110" y="58" fill="var(--text-muted)" font-size="9" text-anchor="middle">' + max / 2 + " mi</text>" +
      '<circle cx="110" cy="110" r="9" fill="var(--primary-to)"/>' +
      '<text x="110" y="134" fill="var(--text)" font-size="10" text-anchor="middle" font-weight="700">You</text>' +
      dots + "</svg>"
    );
  }

  function renderRadar(d) {
    var el = document.getElementById("mkRadar");
    if (!el) return;
    var head = panelHead("Competitor radar", "Businesses like yours within " + ((d && d.radiusMiles) || 2) + " miles, and what their customers say", "Pro");
    if (d.__status === 403) return (el.innerHTML = head + lockedHtml("Competitor radar", d, "See nearby competitors and what their customers praise and complain about."));
    if (!d.success) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.message || "Not available right now.") + "</p>");
    if (d.needsSetup) return (el.innerHTML = head + '<p class="mk-empty">Set your store\'s ZIP code above to see competitors.</p>');
    if (d.unavailable) return (el.innerHTML = head + '<p class="mk-empty">' + esc(d.unavailable) + "</p>");
    var list = (d.competitors || [])
      .map(function (c, i) {
        var chips = (c.praised || []).map(function (t) { return '<span class="mk-theme pos">' + esc(t) + "</span>"; })
          .concat((c.complaints || []).map(function (t) { return '<span class="mk-theme neg">' + esc(t) + "</span>"; }))
          .join("");
        return (
          '<div class="mk-comp">' +
          '<div><div class="mk-comp-name">' + String.fromCharCode(65 + i) + " · " + placeLink(c, c.name) + "</div>" +
          '<div class="mk-comp-meta">' + esc([c.miles + " mi", c.price, c.type].filter(Boolean).join(" · ")) + "</div></div>" +
          '<div class="mk-comp-rating">' + (c.rating != null ? "★ " + esc(c.rating) : "—") + '<div class="mk-comp-meta">' + fmt(c.reviews) + " reviews</div></div>" +
          (chips ? '<div class="mk-themes">' + chips + "</div>" : "") +
          "</div>"
        );
      })
      .join("");
    if (!list) return (el.innerHTML = head + '<p class="mk-empty">We didn\'t find businesses like yours within ' + d.radiusMiles + " miles.</p>");
    var own = d.own && d.own.rating ? "You: ★ " + d.own.rating + " from " + fmt(d.own.reviews) + " reviews. " : "";
    el.innerHTML =
      head +
      '<div class="mk-radar">' + radarSvg(d) + '<div class="mk-comp-list">' + list + "</div></div>" +
      (d.edge ? '<div class="mk-edge"><strong>Your opening:</strong> ' + esc(d.edge) + "</div>" : "") +
      '<div class="mk-note">' + esc(own) +
      (d.exactLocation ? "" : "Distances are from the middle of your ZIP code; link your Google listing (Google Reviews) for exact distances. ") +
      "Ratings and reviews from Google Maps; themes summarized by Aervo AI from recent public reviews. Updated weekly.</div>";
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
      polls = 0;
      call("GET", "/api/market/briefing").then(renderBriefing);
      call("GET", "/api/market/forecast").then(renderForecast);
      call("GET", "/api/market/trending").then(renderTrending);
      call("GET", "/api/market/competitors").then(renderRadar);
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
