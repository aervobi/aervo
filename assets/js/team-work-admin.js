/*
 * Team management tabs for team work: Announcements, Checklists, Tasks and
 * Performance. Loaded by /team/manage; team-manage.js owns the page and the tab
 * bar and calls AervoTeamWork.show(tab, panel, team) for these tabs.
 * Talks to /api/team/work/* (aervo-backend/routes/teamWork.js); the server
 * enforces who may do what. Everything people typed goes through esc() before
 * it reaches innerHTML.
 */
(function () {
  var API = "https://api.aervoapp.com";
  var ROLE_LABEL = { owner: "Owner", supervisor: "Supervisor", member: "Member" };
  var DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var panel = null; // the tab's container
  var team = null; // GET /api/team (members, me, permissions)
  var current = null; // which tab is showing
  var perfDays = 7;

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
          if (!res.ok || data.success === false) throw new Error(data.message || "Something went wrong. Please try again.");
          return data;
        });
    });
  }

  function shortDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function localDay() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function scheduleText(days) {
    if (!days || !days.length) return "Every day";
    if (days.join() === "1,2,3,4,5") return "Weekdays";
    if (days.join() === "0,6") return "Weekends";
    return days.map(function (d) { return DAY_SHORT[d]; }).join(", ");
  }

  function forText(role) {
    return role === "supervisor" ? "Supervisors" : role === "member" ? "Members" : "Everyone";
  }

  function card(title, sub, body, action) {
    return (
      '<section class="card"><div class="tm-card-head"><div><h2>' + title + "</h2>" +
      (sub ? '<div class="tm-sub">' + sub + "</div>" : "") + "</div>" + (action || "") + "</div>" + body + "</section>"
    );
  }

  function failed(err) {
    showToast(err.message, "error");
  }

  // Simple dialog shell (same pattern as the Messages page)
  function modal(html, onReady) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay active";
    overlay.innerHTML = '<div class="modal modal-wide" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(overlay);
    var opener = document.activeElement;
    function close() {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      if (opener && opener.focus) opener.focus();
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
    if (onReady) onReady(overlay, close);
    return close;
  }

  // ── Announcements ──────────────────────────────────────────────────────────
  function showAnnouncements() {
    return api("GET", "/api/team/work/announcements").then(function (d) {
      var list = d.announcements
        .map(function (a) {
          var readers = a.readers || [];
          var read = readers.filter(function (r) { return r.readAt; });
          return (
            '<article class="tw-ann">' +
            '<div class="tw-ann-body">' + esc(a.body) + "</div>" +
            '<div class="tw-ann-meta"><span>' + esc(a.author.name) + " · " + esc(shortDate(a.createdAt)) + "</span>" +
            (readers.length
              ? '<details class="tw-readers"><summary>Read by ' + read.length + " of " + readers.length + "</summary><ul>" +
                readers
                  .map(function (r) {
                    return "<li>" + (r.readAt ? "✅ " : "⏳ ") + esc(r.name) + (r.readAt ? ' <span class="text-muted">' + esc(shortDate(r.readAt)) + "</span>" : ' <span class="text-muted">not yet</span>') + "</li>";
                  })
                  .join("") +
                "</ul></details>"
              : "") +
            (a.canDelete ? '<button type="button" class="btn btn-ghost btn-sm" data-w="ann-delete" data-id="' + a.id + '">Delete</button>' : "") +
            "</div></article>"
          );
        })
        .join("");
      panel.innerHTML =
        card(
          "Post an announcement",
          "Everyone on the team sees it on their home page and taps “Got it”. You'll see who has read it.",
          '<form id="twAnnForm"><textarea class="input" id="twAnnBody" rows="3" maxlength="2000" required placeholder="e.g. Truck arrives at 7am tomorrow. Two people on receiving, please."></textarea>' +
            '<div class="tw-actions"><button type="submit" class="btn btn-primary btn-sm">Post</button></div></form>'
        ) +
        card("Recent announcements", "", list || '<div class="empty-state">No announcements yet.</div>');
      document.getElementById("twAnnForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var body = document.getElementById("twAnnBody").value;
        e.target.querySelector("button").disabled = true;
        api("POST", "/api/team/work/announcements", { body: body })
          .then(function () {
            showToast("Announcement posted", "success");
            return showAnnouncements();
          })
          .catch(function (err) {
            failed(err);
            e.target.querySelector("button").disabled = false;
          });
      });
    });
  }

  // ── Checklists ─────────────────────────────────────────────────────────────
  var checklists = [];

  function showChecklists() {
    return api("GET", "/api/team/work/checklists").then(function (d) {
      checklists = d.checklists;
      var list = checklists
        .map(function (c) {
          var pct = c.week.due ? Math.round((c.week.done / c.week.due) * 100) : null;
          return (
            '<div class="tw-row">' +
            '<div class="tw-row-main"><div class="tm-name">' + esc(c.title) + "</div>" +
            '<div class="tm-sub">' + esc(scheduleText(c.days)) + " · " + forText(c.assigneeRole) + " · " + c.items.length + (c.items.length === 1 ? " item" : " items") + "</div></div>" +
            '<div class="tw-row-stat">' +
            (pct == null ? '<span class="tm-sub">No runs yet</span>' : '<div class="tw-meter"><div style="width:' + pct + '%"></div></div><span class="tm-sub">' + pct + "% done, last 7 days</span>") +
            "</div>" +
            '<div class="tm-actions"><button type="button" class="btn btn-ghost btn-sm" data-w="cl-edit" data-id="' + c.id + '">Edit</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-w="cl-delete" data-id="' + c.id + '">Delete</button></div>' +
            "</div>"
          );
        })
        .join("");
      panel.innerHTML = card(
        "Checklists",
        "Recurring lists for opening, closing and anything done every shift. Anyone the list is for can tick items; one tick counts for the whole team.",
        list || '<div class="empty-state"><div class="empty-state-title">No checklists yet</div><div class="empty-state-sub">Start with an opening or closing checklist.</div></div>',
        '<button type="button" class="btn btn-primary btn-sm" data-w="cl-new">New checklist</button>'
      );
    });
  }

  function itemRow(it) {
    return (
      '<div class="tw-item"' + (it.id ? ' data-item-id="' + it.id + '"' : "") + '>' +
      '<input class="input input-sm" maxlength="200" placeholder="e.g. Count the till" value="' + esc(it.text || "") + '" aria-label="Checklist item" />' +
      '<button type="button" class="btn btn-ghost btn-sm" data-remove aria-label="Remove item">✕</button></div>'
    );
  }

  function editChecklist(c) {
    c = c || { title: "", days: [], assigneeRole: null, items: [{ text: "" }, { text: "" }, { text: "" }] };
    var days = c.days && c.days.length ? c.days : [0, 1, 2, 3, 4, 5, 6];
    modal(
      "<h3>" + (c.id ? "Edit checklist" : "New checklist") + "</h3>" +
      '<form id="twClForm">' +
      '<label class="field-label" for="twClTitle">Name</label>' +
      '<input class="input" id="twClTitle" maxlength="120" required placeholder="e.g. Opening shift" value="' + esc(c.title) + '" />' +
      '<div class="field-label mt-4">Days</div><div class="tw-days">' +
      DAY_SHORT.map(function (n, i) {
        return '<label class="tw-day"><input type="checkbox" value="' + i + '"' + (days.indexOf(i) > -1 ? " checked" : "") + " /><span>" + n + "</span></label>";
      }).join("") +
      "</div>" +
      '<label class="field-label mt-4" for="twClFor">Who it\'s for</label>' +
      '<select class="input" id="twClFor">' +
      [["", "Everyone"], ["member", "Members"], ["supervisor", "Supervisors"]]
        .map(function (o) { return '<option value="' + o[0] + '"' + ((c.assigneeRole || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; })
        .join("") +
      "</select>" +
      '<div class="field-label mt-4">Items</div><div class="tw-items" id="twClItems">' + c.items.map(itemRow).join("") + "</div>" +
      '<button type="button" class="btn btn-ghost btn-sm mt-2" id="twClAdd">+ Add item</button>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (c.id ? "Save" : "Create checklist") + "</button></div></form>",
      function (el, close) {
        var items = el.querySelector("#twClItems");
        el.querySelector("#twClAdd").addEventListener("click", function () {
          items.insertAdjacentHTML("beforeend", itemRow({ text: "" }));
          items.lastElementChild.querySelector("input").focus();
        });
        items.addEventListener("click", function (e) {
          if (e.target.closest("[data-remove]")) e.target.closest(".tw-item").remove();
        });
        el.querySelector("#twClTitle").focus();
        el.querySelector("#twClForm").addEventListener("submit", function (e) {
          e.preventDefault();
          var body = {
            title: el.querySelector("#twClTitle").value,
            days: Array.prototype.map.call(el.querySelectorAll(".tw-day input:checked"), function (x) { return Number(x.value); }),
            assigneeRole: el.querySelector("#twClFor").value || null,
            items: Array.prototype.map.call(items.querySelectorAll(".tw-item"), function (row) {
              return { id: Number(row.getAttribute("data-item-id")) || undefined, text: row.querySelector("input").value };
            }),
          };
          if (!body.days.length) return showToast("Pick at least one day.", "error");
          api(c.id ? "PUT" : "POST", "/api/team/work/checklists" + (c.id ? "/" + c.id : ""), body)
            .then(function () {
              close();
              showToast(c.id ? "Checklist saved" : "Checklist created", "success");
              return showChecklists();
            })
            .catch(failed);
        });
      }
    );
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  var tasks = [];

  function assigneeOptions(selected) {
    return (
      '<option value="">Anyone on the team</option>' +
      (team.members || [])
        .map(function (m) {
          return '<option value="' + m.userId + '"' + (selected === m.userId ? " selected" : "") + ">" + esc(m.name) + (m.isYou ? " (you)" : "") + "</option>";
        })
        .join("")
    );
  }

  function showTasks() {
    return api("GET", "/api/team/work/tasks?scope=all").then(function (d) {
      tasks = d.tasks;
      var today = localDay();
      var row = function (t) {
        var late = !t.done && t.dueDate && t.dueDate < today;
        return (
          '<div class="tw-row' + (t.done ? " tw-done" : "") + '">' +
          '<input type="checkbox" class="tw-check" data-w="task-done" data-id="' + t.id + '"' + (t.done ? " checked" : "") + ' aria-label="Done" />' +
          '<div class="tw-row-main"><div class="tm-name">' + esc(t.title) + "</div>" +
          '<div class="tm-sub">' + (t.assignee ? esc(t.assignee.name) : "Anyone") +
          (t.dueDate ? ' · <span class="' + (late ? "text-danger" : "") + '">' + (late ? "Overdue, was due " : "Due ") + esc(shortDate(t.dueDate + "T12:00:00")) + "</span>" : "") +
          (t.done ? " · done by " + esc(t.doneBy) : "") + "</div>" +
          (t.notes ? '<div class="tm-sub tw-notes">' + esc(t.notes) + "</div>" : "") + "</div>" +
          '<div class="tm-actions"><button type="button" class="btn btn-ghost btn-sm" data-w="task-edit" data-id="' + t.id + '">Edit</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-w="task-delete" data-id="' + t.id + '">Delete</button></div></div>'
        );
      };
      var open = tasks.filter(function (t) { return !t.done; });
      var done = tasks.filter(function (t) { return t.done; });
      panel.innerHTML =
        card(
          "Add a task",
          "One-off jobs. Assign someone, or leave it for anyone on the team. It shows on their home page.",
          '<form class="tw-task-form" id="twTaskForm">' +
            '<div><label class="field-label" for="twTaskTitle">Task</label><input class="input" id="twTaskTitle" maxlength="120" required placeholder="e.g. Restock aisle 4" /></div>' +
            '<div><label class="field-label" for="twTaskWho">Assign to</label><select class="input" id="twTaskWho">' + assigneeOptions(null) + "</select></div>" +
            '<div><label class="field-label" for="twTaskDue">Due</label><input class="input" type="date" id="twTaskDue" min="' + today + '" /></div>' +
            '<button type="submit" class="btn btn-primary">Add task</button>' +
            '<div class="tw-task-notes"><label class="field-label" for="twTaskNotes">Notes (optional)</label><input class="input" id="twTaskNotes" maxlength="1000" /></div>' +
            "</form>"
        ) +
        card("Open tasks <span class=\"text-muted\">(" + open.length + ")</span>", "", open.length ? open.map(row).join("") : '<div class="empty-state">Nothing open.</div>') +
        (done.length ? card("Done in the last 7 days", "", done.map(row).join("")) : "");
      document.getElementById("twTaskForm").addEventListener("submit", function (e) {
        e.preventDefault();
        var btn = e.target.querySelector("button[type=submit]");
        btn.disabled = true;
        api("POST", "/api/team/work/tasks", {
          title: document.getElementById("twTaskTitle").value,
          assigneeId: document.getElementById("twTaskWho").value || null,
          dueDate: document.getElementById("twTaskDue").value || null,
          notes: document.getElementById("twTaskNotes").value,
        })
          .then(function () {
            showToast("Task added", "success");
            return showTasks();
          })
          .catch(function (err) {
            failed(err);
            btn.disabled = false;
          });
      });
    });
  }

  function editTask(t) {
    modal(
      "<h3>Edit task</h3><form id=\"twTaskEdit\">" +
      '<label class="field-label" for="twEtTitle">Task</label><input class="input" id="twEtTitle" maxlength="120" required value="' + esc(t.title) + '" />' +
      '<label class="field-label mt-4" for="twEtWho">Assign to</label><select class="input" id="twEtWho">' + assigneeOptions(t.assignee && t.assignee.userId) + "</select>" +
      '<label class="field-label mt-4" for="twEtDue">Due</label><input class="input" type="date" id="twEtDue" value="' + esc(t.dueDate || "") + '" />' +
      '<label class="field-label mt-4" for="twEtNotes">Notes</label><textarea class="input" id="twEtNotes" rows="3" maxlength="1000">' + esc(t.notes) + "</textarea>" +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form>',
      function (el, close) {
        el.querySelector("#twEtTitle").focus();
        el.querySelector("#twTaskEdit").addEventListener("submit", function (e) {
          e.preventDefault();
          api("PATCH", "/api/team/work/tasks/" + t.id, {
            title: el.querySelector("#twEtTitle").value,
            assigneeId: el.querySelector("#twEtWho").value || null,
            dueDate: el.querySelector("#twEtDue").value || null,
            notes: el.querySelector("#twEtNotes").value,
          })
            .then(function () {
              close();
              showToast("Task saved", "success");
              return showTasks();
            })
            .catch(failed);
        });
      }
    );
  }

  // ── Performance ────────────────────────────────────────────────────────────
  function showPerformance() {
    return api("GET", "/api/team/work/performance?days=" + perfDays).then(function (d) {
      var rows = d.people
        .map(function (p) {
          var score = p.score == null
            ? '<span class="tm-sub">Not enough yet</span>'
            : '<div class="tw-score"><div class="tw-meter"><div style="width:' + p.score + '%"></div></div><strong>' + p.score + "</strong></div>";
          return (
            "<tr>" +
            '<td><div class="tm-name">' + esc(p.name) + '</div><div class="tm-sub">' + esc(ROLE_LABEL[p.role] || p.role) + "</div></td>" +
            '<td data-label="Score">' + score + "</td>" +
            '<td data-label="Checklist items">' + p.itemsChecked + "</td>" +
            '<td data-label="Tasks done">' + p.tasksDone + (p.tasksDone ? ' <span class="tm-sub">(' + p.tasksOnTime + " on time)</span>" : "") + "</td>" +
            '<td data-label="Overdue">' + (p.tasksOverdue ? '<span class="text-danger">' + p.tasksOverdue + "</span>" : "0") + "</td>" +
            '<td data-label="Announcements read">' + (p.announcements.total ? p.announcements.read + " of " + p.announcements.total : "—") + "</td>" +
            "</tr>"
          );
        })
        .join("");
      panel.innerHTML = card(
        "Performance",
        "Activity in Aervo over the last " + d.days + " days. The score averages tasks done on time and announcements read, for whatever applies to each person. Sales per person aren't included.",
        rows
          ? '<table class="tm-table"><thead><tr><th>Person</th><th>Score</th><th>Checklist items</th><th>Tasks done</th><th>Overdue</th><th>Announcements read</th></tr></thead><tbody>' + rows + "</tbody></table>"
          : '<div class="empty-state">Invite people to your team to see their activity here.</div>',
        '<div class="tw-seg" role="group" aria-label="Period">' +
          [7, 30].map(function (n) {
            return '<button type="button" class="btn btn-sm ' + (n === perfDays ? "btn-active" : "btn-ghost") + '" data-w="perf-days" data-days="' + n + '" aria-pressed="' + (n === perfDays) + '">' + n + " days</button>";
          }).join("") +
          "</div>"
      );
    });
  }

  // ── wiring ─────────────────────────────────────────────────────────────────
  var SHOW = { announcements: showAnnouncements, checklists: showChecklists, tasks: showTasks, performance: showPerformance };

  function find(list, id) {
    return list.filter(function (x) { return x.id === id; })[0];
  }

  function onClick(e) {
    var el = e.target.closest("[data-w]");
    if (!el || el.type === "checkbox") return;
    var w = el.getAttribute("data-w");
    var id = Number(el.getAttribute("data-id"));
    if (w === "ann-delete") {
      uiConfirm("Delete this announcement for everyone?", { title: "Delete announcement", confirmText: "Delete", danger: true }).then(function (yes) {
        if (yes) api("DELETE", "/api/team/work/announcements/" + id).then(showAnnouncements).catch(failed);
      });
    } else if (w === "cl-new") {
      editChecklist(null);
    } else if (w === "cl-edit") {
      editChecklist(find(checklists, id));
    } else if (w === "cl-delete") {
      var c = find(checklists, id);
      uiConfirm("Delete the “" + c.title + "” checklist? Past ticks still count in Performance.", { title: "Delete checklist", confirmText: "Delete", danger: true }).then(function (yes) {
        if (yes) api("DELETE", "/api/team/work/checklists/" + id).then(showChecklists).catch(failed);
      });
    } else if (w === "task-edit") {
      editTask(find(tasks, id));
    } else if (w === "task-delete") {
      uiConfirm("Delete this task?", { title: "Delete task", confirmText: "Delete", danger: true }).then(function (yes) {
        if (yes) api("DELETE", "/api/team/work/tasks/" + id).then(showTasks).catch(failed);
      });
    } else if (w === "perf-days") {
      perfDays = Number(el.getAttribute("data-days"));
      showPerformance().catch(failed);
    }
  }

  function onChange(e) {
    var el = e.target;
    if (el.getAttribute("data-w") !== "task-done") return;
    el.disabled = true;
    api("PATCH", "/api/team/work/tasks/" + el.getAttribute("data-id"), { done: el.checked }).then(showTasks).catch(function (err) {
      failed(err);
      showTasks();
    });
  }

  window.AervoTeamWork = {
    tabs: ["announcements", "checklists", "tasks", "performance"],
    show: function (tab, container, teamData) {
      if (panel !== container) {
        panel = container;
        panel.addEventListener("click", onClick);
        panel.addEventListener("change", onChange);
      }
      team = teamData;
      current = tab;
      panel.innerHTML = '<div class="empty-state">Loading…</div>';
      (SHOW[tab] || showAnnouncements)().catch(function (err) {
        if (current === tab) panel.innerHTML = '<div class="card text-muted">' + esc(err.message) + "</div>";
      });
    },
  };
})();
