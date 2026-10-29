/*
 * Team management (/team/manage): where the owner and supervisors add, remove
 * and manage the people on their team. Talks to /api/team (aervo-backend/routes/team.js).
 * The server decides what each role may do and sends `permissions`; this page
 * only shows the controls those allow. Everything people typed goes through
 * esc() before it reaches innerHTML.
 *
 * Company accounts (made through an invite, `managed`) belong to the business:
 * removing one deletes it, and admins can send it a password reset or sign it
 * out. People who joined with their own Aervo account are only taken off the team.
 */
(function () {
  var API = "https://api.aervoapp.com";
  var root = document.getElementById("tm");
  if (!root) return;

  var ROLE_LABEL = { owner: "Owner", supervisor: "Supervisor", member: "Member" };
  var ROLE_BADGE = { owner: "badge-purple", supervisor: "badge-blue", member: "" };

  var state = null; // last GET /api/team
  var links = []; // [{ email, url }] invite links from this visit, shown when email failed
  var filter = { q: "", role: "" };

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
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function ago(iso) {
    if (!iso) return "Never";
    var mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 2) return "Just now";
    if (mins < 60) return mins + " min ago";
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? " hour ago" : " hours ago");
    var days = Math.round(hrs / 24);
    if (days < 30) return days + (days === 1 ? " day ago" : " days ago");
    return shortDate(iso);
  }

  function avatar(p) {
    if (p.avatarUrl && /^https:\/\//.test(p.avatarUrl)) {
      return '<div class="tm-avatar"><img src="' + esc(p.avatarUrl) + '" alt="" /></div>';
    }
    return '<div class="tm-avatar" aria-hidden="true">' + esc(String(p.name || p.email || "?").trim().charAt(0).toUpperCase()) + "</div>";
  }

  function roleBadge(role) {
    return '<span class="badge ' + (ROLE_BADGE[role] || "") + '">' + esc(ROLE_LABEL[role] || role) + "</span>";
  }

  // ── views ────────────────────────────────────────────────────────────────
  function renderNotManager(d) {
    root.innerHTML =
      '<div class="card"><div class="empty-state">' +
      '<div class="empty-state-icon">🔒</div>' +
      '<div class="empty-state-title">Only admins can manage the team</div>' +
      '<div class="empty-state-sub mb-6">The owner and supervisors of ' + esc((d.team.store || {}).name || d.team.name) +
      " add and remove people. Ask one of them if something needs to change.</div>" +
      '<a class="btn btn-primary btn-sm" href="/team">Back to home</a></div></div>';
  }

  function headHtml(d) {
    var t = d.team;
    var st = t.store || { name: t.name };
    return (
      '<div class="tm-head"><div>' +
      '<div class="tm-eyebrow">Team management</div>' +
      '<h1 class="tm-title">' + esc(t.name) +
      (d.permissions.rename ? ' <button type="button" class="btn btn-ghost btn-sm" data-act="rename">Rename</button>' : "") +
      "</h1>" +
      '<div class="tm-sub">' + (st.name !== t.name ? esc(st.name) + " · " : "") +
      "You're " + (d.me.role === "owner" ? "the owner" : "a supervisor") +
      (d.me.role === "owner" ? ": you can manage everyone." : ": you can add and remove members.") +
      "</div></div>" +
      '<a class="btn btn-secondary btn-sm" href="/messages">💬 Messages</a>' +
      "</div>"
    );
  }

  function statsHtml(d) {
    var t = d.team;
    var sup = d.members.filter(function (m) { return m.role === "supervisor"; }).length;
    var openInvites = d.invites.filter(function (i) { return !i.expired; }).length;
    var left = Math.max(0, t.seats.limit - t.seats.used);
    var pct = t.seats.limit ? Math.min(100, Math.round((t.seats.used / t.seats.limit) * 100)) : 100;
    function tile(value, label, extra) {
      return '<div class="card-compact"><div class="tm-stat-value">' + value + '</div><div class="tm-stat-label">' + label + "</div>" + (extra || "") + "</div>";
    }
    return (
      '<div class="tm-stats">' +
      tile(d.members.length, "People on the team") +
      tile(sup, sup === 1 ? "Supervisor" : "Supervisors") +
      tile(openInvites, openInvites === 1 ? "Pending invite" : "Pending invites") +
      tile(left, "Seats left of " + t.seats.limit, '<div class="tm-seat-bar"><div class="tm-seat-fill" style="width:' + pct + '%"></div></div>') +
      "</div>"
    );
  }

  function inviteHtml(d) {
    var p = d.permissions;
    var t = d.team;
    if (!p.inviteRoles.length) return "";
    if (t.seats.limit <= 0) {
      return (
        '<section class="card"><div class="tm-card-head"><h2>Add people</h2></div>' +
        '<p class="text-muted">The team owner\'s plan no longer includes team seats. ' +
        (d.me.role === "owner" ? '<a class="link" href="/pricing">Upgrade to Pro or Business</a> to add people.' : "Ask the owner to upgrade.") +
        "</p></section>"
      );
    }
    var full = t.seats.used >= t.seats.limit;
    return (
      '<section class="card">' +
      '<div class="tm-card-head"><div><h2>Add people</h2>' +
      '<div class="tm-sub">Each person gets an email invite. Their account belongs to your business, so you can remove it any time.</div></div></div>' +
      '<form class="tm-invite" id="tmInvite">' +
      '<div><label class="field-label" for="tmEmails">Email addresses</label>' +
      '<textarea class="input" id="tmEmails" rows="1" required placeholder="name@company.com, another@company.com"' + (full ? " disabled" : "") + "></textarea></div>" +
      '<div><label class="field-label" for="tmRole">Role</label><select class="input" id="tmRole"' + (full ? " disabled" : "") + ">" +
      p.inviteRoles
        .map(function (r) {
          return '<option value="' + r + '"' + (r === "member" ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>";
        })
        .join("") +
      "</select></div>" +
      '<button type="submit" class="btn btn-primary"' + (full ? " disabled" : "") + ">Send invites</button>" +
      "</form>" +
      '<div class="field-help mt-2">' +
      (full
        ? "All seats are in use. Remove someone or cancel a pending invite to free one."
        : "Separate several addresses with commas or new lines. Invites expire after 7 days." +
          (d.me.role === "owner" ? "" : " Only the owner can add supervisors.")) +
      "</div>" +
      (links.length
        ? '<div class="tm-links">' +
          links
            .map(function (l, i) {
              return (
                '<div class="tm-link"><input class="input input-sm" readonly id="tmLink' + i + '" value="' + esc(l.url) + '" aria-label="Invite link for ' + esc(l.email) + '" />' +
                '<button type="button" class="btn btn-ghost btn-sm" data-act="copy" data-i="' + i + '">Copy link for ' + esc(l.email) + "</button></div>"
              );
            })
            .join("") +
          '<div class="field-help">The email didn\'t send for these, so share the link another way. Each link only works for its email address and won\'t be shown again.</div></div>'
        : "") +
      "</section>"
    );
  }

  function memberMenu(m, d) {
    var p = d.permissions;
    var canManage = !m.isYou && p.removeRoles.indexOf(m.role) > -1;
    var items = [];
    if (!m.isYou) items.push('<button type="button" data-act="message" data-id="' + m.userId + '">💬 Send a message</button>');
    if (canManage && m.managed) {
      items.push('<button type="button" data-act="reset" data-id="' + m.userId + '">🔑 Send password reset</button>');
      items.push('<button type="button" data-act="signout" data-id="' + m.userId + '">🚪 Sign out of all devices</button>');
    }
    if (canManage) {
      items.push('<button type="button" class="danger" data-act="remove" data-id="' + m.userId + '">' + (m.managed ? "🗑️ Remove and delete account" : "➖ Remove from team") + "</button>");
    }
    if (!items.length) return "";
    return (
      '<details class="tm-menu"><summary class="btn btn-ghost btn-sm" aria-label="Actions for ' + esc(m.name) + '">⋯</summary>' +
      '<div class="tm-menu-list" role="menu">' + items.join("") + "</div></details>"
    );
  }

  function membersHtml(d) {
    var p = d.permissions;
    var q = filter.q.toLowerCase();
    var shown = d.members.filter(function (m) {
      if (filter.role && m.role !== filter.role) return false;
      return !q || (m.name + " " + m.email).toLowerCase().indexOf(q) > -1;
    });
    var rows = shown
      .map(function (m) {
        var role =
          !m.isYou && m.role !== "owner" && p.changeRoles
            ? '<select class="input input-sm" data-act="role" data-id="' + m.userId + '" aria-label="Role for ' + esc(m.name) + '">' +
              ["supervisor", "member"]
                .map(function (r) {
                  return '<option value="' + r + '"' + (m.role === r ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>";
                })
                .join("") +
              "</select>"
            : roleBadge(m.role);
        var account = m.role === "owner" ? "Owner account" : m.managed ? "Company account" : "Own account";
        return (
          "<tr>" +
          '<td><div class="tm-person">' + avatar(m) + '<div><div class="tm-name">' + esc(m.name) +
          (m.isYou ? ' <span class="text-muted">(you)</span>' : "") + '</div><div class="tm-email">' + esc(m.email) + "</div></div></div></td>" +
          '<td data-label="Role">' + role + "</td>" +
          '<td data-label="Account"><span class="tm-sub" title="' +
          (m.managed ? "Created through your invite. Removing it deletes the account." : m.role === "owner" ? "" : "Their own Aervo account. Removing them only takes them off the team.") +
          '">' + account + "</span></td>" +
          '<td data-label="Joined">' + esc(shortDate(m.joinedAt)) + "</td>" +
          '<td data-label="Last active">' + esc(ago(m.lastActive)) + "</td>" +
          '<td><div class="tm-actions">' + memberMenu(m, d) + "</div></td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<section class="card">' +
      '<div class="tm-card-head"><h2>People <span class="text-muted">(' + d.members.length + ")</span></h2>" +
      '<div class="tm-filters">' +
      '<input class="input input-sm" id="tmSearch" type="search" placeholder="Search name or email" aria-label="Search people" value="' + esc(filter.q) + '" />' +
      '<select class="input input-sm" id="tmRoleFilter" aria-label="Filter by role">' +
      '<option value="">All roles</option>' +
      ["owner", "supervisor", "member"]
        .map(function (r) {
          return '<option value="' + r + '"' + (filter.role === r ? " selected" : "") + ">" + ROLE_LABEL[r] + "s</option>";
        })
        .join("") +
      "</select></div></div>" +
      (shown.length
        ? '<table class="tm-table"><thead><tr><th>Person</th><th>Role</th><th>Account</th><th>Joined</th><th>Last active</th><th><span class="sr-only">Actions</span></th></tr></thead>' +
          "<tbody>" + rows + "</tbody></table>"
        : '<div class="empty-state">No one matches that search.</div>') +
      "</section>"
    );
  }

  function invitesHtml(d) {
    var p = d.permissions;
    if (!p.viewInvites || !d.invites.length) return "";
    return (
      '<section class="card"><div class="tm-card-head"><h2>Pending invites <span class="text-muted">(' + d.invites.length + ")</span></h2></div>" +
      '<table class="tm-table"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      d.invites
        .map(function (i) {
          var canManage = p.inviteRoles.indexOf(i.role) > -1;
          return (
            "<tr>" +
            '<td><div class="tm-person">' + avatar({ email: i.email }) + '<div class="tm-name">' + esc(i.email) + "</div></div></td>" +
            '<td data-label="Role">' + roleBadge(i.role) + "</td>" +
            '<td data-label="Status">' +
            (i.expired
              ? '<span class="text-danger">Expired</span>'
              : "Sent " + esc(shortDate(i.sentAt)) + ", expires " + esc(shortDate(i.expiresAt))) +
            "</td>" +
            '<td><div class="tm-actions">' +
            (canManage
              ? '<button type="button" class="btn btn-ghost btn-sm" data-act="resend" data-id="' + i.id + '">Resend</button>' +
                '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel" data-id="' + i.id + '" data-email="' + esc(i.email) + '">Cancel</button>'
              : "") +
            "</div></td></tr>"
          );
        })
        .join("") +
      "</tbody></table></section>"
    );
  }

  function dangerHtml(d) {
    if (!d.permissions.deleteTeam) return "";
    return (
      '<section class="card"><div class="tm-card-head"><div><h2>Delete team</h2>' +
      '<div class="tm-sub">Removes everyone, cancels pending invites and deletes your team\'s messages. ' +
      "Company accounts are deleted; people who use their own Aervo account keep it.</div></div>" +
      '<button type="button" class="btn btn-danger btn-sm" data-act="delete-team">Delete team</button></div></section>'
    );
  }

  function render() {
    var d = state;
    var typed = document.getElementById("tmEmails");
    var keep = typed ? typed.value : ""; // a reload after one action keeps half-typed invites
    root.innerHTML =
      headHtml(d) + statsHtml(d) + inviteHtml(d) +
      '<div id="tmMembers">' + membersHtml(d) + "</div>" +
      invitesHtml(d) + dangerHtml(d);
    var form = document.getElementById("tmInvite");
    if (form) form.addEventListener("submit", onInvite);
    var emails = document.getElementById("tmEmails");
    if (emails && keep) emails.value = keep;
  }

  // Search / role filter: redraw only the people list
  function renderMembers() {
    var box = document.getElementById("tmMembers");
    if (!box) return;
    var searching = document.activeElement && document.activeElement.id === "tmSearch";
    box.innerHTML = membersHtml(state);
    if (searching) {
      var s = document.getElementById("tmSearch");
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    }
  }

  // ── actions ──────────────────────────────────────────────────────────────
  function onInvite(e) {
    e.preventDefault();
    var raw = document.getElementById("tmEmails").value;
    var role = document.getElementById("tmRole").value;
    var emails = raw
      .split(/[\s,;]+/)
      .map(function (x) { return x.trim(); })
      .filter(Boolean)
      .filter(function (x, i, all) { return all.indexOf(x) === i; });
    if (!emails.length) return;
    if (emails.length > 20) return showToast("Add up to 20 addresses at a time.", "error");
    var btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    var sent = 0;
    var failed = [];
    // One at a time: the server checks seats per invite
    emails
      .reduce(function (chain, email) {
        return chain.then(function () {
          return api("POST", "/api/team/invites", { email: email, role: role })
            .then(function (r) {
              sent++;
              if (!r.emailSent) links.push({ email: r.invite.email, url: r.joinUrl });
            })
            .catch(function (err) {
              failed.push(email + ": " + err.message);
            });
        });
      }, Promise.resolve())
      .then(function () {
        var box = document.getElementById("tmEmails");
        if (box) box.value = ""; // clear before load() so render() doesn't restore it
        if (failed.length) {
          showToast(
            (sent ? sent + " sent. " : "") + failed.length + " not sent: " + failed[0] + (failed.length > 1 ? " (and " + (failed.length - 1) + " more)" : ""),
            "error"
          );
        } else if (sent) {
          showToast(sent === 1 ? "Invite sent" : sent + " invites sent", "success");
        }
        return load();
      });
  }

  function findMember(id) {
    return state.members.filter(function (m) { return m.userId === id; })[0];
  }

  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT") return;
    var act = el.getAttribute("data-act");
    var id = Number(el.getAttribute("data-id"));
    var menu = el.closest("details");
    if (menu) menu.open = false;
    var m = id ? findMember(id) : null;

    if (act === "copy") {
      var input = document.getElementById("tmLink" + el.getAttribute("data-i"));
      (navigator.clipboard ? navigator.clipboard.writeText(input.value) : Promise.reject())
        .then(function () { showToast("Link copied", "success"); })
        .catch(function () { input.select(); });
      return;
    }

    if (act === "rename") {
      uiPrompt("New team name", { title: "Rename team", value: state.team.name, confirmText: "Save" }).then(function (name) {
        if (name == null) return;
        run(api("PATCH", "/api/team", { name: name }), "Team renamed");
      });
      return;
    }

    if (act === "message") {
      api("POST", "/api/messages/conversations", { kind: "dm", userId: id })
        .then(function (r) { window.location.href = "/messages?c=" + r.conversation.id; })
        .catch(function (err) { showToast(err.message, "error"); });
      return;
    }

    if (act === "resend") {
      el.disabled = true;
      api("POST", "/api/team/invites/" + id + "/resend")
        .then(function (r) {
          if (!r.emailSent) links.push({ email: r.invite.email, url: r.joinUrl });
          showToast(r.emailSent ? "Invite resent" : "New link created, but the email didn't send. Copy the link to share it.", r.emailSent ? "success" : "error");
          return load();
        })
        .catch(function (err) {
          showToast(err.message, "error");
          el.disabled = false;
        });
      return;
    }

    var c = null;
    if (act === "reset" && m) {
      c = ["Email " + m.name + " a link to set a new password? The link works for 1 hour.", "Send password reset", "Send", false,
        function () {
          return api("POST", "/api/team/members/" + id + "/reset-password").then(function (r) {
            if (!r.emailSent) throw new Error("The reset email couldn't be sent. Try again in a few minutes.");
            return "Password reset sent to " + m.email;
          });
        }];
    } else if (act === "signout" && m) {
      c = ["Sign " + m.name + " out of Aervo on every device? They can sign straight back in with their password.", "Sign out everywhere", "Sign out", false,
        function () {
          return api("POST", "/api/team/members/" + id + "/sign-out").then(function () { return m.name + " was signed out"; });
        }];
    } else if (act === "remove" && m) {
      c = [
        m.managed
          ? "Remove " + m.name + " and delete their account? They'll be signed out and won't be able to sign in again. Messages they sent stay in your conversations."
          : "Remove " + m.name + " from the team? They keep their own Aervo account but lose access to this team.",
        m.managed ? "Remove and delete account" : "Remove from team",
        "Remove",
        true,
        function () {
          return api("DELETE", "/api/team/members/" + id).then(function (r) {
            return r.accountDeleted ? m.name + " was removed and their account deleted" : m.name + " was removed from the team";
          });
        },
      ];
    } else if (act === "cancel") {
      c = ["Cancel the invite to " + el.getAttribute("data-email") + "? The link will stop working.", "Cancel invite", "Cancel invite", true,
        function () { return api("DELETE", "/api/team/invites/" + id).then(function () { return "Invite cancelled"; }); }];
    } else if (act === "delete-team") {
      c = ["Delete " + state.team.name + " for everyone? Company accounts will be deleted and this cannot be undone.", "Delete team", "Delete team", true,
        function () {
          return api("DELETE", "/api/team").then(function () {
            try { localStorage.removeItem("aervo_team"); } catch (e2) {}
            window.location.href = "/settings?section=team";
            return "Team deleted";
          });
        }];
    }
    if (!c) return;
    uiConfirm(c[0], { title: c[1], confirmText: c[2], danger: c[3] }).then(function (yes) {
      if (yes) run(c[4](), null);
    });
  });

  root.addEventListener("change", function (e) {
    var el = e.target;
    if (el.id === "tmRoleFilter") {
      filter.role = el.value;
      return renderMembers();
    }
    if (el.getAttribute("data-act") === "role") {
      run(api("PATCH", "/api/team/members/" + el.getAttribute("data-id"), { role: el.value }), "Role updated");
    }
  });

  root.addEventListener("input", function (e) {
    if (e.target.id === "tmSearch") {
      filter.q = e.target.value;
      renderMembers();
    }
  });

  // Close an open ⋯ menu when clicking elsewhere
  document.addEventListener("click", function (e) {
    document.querySelectorAll(".tm-menu[open]").forEach(function (d) {
      if (!d.contains(e.target)) d.open = false;
    });
  });

  function run(promise, okMessage) {
    return promise
      .then(function (msg) {
        showToast(typeof msg === "string" ? msg : okMessage, "success");
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
        if (!d.team) {
          window.location.replace("/settings?section=team"); // create a team there first
          return;
        }
        state = d;
        if (!d.permissions.viewInvites) return renderNotManager(d);
        render();
      })
      .catch(function (err) {
        root.innerHTML = '<div class="card text-muted">Couldn\'t load your team. ' + esc(err.message) + "</div>";
      });
  }

  load();
})();
