/*
 * Team home (/team): the landing page for employees, people invited onto a
 * business's team who have no store of their own. Shows which store they're
 * connected to, announcements, today's checklists, their tasks, recent
 * conversations and teammates. Reads /api/team, /api/messages/conversations and
 * /api/team/work/* (aervo-backend/routes/teamWork.js); everything people typed
 * goes through esc() before it reaches innerHTML.
 */
(function () {
  var API = "https://api.aervoapp.com";
  var root = document.getElementById("home");
  if (!root) return;

  var ROLE_LABEL = { owner: "Owner", supervisor: "Supervisor", member: "Member" };
  var ROLE_BADGE = { owner: "badge-purple", supervisor: "badge-blue", member: "" };
  var ROLE_ARTICLE = { owner: "the owner", supervisor: "a supervisor", member: "a member" };

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok || data.success === false) {
            var err = new Error(data.message || "Something went wrong. Please try again.");
            err.data = data;
            throw err;
          }
          return data;
        });
    });
  }

  function initial(name) {
    return esc(String(name || "?").trim().charAt(0).toUpperCase() || "?");
  }

  function avatar(person) {
    if (person.avatarUrl && /^https:\/\//.test(person.avatarUrl)) {
      return '<div class="home-avatar"><img src="' + esc(person.avatarUrl) + '" alt="" /></div>';
    }
    return '<div class="home-avatar" aria-hidden="true">' + initial(person.name) + "</div>";
  }

  function shortDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // A supervisor the owner lets view the store gets a way in (read-only)
  function storeButton() {
    var st = window.AervoSession && AervoSession.cachedStaff ? AervoSession.cachedStaff() : null;
    var dash = st && st.dashboards && st.dashboards[0];
    if (!dash) return "";
    return '<a class="btn btn-secondary btn-sm home-store-btn" href="' + AervoSession.HOMES[dash] + '">📊 Open store dashboard <span class="text-muted">· view only</span></a>';
  }

  function heroHtml(team, me) {
    var st = team.store || { name: team.name };
    var mark = st.logoUrl && /^https:\/\//.test(st.logoUrl)
      ? '<img src="' + esc(st.logoUrl) + '" alt="' + esc(st.name) + ' logo" />'
      : initial(st.name);
    var facts = [];
    if (st.businessType) facts.push(esc(st.businessType));
    if (st.location) facts.push("📍 " + esc(st.location));
    var joined = me.joinedAt ? "Joined " + esc(shortDate(me.joinedAt)) : "";
    if (joined && me.invitedBy) joined += " · invited by " + esc(me.invitedBy);
    return (
      '<section class="home-hero">' +
      '<div class="home-mark">' + mark + "</div>" +
      "<div>" +
      '<div class="home-eyebrow">Your workplace</div>' +
      '<h1 class="home-store">' + esc(st.name) + "</h1>" +
      '<div class="home-meta">' +
      '<span class="home-connected">Connected</span>' +
      "<span>You're " + esc(ROLE_ARTICLE[me.role] || "on the team") + " on this team</span>" +
      facts.map(function (f) { return "<span>" + f + "</span>"; }).join("") +
      "</div>" +
      (joined ? '<div class="home-meta text-muted">' + joined + "</div>" : "") +
      storeButton() +
      "</div></section>"
    );
  }

  function messagesHtml(convs, myId) {
    var recent = convs.slice(0, 6);
    var body = recent.length
      ? recent
          .map(function (c) {
            var lm = c.lastMessage;
            var preview = "No messages yet";
            if (lm) {
              var who = lm.userId === myId ? "You: " : c.kind === "group" ? (lm.authorName || "Someone") + ": " : "";
              preview = who + (lm.deleted ? "Message deleted" : lm.body.replace(/\s+/g, " "));
            }
            var other = c.participants.filter(function (p) { return p.userId !== myId; })[0] || {};
            var av = c.kind === "group" ? '<div class="home-avatar group" aria-hidden="true">#</div>' : avatar(other);
            return (
              '<a class="home-row' + (c.unread ? " unread" : "") + '" href="/messages?c=' + c.id + '">' +
              av +
              '<div class="home-who"><div class="home-name">' + esc(c.name) + "</div>" +
              '<div class="home-sub">' + esc(preview) + "</div></div>" +
              (c.unread
                ? '<span class="home-count" aria-label="' + c.unread + ' unread">' + (c.unread > 99 ? "99+" : c.unread) + "</span>"
                : '<span class="home-sub">' + esc(when(lm ? lm.createdAt : c.createdAt)) + "</span>") +
              "</a>"
            );
          })
          .join("")
      : '<div class="empty-state"><div class="empty-state-title">No messages yet</div>' +
        '<div class="empty-state-sub">Say hi to a teammate from the list.</div></div>';
    var unread = convs.reduce(function (n, c) { return n + (c.unread || 0); }, 0);
    return (
      '<section class="card">' +
      '<div class="home-card-head"><h2>Messages' + (unread ? ' <span class="badge badge-blue">' + unread + " new</span>" : "") + "</h2>" +
      '<a class="btn btn-primary btn-sm" href="/messages">Open Messages</a></div>' +
      body +
      "</section>"
    );
  }

  function teamHtml(d, canSend) {
    var people = d.members || [];
    var manage = d.permissions && (d.permissions.inviteRoles || []).length;
    return (
      '<section class="card">' +
      '<div class="home-card-head"><h2>Your team <span class="text-muted">(' + people.length + ")</span></h2>" +
      (manage ? '<a class="btn btn-ghost btn-sm" href="/team/manage">Manage team</a>' : "") +
      "</div>" +
      people
        .map(function (p) {
          return (
            '<div class="home-row">' +
            avatar(p) +
            '<div class="home-who"><div class="home-name">' + esc(p.name) + (p.isYou ? ' <span class="text-muted">(you)</span>' : "") + "</div>" +
            '<div class="home-sub"><span class="badge ' + (ROLE_BADGE[p.role] || "") + '">' + esc(ROLE_LABEL[p.role] || p.role) + "</span></div></div>" +
            (!p.isYou && canSend
              ? '<button type="button" class="btn btn-secondary btn-sm" data-dm="' + p.userId + '" aria-label="Message ' + esc(p.name) + '">💬 Message</button>'
              : "") +
            "</div>"
          );
        })
        .join("") +
      "</section>"
    );
  }

  // ── announcements, today's checklists, my tasks ──────────────────────────
  var work = { announcements: [], checklists: [], tasks: [], date: localDay() };

  // The person's own calendar day (checklists run per local day)
  function localDay() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function dueLabel(iso) {
    if (!iso) return "";
    var today = localDay();
    if (iso === today) return "Due today";
    if (iso < today) return "Overdue · was due " + esc(shortDate(iso + "T12:00:00"));
    return "Due " + esc(shortDate(iso + "T12:00:00"));
  }

  function announcementsHtml() {
    var list = work.announcements;
    if (!list.length) return "";
    var unread = list.filter(function (a) { return !a.read; });
    var shown = unread.length ? unread : list.slice(0, 1);
    return (
      '<section class="card home-ann">' +
      '<div class="home-card-head"><h2>📣 Announcements' + (unread.length ? ' <span class="badge badge-blue">' + unread.length + " new</span>" : "") + "</h2></div>" +
      shown
        .map(function (a) {
          return (
            '<article class="home-ann-item' + (a.read ? "" : " unread") + '">' +
            '<div class="home-ann-body">' + esc(a.body) + "</div>" +
            '<div class="home-ann-meta"><span>' + esc(a.author.name) + " · " + esc(when(a.createdAt)) + "</span>" +
            (a.read ? '<span class="text-muted">Read</span>' : '<button type="button" class="btn btn-primary btn-sm" data-ann-read="' + a.id + '">Got it</button>') +
            "</div></article>"
          );
        })
        .join("") +
      "</section>"
    );
  }

  function todayHtml() {
    var lists = work.checklists;
    var body;
    if (!lists.length) {
      body = '<div class="empty-state"><div class="empty-state-title">Nothing scheduled today</div>' +
        '<div class="empty-state-sub">Checklists from your team will show up here.</div></div>';
    } else {
      body = lists
        .map(function (l) {
          var done = l.items.filter(function (i) { return i.done; }).length;
          var pct = l.items.length ? Math.round((done / l.items.length) * 100) : 0;
          return (
            '<div class="home-list">' +
            '<div class="home-list-head"><span class="home-name">' + esc(l.title) + "</span>" +
            '<span class="home-sub">' + done + " of " + l.items.length + (done === l.items.length ? " · ✅ Done" : "") + "</span></div>" +
            '<div class="home-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' + esc(l.title) + ' progress"><div style="width:' + pct + '%"></div></div>' +
            l.items
              .map(function (i) {
                return (
                  '<label class="home-check' + (i.done ? " done" : "") + '">' +
                  '<input type="checkbox" data-item="' + i.id + '"' + (i.done ? " checked" : "") + " />" +
                  '<span class="home-check-text">' + esc(i.text) + "</span>" +
                  (i.done ? '<span class="home-check-who">' + esc(i.doneBy.name) + "</span>" : "") +
                  "</label>"
                );
              })
              .join("") +
            "</div>"
          );
        })
        .join("");
    }
    return '<section class="card"><div class="home-card-head"><h2>✅ Today\'s checklists</h2></div>' + body + "</section>";
  }

  function tasksHtml() {
    var open = work.tasks.filter(function (t) { return !t.done; });
    var done = work.tasks.filter(function (t) { return t.done; }).slice(0, 5);
    var row = function (t) {
      var late = !t.done && t.dueDate && t.dueDate < localDay();
      return (
        '<label class="home-check' + (t.done ? " done" : "") + '">' +
        '<input type="checkbox" data-task="' + t.id + '"' + (t.done ? " checked" : "") + (t.canComplete ? "" : " disabled") + " />" +
        '<span class="home-check-text">' + esc(t.title) +
        (t.notes ? '<span class="home-sub home-task-notes">' + esc(t.notes) + "</span>" : "") +
        '<span class="home-sub' + (late ? " text-danger" : "") + '">' +
        (t.done ? "Done by " + esc(t.doneBy) : [dueLabel(t.dueDate), t.assignee ? "" : "Anyone can do this"].filter(Boolean).join(" · ")) +
        "</span></span></label>"
      );
    };
    return (
      '<section class="card"><div class="home-card-head"><h2>📝 My tasks' + (open.length ? ' <span class="text-muted">(' + open.length + ")</span>" : "") + "</h2></div>" +
      (open.length || done.length
        ? open.map(row).join("") + (done.length ? '<div class="home-done-label">Recently done</div>' + done.map(row).join("") : "")
        : '<div class="empty-state"><div class="empty-state-title">No tasks right now</div></div>') +
      "</section>"
    );
  }

  function renderWork() {
    var a = document.getElementById("homeAnn");
    if (a) a.innerHTML = announcementsHtml();
    var t = document.getElementById("homeToday");
    if (t) t.innerHTML = todayHtml();
    var k = document.getElementById("homeTasks");
    if (k) k.innerHTML = tasksHtml();
  }

  function loadWork() {
    work.date = localDay();
    return Promise.all([
      api("GET", "/api/team/work/announcements"),
      api("GET", "/api/team/work/checklists/today?date=" + work.date),
      api("GET", "/api/team/work/tasks"),
    ]).then(function (r) {
      work.announcements = r[0].announcements || [];
      work.checklists = r[1].checklists || [];
      work.tasks = r[2].tasks || [];
      renderWork();
    });
  }

  function render(teamData, msgData) {
    var team = teamData.team;
    var me = teamData.me;
    var st = team.store || { name: team.name };
    document.title = st.name + " · Aervo";
    var canSend = !!(msgData.team && msgData.team.canSend);
    root.innerHTML =
      heroHtml(team, me) +
      '<div id="homeAnn"></div>' +
      '<div class="home-grid">' +
      '<div class="home-col"><div id="homeToday"></div><div id="homeTasks"></div></div>' +
      '<div class="home-col">' + messagesHtml(msgData.conversations || [], me.userId) + teamHtml(teamData, canSend) + "</div>" +
      "</div>" +
      '<p class="home-note">' +
      (me.managed
        ? "Your Aervo account is managed by " + esc(st.name) + ". For account changes, talk to the owner or a supervisor."
        : "You're on " + esc(st.name) + "'s team with your own Aervo account. You can leave the team from " +
          '<a class="link" href="/settings?section=team">Settings → Team</a>.') +
      "</p>";
    renderWork();
  }

  // Tick a checklist item / finish a task / acknowledge an announcement
  root.addEventListener("change", function (e) {
    var el = e.target;
    var item = el.getAttribute("data-item");
    var task = el.getAttribute("data-task");
    if (!item && !task) return;
    el.disabled = true;
    var call = item
      ? api("POST", "/api/team/work/checklists/items/" + item + "/check", { date: work.date, done: el.checked })
      : api("PATCH", "/api/team/work/tasks/" + task, { done: el.checked });
    call
      .catch(function (err) {
        showToast(err.message, "error");
      })
      .then(loadWork);
  });

  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-ann-read]");
    if (!b) return;
    b.disabled = true;
    api("POST", "/api/team/work/announcements/" + b.getAttribute("data-ann-read") + "/read")
      .catch(function (err) {
        showToast(err.message, "error");
      })
      .then(loadWork);
  });

  // Keep the page current: when the tab comes back and every minute while open
  var lastLoad = Date.now();
  function refresh() {
    if (document.hidden || Date.now() - lastLoad < 5000) return;
    lastLoad = Date.now();
    loadWork().catch(function () {});
  }
  document.addEventListener("visibilitychange", refresh);
  setInterval(refresh, 60000);

  Promise.all([api("GET", "/api/team"), api("GET", "/api/messages/conversations")])
    .then(function (r) {
      if (!r[0].team) {
        // Not on a team (left, or the team was deleted)
        window.location.replace("/settings?section=team");
        return;
      }
      render(r[0], r[1]);
      return loadWork();
    })
    .catch(function (err) {
      root.innerHTML = '<div class="empty-state">' + esc(err.message) + "</div>";
    });
})();
