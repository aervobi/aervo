/*
 * Messages page: team direct messages and group chats.
 * Talks to the backend /api/messages routes (aervo-backend/routes/messages.js);
 * the teammate picker reads GET /api/team. The server decides who may see and do
 * what. Everything people typed (messages, names) goes through esc() before it
 * reaches innerHTML.
 *
 * Live updates: an EventSource on /api/messages/stream. If the stream can't stay
 * up (or we're inside the Shopify iframe, where it can't carry the cookie) the
 * page polls instead.
 */
(function () {
  var API = "https://api.aervoapp.com";
  var POLL_MS = 15000;
  var GROUP_GAP_MS = 5 * 60 * 1000; // same author within this = one block
  var ROLE_LABEL = { owner: "Owner", supervisor: "Supervisor", member: "Member" };

  var app = document.getElementById("msgApp");
  var listEl = document.getElementById("msgList");
  var mainEl = document.getElementById("msgMain");
  var newBtn = document.getElementById("msgNewBtn");
  var teamNameEl = document.getElementById("msgTeamName");
  if (!app) return;

  var state = {
    me: null, // { userId, role }
    team: null, // { id, name, role, canSend }
    perms: {},
    convs: [], // from /api/messages/conversations
    activeId: null,
    messages: [], // of the active conversation, oldest -> newest
    hasMore: false,
    loadingOlder: false,
  };
  var teamCache = null; // GET /api/team (for the people picker)
  var stream = null;
  var pollTimer = null;
  var readTimer = null;

  // ── helpers ──────────────────────────────────────────────────────────────
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Escaped text with web links made clickable (only http/https)
  function richText(text) {
    return esc(text).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer nofollow">' + url + "</a>";
    });
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
            err.status = res.status;
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

  function avatar(person, cls) {
    cls = "msg-avatar" + (cls ? " " + cls : "");
    if (person && person.avatarUrl && /^https:\/\//.test(person.avatarUrl)) {
      return '<div class="' + cls + '"><img src="' + esc(person.avatarUrl) + '" alt="" /></div>';
    }
    return '<div class="' + cls + '" aria-hidden="true">' + initial(person && person.name) + "</div>";
  }

  function convAvatar(c) {
    if (c.kind === "group") return '<div class="msg-avatar group" aria-hidden="true">#</div>';
    return avatar(otherPerson(c));
  }

  function otherPerson(c) {
    var others = c.participants.filter(function (p) {
      return p.userId !== state.me.userId;
    });
    return others[0] || c.participants[0] || null;
  }

  function sameDay(a, b) {
    return a.toDateString() === b.toDateString();
  }

  function timeLabel(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function listTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    var now = new Date();
    if (sameDay(d, now)) return timeLabel(iso);
    var y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (sameDay(d, y)) return "Yesterday";
    if (now - d < 6 * 86400000) return d.toLocaleDateString(undefined, { weekday: "short" });
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function dayLabel(d) {
    var now = new Date();
    if (sameDay(d, now)) return "Today";
    var y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (sameDay(d, y)) return "Yesterday";
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
    });
  }

  function convById(id) {
    for (var i = 0; i < state.convs.length; i++) if (state.convs[i].id === id) return state.convs[i];
    return null;
  }

  function personName(c, userId, fallback) {
    if (userId === state.me.userId) return "You";
    var p = c && c.participants.filter(function (x) { return x.userId === userId; })[0];
    return (p && p.name) || fallback || "Former teammate";
  }

  function totalUnread() {
    return state.convs.reduce(function (n, c) {
      return n + (c.unread || 0);
    }, 0);
  }

  function updateUnreadUi() {
    var n = totalUnread();
    document.title = (n ? "(" + n + ") " : "") + "Messages · Aervo";
    if (window.AervoNav && window.AervoNav.setUnread) window.AervoNav.setUnread(n);
  }

  function sortConvs() {
    state.convs.sort(function (a, b) {
      return new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt);
    });
  }

  // ── conversation list ────────────────────────────────────────────────────
  function renderList() {
    if (!state.convs.length) {
      listEl.innerHTML =
        '<div class="empty-state"><div class="empty-state-title">No conversations yet</div>' +
        '<div class="empty-state-sub">' +
        (state.team && state.team.canSend ? "Tap “New” to message a teammate." : "Messages from your team will show up here.") +
        "</div></div>";
      return;
    }
    listEl.innerHTML = state.convs
      .map(function (c) {
        var lm = c.lastMessage;
        var preview = "No messages yet";
        if (lm) {
          var who = lm.userId === state.me.userId ? "You: " : c.kind === "group" ? (lm.authorName || "Someone") + ": " : "";
          preview = who + (lm.deleted ? "Message deleted" : lm.body.replace(/\s+/g, " "));
        }
        var cls = "msg-item" + (c.id === state.activeId ? " active" : "") + (c.unread ? " unread" : "");
        return (
          '<button type="button" role="listitem" class="' + cls + '" data-conv="' + c.id + '"' +
          (c.id === state.activeId ? ' aria-current="true"' : "") + ">" +
          convAvatar(c) +
          '<div class="msg-item-main"><div class="msg-item-top">' +
          '<span class="msg-item-name">' + esc(c.name) + "</span>" +
          '<span class="msg-item-time">' + esc(listTime(lm ? lm.createdAt : c.createdAt)) + "</span></div>" +
          '<div class="msg-item-top"><span class="msg-item-preview">' + esc(preview) + "</span>" +
          (c.unread ? '<span class="msg-count" aria-label="' + c.unread + ' unread">' + (c.unread > 99 ? "99+" : c.unread) + "</span>" : "") +
          "</div></div></button>"
        );
      })
      .join("");
  }

  listEl.addEventListener("click", function (e) {
    var b = e.target.closest("[data-conv]");
    if (b) openConversation(Number(b.getAttribute("data-conv")));
  });

  function loadConversations() {
    return api("GET", "/api/messages/conversations").then(function (d) {
      if (!d.team) {
        renderNoTeam();
        return false;
      }
      state.team = d.team;
      state.me = d.me;
      state.perms = d.permissions || {};
      state.convs = d.conversations || [];
      teamNameEl.textContent = d.team.name;
      newBtn.hidden = !d.team.canSend;
      if (state.activeId && !convById(state.activeId)) closeThread();
      renderList();
      if (state.activeId) renderThreadHead();
      updateUnreadUi();
      return true;
    });
  }

  function renderNoTeam() {
    stopLive();
    newBtn.hidden = true;
    teamNameEl.textContent = "";
    listEl.innerHTML = "";
    mainEl.innerHTML =
      '<div class="msg-empty"><div class="empty-state">' +
      '<div class="empty-state-icon">👥</div>' +
      '<div class="empty-state-title">Messages are for teams</div>' +
      '<div class="empty-state-sub mb-6">Create a team or accept an invite to chat with your staff.</div>' +
      '<a class="btn btn-primary btn-sm" href="/settings?section=team">Go to Team settings</a>' +
      "</div></div>";
    app.classList.add("thread-open");
  }

  // ── thread ───────────────────────────────────────────────────────────────
  function threadSubtitle(c) {
    if (c.kind === "group") {
      return c.participants.length + " people · " +
        c.participants
          .map(function (p) { return p.userId === state.me.userId ? "You" : p.name; })
          .join(", ");
    }
    var o = otherPerson(c);
    if (!o) return "";
    if (!o.active) return "No longer on your team";
    return ROLE_LABEL[o.role] || "";
  }

  function canManage(c) {
    return (
      c.kind === "group" &&
      (c.createdBy === state.me.userId || state.me.role === "owner" || state.me.role === "supervisor")
    );
  }

  function renderThreadShell(c) {
    mainEl.innerHTML =
      '<div class="msg-thread-head">' +
      '<button type="button" class="btn btn-ghost btn-sm msg-back" id="msgBack" aria-label="Back to conversations">←</button>' +
      '<div id="msgHeadAvatar"></div>' +
      '<div class="msg-thread-title"><div class="msg-thread-name" id="msgHeadName"></div>' +
      '<div class="msg-thread-sub" id="msgHeadSub"></div></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="msgInfoBtn" hidden>⚙️ Group</button>' +
      "</div>" +
      '<div id="msgNotice"></div>' +
      '<div class="msg-scroll" id="msgScroll" tabindex="0" aria-label="Messages"><div class="empty-state">Loading…</div></div>' +
      '<form class="msg-composer" id="msgComposer" autocomplete="off">' +
      '<textarea class="input" id="msgInput" rows="1" maxlength="4000" placeholder="Write a message…" aria-label="Message"></textarea>' +
      '<button type="submit" class="btn btn-primary" id="msgSend">Send</button>' +
      "</form>";
    document.getElementById("msgBack").addEventListener("click", closeThread);
    document.getElementById("msgInfoBtn").addEventListener("click", function () {
      openGroupSettings(convById(state.activeId));
    });
    var input = document.getElementById("msgInput");
    input.addEventListener("input", autosize);
    input.addEventListener("keydown", function (e) {
      // Enter sends, Shift+Enter adds a line (not while an IME is composing)
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendCurrent();
      }
    });
    document.getElementById("msgComposer").addEventListener("submit", function (e) {
      e.preventDefault();
      sendCurrent();
    });
    var scroller = document.getElementById("msgScroll");
    scroller.addEventListener("scroll", function () {
      if (scroller.scrollTop < 80) loadOlder();
      if (nearBottom()) queueRead();
    });
    scroller.addEventListener("click", onThreadClick);
    renderThreadHead(c);
  }

  function renderThreadHead(c) {
    c = c || convById(state.activeId);
    if (!c || !document.getElementById("msgHeadName")) return;
    document.getElementById("msgHeadAvatar").innerHTML = convAvatar(c);
    document.getElementById("msgHeadName").textContent = c.name;
    document.getElementById("msgHeadSub").textContent = threadSubtitle(c);
    document.getElementById("msgInfoBtn").hidden = c.kind !== "group";

    var notice = "";
    var blocked = false;
    if (!state.team.canSend) {
      blocked = true;
      notice =
        '<div class="alert alert-info msg-notice">Team messaging is part of the Pro and Business plans. ' +
        (state.me.role === "owner" ? '<a class="link" href="/pricing">Upgrade to keep chatting.</a>' : "Ask the team owner to upgrade.") +
        "</div>";
    } else if (c.kind === "dm" && otherPerson(c) && !otherPerson(c).active) {
      blocked = true;
      notice = '<div class="alert alert-info msg-notice">This person is no longer on your team. You can still read your history.</div>';
    }
    document.getElementById("msgNotice").innerHTML = notice;
    var input = document.getElementById("msgInput");
    document.getElementById("msgComposer").hidden = blocked;
    if (blocked) input.blur();
  }

  function autosize() {
    var input = document.getElementById("msgInput");
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
  }

  function nearBottom() {
    var s = document.getElementById("msgScroll");
    return !s || s.scrollHeight - s.scrollTop - s.clientHeight < 120;
  }

  function scrollToBottom() {
    var s = document.getElementById("msgScroll");
    if (s) s.scrollTop = s.scrollHeight;
  }

  function messageHtml(m, prev, c) {
    var mine = m.userId === state.me.userId;
    var d = new Date(m.createdAt);
    var html = "";
    if (!prev || !sameDay(new Date(prev.createdAt), d)) {
      html += '<div class="msg-day">' + esc(dayLabel(d)) + "</div>";
      prev = null;
    }
    var cont =
      prev && prev.userId === m.userId && !prev.deleted && d - new Date(prev.createdAt) < GROUP_GAP_MS;
    var author = { name: personName(c, m.userId, m.authorName), avatarUrl: null };
    var p = c.participants.filter(function (x) { return x.userId === m.userId; })[0];
    if (p) author.avatarUrl = p.avatarUrl;

    var bubbleCls = "msg-bubble" + (m.deleted ? " deleted" : "") + (m.pending ? " pending" : "") + (m.failed ? " failed" : "");
    var tools = "";
    if (m.failed) {
      tools = '<span class="text-danger">Not sent.</span> <button type="button" class="show" data-retry="' + esc(m.clientId) + '">Retry</button>';
    } else if (mine && !m.deleted && !m.pending) {
      tools = '<button type="button" data-delete="' + m.id + '" aria-label="Delete message">Delete</button>';
    }
    html +=
      '<div class="msg-row' + (mine ? " mine" : "") + (cont ? " cont" : "") + '" data-id="' + (m.id || "") + '">' +
      (mine ? "" : avatar(author, "sm")) +
      '<div class="msg-col">' +
      (cont ? "" : '<div class="msg-meta">' + (mine ? "" : "<strong>" + esc(author.name) + "</strong>") +
        '<time datetime="' + esc(m.createdAt) + '">' + esc(timeLabel(m.createdAt)) + "</time></div>") +
      '<div class="' + bubbleCls + '"' + (cont ? ' title="' + esc(timeLabel(m.createdAt)) + '"' : "") + ">" +
      (m.deleted ? "Message deleted" : richText(m.body)) + "</div>" +
      (tools ? '<div class="msg-tools">' + tools + "</div>" : "") +
      "</div></div>";
    return html;
  }

  function renderMessages(opts) {
    opts = opts || {};
    var s = document.getElementById("msgScroll");
    var c = convById(state.activeId);
    if (!s || !c) return;
    var keepBottom = opts.toBottom || nearBottom();
    var prevHeight = s.scrollHeight;
    var prevTop = s.scrollTop;

    if (!state.messages.length) {
      s.innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">👋</div>' +
        '<div class="empty-state-title">Say hello</div>' +
        '<div class="empty-state-sub">This is the start of your conversation' +
        (c.kind === "group" ? " in " + esc(c.name) : " with " + esc(c.name)) + ".</div></div>";
      return;
    }
    var html = state.hasMore
      ? '<div class="msg-older"><button type="button" class="btn btn-ghost btn-sm" data-older>Load earlier messages</button></div>'
      : "";
    for (var i = 0; i < state.messages.length; i++) {
      html += messageHtml(state.messages[i], state.messages[i - 1], c);
    }
    s.innerHTML = html;
    if (opts.keepPosition) s.scrollTop = s.scrollHeight - prevHeight + prevTop;
    else if (keepBottom) s.scrollTop = s.scrollHeight;
  }

  function onThreadClick(e) {
    var del = e.target.closest("[data-delete]");
    if (del) return deleteMessage(Number(del.getAttribute("data-delete")));
    var retry = e.target.closest("[data-retry]");
    if (retry) return retrySend(retry.getAttribute("data-retry"));
    if (e.target.closest("[data-older]")) loadOlder();
  }

  function openConversation(id, opts) {
    opts = opts || {};
    var c = convById(id);
    if (!c) return;
    var same = state.activeId === id && document.getElementById("msgScroll");
    state.activeId = id;
    app.classList.add("thread-open");
    try {
      history.replaceState(null, "", "/messages?c=" + id);
    } catch (e) {}
    renderList();
    if (!same) {
      state.messages = [];
      state.hasMore = false;
      renderThreadShell(c);
    }
    var forId = id;
    return api("GET", "/api/messages/conversations/" + id + "/messages")
      .then(function (d) {
        if (state.activeId !== forId) return;
        state.messages = d.messages;
        state.hasMore = d.hasMore;
        renderMessages({ toBottom: true });
        queueRead();
        if (!opts.keepFocus && window.innerWidth > 768) {
          var input = document.getElementById("msgInput");
          if (input && !document.getElementById("msgComposer").hidden) input.focus();
        }
      })
      .catch(function (err) {
        showToast(err.message, "error");
        if (err.status === 404) loadConversations();
      });
  }

  function closeThread() {
    state.activeId = null;
    state.messages = [];
    app.classList.remove("thread-open");
    try {
      history.replaceState(null, "", "/messages");
    } catch (e) {}
    mainEl.innerHTML =
      '<div class="msg-empty"><div class="empty-state"><div class="empty-state-icon">💬</div>' +
      '<div class="empty-state-title">Pick a conversation</div>' +
      '<div class="empty-state-sub">Or start a new one with a teammate.</div></div></div>';
    renderList();
  }

  function loadOlder() {
    if (!state.hasMore || state.loadingOlder || !state.messages.length) return;
    var first = state.messages.filter(function (m) { return m.id; })[0];
    if (!first) return;
    state.loadingOlder = true;
    var forId = state.activeId;
    api("GET", "/api/messages/conversations/" + forId + "/messages?before=" + first.id)
      .then(function (d) {
        if (state.activeId !== forId) return;
        state.messages = d.messages.concat(state.messages);
        state.hasMore = d.hasMore;
        renderMessages({ keepPosition: true });
      })
      .catch(function (err) {
        showToast(err.message, "error");
      })
      .then(function () {
        state.loadingOlder = false;
      });
  }

  // ── reading ──────────────────────────────────────────────────────────────
  function queueRead() {
    clearTimeout(readTimer);
    readTimer = setTimeout(markRead, 400);
  }

  function markRead() {
    var c = convById(state.activeId);
    if (!c || document.hidden || !nearBottom()) return;
    var last = null;
    for (var i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].id) {
        last = state.messages[i].id;
        break;
      }
    }
    if (!last || (last <= c.lastReadId && !c.unread)) return;
    c.lastReadId = Math.max(c.lastReadId, last);
    c.unread = 0;
    renderList();
    updateUnreadUi();
    api("POST", "/api/messages/conversations/" + c.id + "/read", { messageId: last }).catch(function () {});
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      queueRead();
      refresh(); // catch anything missed while the tab slept
    }
  });

  // ── sending ──────────────────────────────────────────────────────────────
  function newClientId() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function sendCurrent() {
    var input = document.getElementById("msgInput");
    var c = convById(state.activeId);
    if (!input || !c) return;
    var body = input.value.trim();
    if (!body) return;
    if (body.length > 4000) return showToast("Messages can be up to 4,000 characters.", "error");
    input.value = "";
    autosize();
    var m = {
      id: null,
      clientId: newClientId(),
      conversationId: c.id,
      userId: state.me.userId,
      body: body,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    state.messages.push(m);
    renderMessages({ toBottom: true });
    postMessage(m);
  }

  function postMessage(m) {
    api("POST", "/api/messages/conversations/" + m.conversationId + "/messages", { body: m.body, clientId: m.clientId })
      .then(function (d) {
        receive(m.conversationId, d.message, m.clientId);
      })
      .catch(function (err) {
        m.pending = false;
        m.failed = true;
        if (state.activeId === m.conversationId) renderMessages();
        showToast(err.message, "error");
        if (err.data && err.data.code === "PLAN_LIMIT") loadConversations();
      });
  }

  function retrySend(clientId) {
    var m = state.messages.filter(function (x) { return x.clientId === clientId; })[0];
    if (!m) return;
    m.failed = false;
    m.pending = true;
    renderMessages();
    postMessage(m);
  }

  function deleteMessage(id) {
    uiConfirm("Delete this message for everyone?", { title: "Delete message", confirmText: "Delete", danger: true }).then(function (yes) {
      if (!yes) return;
      api("DELETE", "/api/messages/" + id)
        .then(function () {
          markDeleted(state.activeId, id);
        })
        .catch(function (err) {
          showToast(err.message, "error");
        });
    });
  }

  function markDeleted(convId, id) {
    var c = convById(convId);
    if (convId === state.activeId) {
      state.messages.forEach(function (m) {
        if (m.id === id) {
          m.deleted = true;
          m.body = "";
        }
      });
      renderMessages();
    }
    if (c && c.lastMessage && c.lastMessage.id === id) {
      c.lastMessage.deleted = true;
      c.lastMessage.body = "";
      renderList();
    }
  }

  // A message arrived (our own send's reply, or a live event). Idempotent.
  function receive(convId, message, clientId) {
    var c = convById(convId);
    if (!c) {
      // a conversation we don't know yet (someone just messaged us)
      loadConversations();
      return;
    }
    c.lastMessage = message;
    c.lastMessageAt = message.createdAt;
    var mine = message.userId === state.me.userId;

    if (convId === state.activeId) {
      var exists = false;
      for (var i = 0; i < state.messages.length; i++) {
        var x = state.messages[i];
        if (x.id === message.id || (clientId && x.clientId === clientId)) {
          state.messages[i] = message;
          exists = true;
          break;
        }
      }
      if (!exists) state.messages.push(message);
      var atBottom = nearBottom();
      renderMessages({ toBottom: mine });
      if (mine) c.lastReadId = Math.max(c.lastReadId, message.id);
      else if (atBottom && !document.hidden) queueRead();
      else c.unread = (c.unread || 0) + 1;
    } else if (!mine && message.id > c.lastReadId) {
      c.unread = (c.unread || 0) + 1;
    } else if (mine) {
      c.lastReadId = Math.max(c.lastReadId, message.id);
    }
    sortConvs();
    renderList();
    updateUnreadUi();
  }

  // ── new conversation dialog ──────────────────────────────────────────────
  function loadTeam() {
    return api("GET", "/api/team").then(function (d) {
      teamCache = d;
      return d;
    });
  }

  function modal(html) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay active";
    overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(overlay);
    function close() {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      newBtn.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKey, true);
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", close);
    });
    return { el: overlay, close: close };
  }

  function personRow(p, opts) {
    opts = opts || {};
    var control = opts.checkbox
      ? '<input type="checkbox" value="' + p.userId + '"' + (opts.checked ? " checked" : "") + " />"
      : "";
    var tag = opts.checkbox ? "label" : opts.static ? "div" : "button";
    var attrs = tag === "button" ? ' type="button" data-dm="' + p.userId + '"' : "";
    return (
      "<" + tag + ' class="msg-person"' + attrs + ">" +
      avatar(p, "sm") +
      '<span class="msg-person-name">' + esc(p.name) + "<small>" + esc(ROLE_LABEL[p.role] || "") + "</small></span>" +
      control + "</" + tag + ">"
    );
  }

  function openNewDialog() {
    loadTeam()
      .then(function (d) {
        var people = (d.members || []).filter(function (p) { return !p.isYou; });
        if (!people.length) {
          var m0 = modal(
            "<h3>New message</h3>" +
            '<p class="modal-text">There\'s no one else on your team yet. Invite people from Team settings.</p>' +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Close</button>' +
            '<a class="btn btn-primary" href="/settings?section=team">Invite people</a></div>'
          );
          return m0;
        }
        var canGroup = !!state.perms.createGroup;
        var m = modal(
          "<h3>New message</h3>" +
          (canGroup
            ? '<div class="msg-tabs" role="tablist">' +
              '<button type="button" class="btn btn-sm btn-active" data-tab="dm" role="tab" aria-selected="true">Direct message</button>' +
              '<button type="button" class="btn btn-sm btn-ghost" data-tab="group" role="tab" aria-selected="false">Group chat</button></div>'
            : "") +
          '<div data-pane="dm"><input class="input" id="msgPeopleSearch" placeholder="Search teammates" aria-label="Search teammates" />' +
          '<div class="msg-people" id="msgPeopleDm">' + people.map(function (p) { return personRow(p); }).join("") + "</div></div>" +
          (canGroup
            ? '<form data-pane="group" hidden id="msgGroupForm">' +
              '<label class="field-label" for="msgGroupName">Group name</label>' +
              '<input class="input" id="msgGroupName" maxlength="60" placeholder="e.g. Morning shift" required />' +
              '<div class="field-label mt-4">People</div>' +
              '<div class="msg-people">' + people.map(function (p) { return personRow(p, { checkbox: true }); }).join("") + "</div>" +
              '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
              '<button type="submit" class="btn btn-primary">Create group</button></div></form>'
            : "") +
          '<div class="modal-actions" data-pane="dm"><button type="button" class="btn btn-ghost" data-close>Cancel</button></div>'
        );
        var el = m.el;
        el.querySelectorAll("[data-tab]").forEach(function (t) {
          t.addEventListener("click", function () {
            var tab = t.getAttribute("data-tab");
            el.querySelectorAll("[data-tab]").forEach(function (x) {
              var on = x === t;
              x.className = "btn btn-sm " + (on ? "btn-active" : "btn-ghost");
              x.setAttribute("aria-selected", on ? "true" : "false");
            });
            el.querySelectorAll("[data-pane]").forEach(function (p) {
              p.hidden = p.getAttribute("data-pane") !== tab;
            });
            var f = el.querySelector(tab === "group" ? "#msgGroupName" : "#msgPeopleSearch");
            if (f) f.focus();
          });
        });
        var search = el.querySelector("#msgPeopleSearch");
        search.focus();
        search.addEventListener("input", function () {
          var q = search.value.trim().toLowerCase();
          el.querySelectorAll("#msgPeopleDm [data-dm]").forEach(function (b) {
            b.hidden = q && b.textContent.toLowerCase().indexOf(q) === -1;
          });
        });
        el.querySelector("#msgPeopleDm").addEventListener("click", function (e) {
          var b = e.target.closest("[data-dm]");
          if (!b) return;
          b.disabled = true;
          startConversation({ kind: "dm", userId: Number(b.getAttribute("data-dm")) }, m);
        });
        var gf = el.querySelector("#msgGroupForm");
        if (gf) {
          gf.addEventListener("submit", function (e) {
            e.preventDefault();
            var ids = Array.prototype.map.call(gf.querySelectorAll("input[type=checkbox]:checked"), function (x) {
              return Number(x.value);
            });
            if (!ids.length) return showToast("Pick at least one teammate.", "error");
            startConversation({ kind: "group", name: el.querySelector("#msgGroupName").value, userIds: ids }, m);
          });
        }
      })
      .catch(function (err) {
        showToast(err.message, "error");
      });
  }

  function startConversation(body, m) {
    api("POST", "/api/messages/conversations", body)
      .then(function (d) {
        m.close();
        if (!convById(d.conversation.id)) state.convs.unshift(d.conversation);
        openConversation(d.conversation.id);
      })
      .catch(function (err) {
        showToast(err.message, "error");
        m.el.querySelectorAll("[data-dm]").forEach(function (b) { b.disabled = false; });
      });
  }

  newBtn.addEventListener("click", openNewDialog);

  // ── group settings ───────────────────────────────────────────────────────
  function openGroupSettings(c) {
    if (!c || c.kind !== "group") return;
    var manage = canManage(c);
    var mayDelete = c.createdBy === state.me.userId || state.me.role === "owner";
    var ready = manage ? loadTeam() : Promise.resolve(null);
    ready
      .then(function (team) {
        var inGroup = {};
        c.participants.forEach(function (p) { inGroup[p.userId] = true; });
        var everyone = team ? (team.members || []).filter(function (p) { return !p.isYou; }) : [];
        var html = "<h3>" + esc(c.name) + "</h3>";
        if (manage) {
          html +=
            '<form id="msgGroupEdit">' +
            '<label class="field-label" for="msgGroupRename">Group name</label>' +
            '<input class="input" id="msgGroupRename" maxlength="60" required value="' + esc(c.name) + '" />' +
            '<div class="field-label mt-4">People</div>' +
            '<div class="msg-people">' +
            everyone.map(function (p) { return personRow(p, { checkbox: true, checked: inGroup[p.userId] }); }).join("") +
            "</div>" +
            '<div class="modal-actions">' +
            (mayDelete ? '<button type="button" class="btn btn-danger" id="msgGroupDelete">Delete group</button>' : "") +
            '<button type="button" class="btn btn-ghost" id="msgGroupLeave">Leave</button>' +
            '<button type="submit" class="btn btn-primary">Save</button></div></form>';
        } else {
          html +=
            '<div class="msg-people">' +
            c.participants.map(function (p) { return personRow(p, { static: true }); }).join("") +
            "</div>" +
            '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Close</button>' +
            '<button type="button" class="btn btn-danger" id="msgGroupLeave">Leave group</button></div>';
        }
        var m = modal(html);
        var el = m.el;

        el.querySelector("#msgGroupLeave").addEventListener("click", function () {
          uiConfirm("Leave “" + c.name + "”? You'll stop getting its messages.", { title: "Leave group", confirmText: "Leave", danger: true }).then(function (yes) {
            if (!yes) return;
            api("POST", "/api/messages/conversations/" + c.id + "/leave")
              .then(function () {
                m.close();
                removeConversation(c.id);
                showToast("You left the group.", "success");
              })
              .catch(function (err) { showToast(err.message, "error"); });
          });
        });
        var del = el.querySelector("#msgGroupDelete");
        if (del) {
          del.addEventListener("click", function () {
            uiConfirm("Delete “" + c.name + "” and all of its messages for everyone? This cannot be undone.", {
              title: "Delete group",
              confirmText: "Delete",
              danger: true,
            }).then(function (yes) {
              if (!yes) return;
              api("DELETE", "/api/messages/conversations/" + c.id)
                .then(function () {
                  m.close();
                  removeConversation(c.id);
                  showToast("Group deleted.", "success");
                })
                .catch(function (err) { showToast(err.message, "error"); });
            });
          });
        }
        var form = el.querySelector("#msgGroupEdit");
        if (form) {
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            var checked = {};
            form.querySelectorAll("input[type=checkbox]").forEach(function (x) { checked[x.value] = x.checked; });
            var add = [], remove = [];
            everyone.forEach(function (p) {
              if (checked[p.userId] && !inGroup[p.userId]) add.push(p.userId);
              if (!checked[p.userId] && inGroup[p.userId]) remove.push(p.userId);
            });
            // people who already left the team still sit in the group; leave them alone
            var body = { addUserIds: add, removeUserIds: remove };
            var name = el.querySelector("#msgGroupRename").value.trim();
            if (name !== c.name) body.name = name;
            api("PATCH", "/api/messages/conversations/" + c.id, body)
              .then(function (d) {
                m.close();
                replaceConversation(d.conversation);
                showToast("Group updated.", "success");
              })
              .catch(function (err) { showToast(err.message, "error"); });
          });
        }
      })
      .catch(function (err) {
        showToast(err.message, "error");
      });
  }

  function replaceConversation(conv) {
    for (var i = 0; i < state.convs.length; i++) {
      if (state.convs[i].id === conv.id) state.convs[i] = conv;
    }
    renderList();
    if (state.activeId === conv.id) {
      renderThreadHead(conv);
      renderMessages();
    }
  }

  function removeConversation(id) {
    state.convs = state.convs.filter(function (c) { return c.id !== id; });
    if (state.activeId === id) closeThread();
    else renderList();
    updateUnreadUi();
  }

  // ── live updates ─────────────────────────────────────────────────────────
  var embedded = window.self !== window.top;
  var streamFailures = 0;

  function startLive() {
    if (embedded || !window.EventSource) return startPolling();
    if (stream) return;
    stream = new EventSource(API + "/api/messages/stream", { withCredentials: true });
    stream.addEventListener("ready", function () {
      streamFailures = 0;
      stopPolling();
    });
    stream.addEventListener("message", function (e) {
      var d = parse(e.data);
      if (d && d.message) receive(d.conversationId, d.message, d.clientId);
    });
    stream.addEventListener("message_deleted", function (e) {
      var d = parse(e.data);
      if (d) markDeleted(d.conversationId, d.messageId);
    });
    stream.addEventListener("read", function (e) {
      var d = parse(e.data);
      var c = d && convById(d.conversationId);
      if (!c) return;
      c.lastReadId = Math.max(c.lastReadId, d.lastReadId);
      if (c.lastMessage && c.lastReadId >= c.lastMessage.id) {
        c.unread = 0;
        renderList();
        updateUnreadUi();
      } else {
        refresh(); // read part-way in another tab: let the server recount
      }
    });
    stream.addEventListener("conversation", function (e) {
      var d = parse(e.data);
      if (!d) return;
      if (d.change === "removed") {
        if (state.activeId === d.conversationId) showToast("You're no longer in that conversation.", "info");
        removeConversation(d.conversationId);
      } else {
        loadConversations();
      }
    });
    stream.onerror = function () {
      // The browser retries on its own. If it gave up (CLOSED) or keeps failing,
      // fall back to polling; the next visibility change tries the stream again.
      streamFailures++;
      if (stream && (stream.readyState === 2 || streamFailures >= 3)) {
        stream.close();
        stream = null;
        startPolling();
      }
    };
  }

  function parse(s) {
    try {
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  }

  function stopLive() {
    if (stream) {
      stream.close();
      stream = null;
    }
    stopPolling();
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (!document.hidden) refresh();
    }, POLL_MS);
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // Re-sync the list and the open thread (after sleep, as the polling fallback)
  var refreshing = false;
  function refresh() {
    if (refreshing || !state.me) return;
    refreshing = true;
    loadConversations()
      .then(function (hasTeam) {
        if (!hasTeam || !state.activeId) return;
        var last = null;
        for (var i = state.messages.length - 1; i >= 0; i--) {
          if (state.messages[i].id) {
            last = state.messages[i].id;
            break;
          }
        }
        var forId = state.activeId;
        var path = "/api/messages/conversations/" + forId + "/messages" + (last ? "?after=" + last : "");
        return api("GET", path).then(function (d) {
          if (state.activeId !== forId) return;
          if (!last) {
            state.messages = d.messages;
            state.hasMore = d.hasMore;
            renderMessages();
          } else if (d.messages.length) {
            // loadConversations already has the server's unread counts, so only
            // merge the messages here (receive() would count them again)
            var known = {};
            state.messages.forEach(function (m) { if (m.id) known[m.id] = true; });
            d.messages.forEach(function (m) { if (!known[m.id]) state.messages.push(m); });
            renderMessages();
          }
          queueRead();
        });
      })
      .catch(function () {})
      .then(function () {
        refreshing = false;
        if (!stream && !embedded && window.EventSource && !document.hidden && state.team) startLive();
      });
  }

  // ── start ────────────────────────────────────────────────────────────────
  loadConversations()
    .then(function (hasTeam) {
      if (!hasTeam) return;
      startLive();
      var want = Number(new URLSearchParams(window.location.search).get("c"));
      if (want && convById(want)) openConversation(want);
    })
    .catch(function (err) {
      listEl.innerHTML = '<div class="empty-state">' + esc(err.message) + "</div>";
    });
})();
