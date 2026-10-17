/*
 * Settings → Team. Talks to the backend /api/team routes (aervo-backend/routes/team.js).
 * The server decides what each role may do and sends `permissions`; this file only
 * shows the controls those permissions allow. Everything a user typed (names,
 * emails, team name) goes through esc() before it reaches innerHTML.
 */
(function () {
  var API = "https://api.aervoapp.com";
  var root = document.getElementById("teamRoot");
  if (!root) return;

  var state = null; // last GET /api/team response
  var lastLink = null; // { email, url } from the most recent invite/resend
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

  function shortDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return "";
    }
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
      '<p class="text-muted mb-6">Invite your staff, give supervisors the power to manage them, and get ready for team messaging. ' +
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

  function renderTeam(d) {
    var t = d.team;
    var p = d.permissions;
    var full = t.seats.used >= t.seats.limit;
    var pct = t.seats.limit ? Math.min(100, Math.round((t.seats.used / t.seats.limit) * 100)) : 100;
    var html = "";

    // Header: name, your role, seats
    html +=
      '<div class="card"><div class="team-head"><div>' +
      '<div class="team-name">' + esc(t.name) + "</div>" +
      '<div class="text-muted">You are ' + (d.me.role === "owner" ? "the owner" : "a " + esc(ROLE_LABEL[d.me.role]).toLowerCase()) + "</div>" +
      "</div>" +
      '<div class="team-seats">' + t.seats.used + " of " + t.seats.limit + " seats used" +
      '<div class="team-seat-bar"><div class="team-seat-fill" style="width:' + pct + '%"></div></div></div>' +
      (p.rename ? '<button class="btn btn-ghost btn-sm" data-act="rename">Rename</button>' : "") +
      "</div></div>";

    // Invite form
    if (p.inviteRoles.length) {
      if (t.seats.limit <= 0) {
        html +=
          '<div class="card"><div class="card-title"><span class="card-title-icon">✉️</span> Invite people</div>' +
          '<p class="text-muted">The team owner\'s plan no longer includes team seats. ' +
          (d.me.role === "owner" ? '<a class="link" href="/pricing">Upgrade to Pro or Business</a> to invite people.' : "Ask the owner to upgrade.") +
          "</p></div>";
      } else {
        html +=
          '<div class="card"><div class="card-title"><span class="card-title-icon">✉️</span> Invite people</div>' +
          '<form id="teamInviteForm" class="team-invite-form">' +
          '<div class="form-group"><label for="teamInviteEmail">Email</label>' +
          '<input id="teamInviteEmail" type="email" required maxlength="254" placeholder="name@company.com" ' + (full ? "disabled" : "") + " /></div>" +
          '<div class="form-group"><label for="teamInviteRole">Role</label><select id="teamInviteRole" ' + (full ? "disabled" : "") + ">" +
          p.inviteRoles
            .map(function (r) {
              return '<option value="' + r + '"' + (r === "member" ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>";
            })
            .join("") +
          "</select></div>" +
          '<button class="btn btn-primary btn-sm" type="submit" ' + (full ? "disabled" : "") + ">Send invite</button>" +
          "</form>" +
          '<div class="form-hint" style="margin-top: var(--space-2)">' +
          (full
            ? "All seats are in use. Remove someone or cancel a pending invite to free one."
            : "Invites expire after 7 days. Supervisors can invite and remove members; only the owner can add supervisors.") +
          "</div>" +
          (lastLink
            ? '<div class="team-link-box"><input readonly id="teamLastLink" value="' + esc(lastLink.url) + '" aria-label="Invite link for ' + esc(lastLink.email) + '" />' +
              '<button class="btn btn-ghost btn-sm" data-act="copy-link" type="button">Copy link</button></div>' +
              '<div class="form-hint">Link for ' + esc(lastLink.email) + ". It only works for that email address. It won't be shown again.</div>"
            : "") +
          "</div>";
      }
    }

    // Members
    html += '<div class="card"><div class="card-title"><span class="card-title-icon">👥</span> Members (' + d.members.length + ")</div>";
    d.members.forEach(function (m) {
      var actions = "";
      if (!m.isYou && m.role !== "owner" && p.changeRoles) {
        actions +=
          '<select data-act="role" data-id="' + m.userId + '" aria-label="Role for ' + esc(m.name) + '">' +
          ["supervisor", "member"]
            .map(function (r) {
              return '<option value="' + r + '"' + (m.role === r ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>";
            })
            .join("") +
          "</select>";
      } else {
        actions += roleBadge(m.role);
      }
      if (!m.isYou && p.removeRoles.indexOf(m.role) > -1) {
        actions += '<button class="btn btn-ghost btn-sm" data-act="remove" data-id="' + m.userId + '" data-name="' + esc(m.name) + '">Remove</button>';
      }
      html +=
        '<div class="team-row">' + avatar(m) +
        '<div class="team-who"><div class="team-who-name">' + esc(m.name) + (m.isYou ? ' <span class="text-muted">(you)</span>' : "") + "</div>" +
        '<div class="team-who-sub">' + esc(m.email) + " · joined " + esc(shortDate(m.joinedAt)) + "</div></div>" +
        '<div class="team-row-actions">' + actions + "</div></div>";
    });
    html += "</div>";

    // Pending invites
    if (p.viewInvites && d.invites.length) {
      html += '<div class="card"><div class="card-title"><span class="card-title-icon">⏳</span> Pending invites (' + d.invites.length + ")</div>";
      d.invites.forEach(function (i) {
        var canManage = p.inviteRoles.indexOf(i.role) > -1;
        html +=
          '<div class="team-row">' + avatar({ email: i.email }) +
          '<div class="team-who"><div class="team-who-name">' + esc(i.email) + "</div>" +
          '<div class="team-who-sub">' + esc(ROLE_LABEL[i.role]) + " · " +
          (i.expired ? '<span class="text-danger">expired</span>' : "sent " + esc(shortDate(i.sentAt)) + ", expires " + esc(shortDate(i.expiresAt))) +
          "</div></div>" +
          '<div class="team-row-actions">' +
          (canManage
            ? '<button class="btn btn-ghost btn-sm" data-act="resend" data-id="' + i.id + '">Resend</button>' +
              '<button class="btn btn-ghost btn-sm" data-act="cancel" data-id="' + i.id + '" data-email="' + esc(i.email) + '">Cancel</button>'
            : "") +
          "</div></div>";
      });
      html += "</div>";
    }

    // Leave / delete
    html +=
      '<div class="card"><div class="card-title"><span class="card-title-icon">🚪</span> ' + (p.deleteTeam ? "Delete team" : "Leave team") + "</div>" +
      '<p class="text-muted mb-6">' +
      (p.deleteTeam
        ? "Removes everyone from the team and cancels pending invites. Their own Aervo accounts are kept."
        : "You'll lose access to this team. Someone will need to invite you again to rejoin.") +
      "</p>" +
      '<button class="btn btn-danger btn-sm" data-act="' + (p.deleteTeam ? "delete-team" : "leave") + '">' + (p.deleteTeam ? "Delete team" : "Leave team") + "</button></div>";

    root.innerHTML = html;

    var form = document.getElementById("teamInviteForm");
    if (form) form.addEventListener("submit", onInvite);
  }

  // ── actions ────────────────────────────────────────────────────────────

  function onInvite(e) {
    e.preventDefault();
    var email = document.getElementById("teamInviteEmail").value.trim();
    var role = document.getElementById("teamInviteRole").value;
    var btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    api("POST", "/api/team/invites", { email: email, role: role })
      .then(function (r) {
        lastLink = { email: r.invite.email, url: r.joinUrl };
        showToast(r.emailSent ? "Invite sent to " + r.invite.email : "Invite created, but the email didn't send. Copy the link below to share it.", r.emailSent ? "success" : "error");
        return load();
      })
      .catch(function (err) {
        showToast(err.message, "error");
        btn.disabled = false;
      });
  }

  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT") return;
    var act = el.getAttribute("data-act");
    var id = el.getAttribute("data-id");

    if (act === "copy-link") {
      var input = document.getElementById("teamLastLink");
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject())
        .then(function () {
          showToast("Link copied", "success");
        })
        .catch(function () {
          input.select();
        });
      return;
    }

    if (act === "rename") {
      uiPrompt("New team name", { title: "Rename team", value: state.team.name, confirmText: "Save" }).then(function (name) {
        if (name == null) return;
        run(api("PATCH", "/api/team", { name: name }), "Team renamed");
      });
      return;
    }

    if (act === "resend") {
      el.disabled = true;
      api("POST", "/api/team/invites/" + id + "/resend")
        .then(function (r) {
          lastLink = { email: r.invite.email, url: r.joinUrl };
          showToast(r.emailSent ? "Invite resent" : "New link created, but the email didn't send. Copy the link to share it.", r.emailSent ? "success" : "error");
          return load();
        })
        .catch(function (err) {
          showToast(err.message, "error");
          el.disabled = false;
        });
      return;
    }

    var confirmations = {
      cancel: ["Cancel the invite to " + el.getAttribute("data-email") + "? The link will stop working.", "Cancel invite", "DELETE", "/api/team/invites/" + id, "Invite cancelled"],
      remove: ["Remove " + el.getAttribute("data-name") + " from the team?", "Remove", "DELETE", "/api/team/members/" + id, "Removed from team"],
      leave: ["Leave " + (state && state.team.name) + "?", "Leave team", "DELETE", "/api/team/members/" + (state && state.me.userId), "You left the team"],
      "delete-team": ["Delete " + (state && state.team.name) + " for everyone? This cannot be undone.", "Delete team", "DELETE", "/api/team", "Team deleted"],
    };
    var c = confirmations[act];
    if (!c) return;
    uiConfirm(c[0], { title: c[1], confirmText: c[1], danger: true }).then(function (ok) {
      if (ok) run(api(c[2], c[3]), c[4]);
    });
  });

  root.addEventListener("change", function (e) {
    var el = e.target;
    if (el.getAttribute("data-act") !== "role") return;
    run(api("PATCH", "/api/team/members/" + el.getAttribute("data-id"), { role: el.value }), "Role updated");
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
          lastLink = null;
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
