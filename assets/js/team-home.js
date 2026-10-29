/*
 * Team home (/team): the landing page for employees, people invited onto a
 * business's team who have no store of their own. Shows which store they're
 * connected to, their role, their recent conversations and their teammates.
 * Reads GET /api/team and GET /api/messages/conversations; everything people
 * typed goes through esc() before it reaches innerHTML.
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

  function render(teamData, msgData) {
    var team = teamData.team;
    var me = teamData.me;
    var st = team.store || { name: team.name };
    document.title = st.name + " · Aervo";
    var canSend = !!(msgData.team && msgData.team.canSend);
    root.innerHTML =
      heroHtml(team, me) +
      '<div class="home-grid">' +
      messagesHtml(msgData.conversations || [], me.userId) +
      teamHtml(teamData, canSend) +
      "</div>" +
      '<p class="home-note">' +
      (me.managed
        ? "Your Aervo account is managed by " + esc(st.name) + ". For account changes, talk to the owner or a supervisor."
        : "You're on " + esc(st.name) + "'s team with your own Aervo account. You can leave the team from " +
          '<a class="link" href="/settings?section=team">Settings → Team</a>.') +
      "</p>";
  }

  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-dm]");
    if (!b) return;
    b.disabled = true;
    api("POST", "/api/messages/conversations", { kind: "dm", userId: Number(b.getAttribute("data-dm")) })
      .then(function (d) {
        window.location.href = "/messages?c=" + d.conversation.id;
      })
      .catch(function (err) {
        b.disabled = false;
        showToast(err.message, "error");
      });
  });

  Promise.all([api("GET", "/api/team"), api("GET", "/api/messages/conversations")])
    .then(function (r) {
      if (!r[0].team) {
        // Not on a team (left, or the team was deleted)
        window.location.replace("/settings?section=team");
        return;
      }
      render(r[0], r[1]);
    })
    .catch(function (err) {
      root.innerHTML = '<div class="empty-state">' + esc(err.message) + "</div>";
    });
})();
