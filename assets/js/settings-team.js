/*
 * Settings → Team. Talks to the backend /api/team routes (aervo-backend/routes/team.js).
 * This is a summary (and the create-team / leave flows); managing people is on
 * /team/manage. The server decides what each role may do. Everything a user typed (names,
 * emails, team name) goes through esc() before it reaches innerHTML.
 */
(function () {
  var API = "https://api.aervoapp.com";
  var root = document.getElementById("teamRoot");
  if (!root) return;

  var state = null; // last GET /api/team response
  var ROLE_LABEL = { owner: "Owner", supervisor: "Supervisor", member: "Member" };
  var ROLE_BADGE = { owner: "badge-purple", supervisor: "badge-blue", member: "" };

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

  function avatar(person) {
    if (person.avatarUrl && /^https:\/\//.test(person.avatarUrl)) {
      return '<div class="team-avatar"><img src="' + esc(person.avatarUrl) + '" alt="" /></div>';
    }
    return '<div class="team-avatar">' + esc((person.name || person.email || "?").trim().charAt(0).toUpperCase()) + "</div>";
  }

  function roleBadge(role) {
    return '<span class="badge ' + (ROLE_BADGE[role] || "") + '">' + esc(ROLE_LABEL[role] || role) + "</span>";
  }

  // ── views ──────────────────────────────────────────────────────────────

  function renderUpsell() {
    root.innerHTML =
      '<div class="card">' +
      '<div class="card-title"><span class="card-title-icon">👥</span> Teams are on Pro and Business</div>' +
      '<p class="text-muted mb-6">Invite your staff, give supervisors the power to manage them, and message each other in Aervo. ' +
      "Pro includes 10 seats and Business includes 50.</p>" +
      '<a href="/pricing" class="btn btn-primary btn-sm">See plans</a>' +
      "</div>";
  }

  function renderCreate(suggested) {
    root.innerHTML =
      '<div class="card">' +
      '<div class="card-title"><span class="card-title-icon">✨</span> Create your team</div>' +
      '<p class="text-muted mb-6">You\'ll be the owner. You can invite people right after.</p>' +
      '<form id="teamCreateForm" class="form-grid full">' +
      '<div class="form-group"><label for="teamNameNew">Team name</label>' +
      '<input id="teamNameNew" maxlength="60" required placeholder="e.g. Downtown store" value="' + esc(suggested) + '" /></div>' +
      '<div class="form-actions"><button class="btn btn-primary btn-sm" type="submit">Create team</button></div>' +
      "</form></div>";
    document.getElementById("teamCreateForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = e.target.querySelector("button");
      btn.disabled = true;
      api("POST", "/api/team", { name: document.getElementById("teamNameNew").value })
        .then(function () {
          showToast("Team created", "success");
          return load();
        })
        .catch(function (err) {
          showToast(err.message, "error");
          btn.disabled = false;
        });
    });
  }

  // Settings shows a summary. Adding, removing and managing people happens on
  // the Team management page (/team/manage, assets/js/team-manage.js).
  function renderTeam(d) {
    var t = d.team;
    var p = d.permissions;
    var manager = p.viewInvites;
    var pct = t.seats.limit ? Math.min(100, Math.round((t.seats.used / t.seats.limit) * 100)) : 100;
    var html = "";

    html +=
      '<div class="card"><div class="team-head"><div>' +
      '<div class="team-name">' + esc(t.name) + "</div>" +
      '<div class="text-muted">You are ' + (d.me.role === "owner" ? "the owner" : "a " + esc(ROLE_LABEL[d.me.role]).toLowerCase()) + "</div>" +
      "</div>" +
      (manager
        ? '<div class="team-seats">' + t.seats.used + " of " + t.seats.limit + " seats used" +
          '<div class="team-seat-bar"><div class="team-seat-fill" style="width:' + pct + '%"></div></div></div>'
        : "") +
      "</div></div>";

    if (manager) {
      html +=
        '<div class="card"><div class="card-title"><span class="card-title-icon">🛠️</span> Team management</div>' +
        '<p class="text-muted mb-6">Invite people, change roles, reset passwords and remove people from the team.</p>' +
        '<a class="btn btn-primary btn-sm" href="/team/manage">Open Team management</a></div>';
    }

    // Who's on the team (read-only here)
    html += '<div class="card"><div class="card-title"><span class="card-title-icon">👥</span> Members (' + d.members.length + ")</div>";
    d.members.forEach(function (m) {
      html +=
        '<div class="team-row">' + avatar(m) +
        '<div class="team-who"><div class="team-who-name">' + esc(m.name) + (m.isYou ? ' <span class="text-muted">(you)</span>' : "") + "</div>" +
        '<div class="team-who-sub">' + esc(m.email) + "</div></div>" +
        '<div class="team-row-actions">' + roleBadge(m.role) + "</div></div>";
    });
    html += "</div>";

    // Company accounts can't leave; the owner deletes the team on the management page
    if (d.me.role !== "owner") {
      html += d.me.managed
        ? '<div class="card"><div class="card-title"><span class="card-title-icon">🏢</span> Managed account</div>' +
          '<p class="text-muted">Your account was created by ' + esc((t.store || {}).name || t.name) +
          ". The owner or a supervisor can make changes to it or remove it.</p></div>"
        : '<div class="card"><div class="card-title"><span class="card-title-icon">🚪</span> Leave team</div>' +
          '<p class="text-muted mb-6">You\'ll lose access to this team. You keep your own Aervo account, and someone will need to invite you again to rejoin.</p>' +
          '<button class="btn btn-danger btn-sm" data-act="leave">Leave team</button></div>';
    }

    root.innerHTML = html;
  }

  // ── actions ────────────────────────────────────────────────────────────

  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.getAttribute("data-act") !== "leave" || !state) return;
    uiConfirm("Leave " + state.team.name + "?", { title: "Leave team", confirmText: "Leave team", danger: true }).then(function (ok) {
      if (!ok) return;
      run(api("DELETE", "/api/team/members/" + state.me.userId), "You left the team").then(function () {
        try {
          localStorage.removeItem("aervo_team");
          localStorage.removeItem("aervo_staff");
        } catch (e2) {}
      });
    });
  });

  function run(promise, okMessage) {
    return promise
      .then(function () {
        showToast(okMessage, "success");
        return load();
      })
      .catch(function (err) {
        showToast(err.message, "error");
        return load();
      });
  }

  function load() {
    return api("GET", "/api/team")
      .then(function (d) {
        state = d;
        if (!d.team) {
          return d.canCreate ? renderCreate(d.suggestedName) : renderUpsell();
        }
        renderTeam(d);
      })
      .catch(function (err) {
        root.innerHTML = '<div class="card text-muted">Couldn\'t load your team. ' + esc(err.message) + "</div>";
      });
  }

  load();
})();
