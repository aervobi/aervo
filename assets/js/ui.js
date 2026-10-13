/*
 * Shared UI helpers — replaces per-page toasts and native alert/confirm/prompt.
 * Depends on components.css (.toast, .modal-overlay, .modal, .btn-*).
 *
 *   showToast(message, type?)        type: "success" | "error" | "info" (inferred if omitted)
 *   await uiConfirm(message, opts?)  -> true | false   opts: { title, confirmText, cancelText, danger }
 *   await uiPrompt(message, opts?)   -> string | null  opts: { title, placeholder, value, confirmText }
 *
 * A leading "✓" / "✕" in a toast message is stripped; the toast draws its own icon.
 */
(function () {
  var toastTimer;

  function toastEl() {
    var t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    return t;
  }

  window.showToast = function (message, type) {
    var msg = String(message == null ? "" : message);
    if (!type) {
      if (/^\s*✓/.test(msg)) type = "success";
      else if (
        /^\s*✕|fail|error|could not|couldn't|invalid|not logged|went wrong|please (enter|select|upload|connect|try)/i.test(msg)
      )
        type = "error";
      else type = "info";
    }
    msg = msg.replace(/^\s*[✓✕]\s*/, "");
    var t = toastEl();
    t.textContent = msg;
    t.className = "toast " + type + " show";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      function () {
        t.classList.remove("show");
      },
      type === "error" ? 5000 : 3200,
    );
  };

  function dialog(opts) {
    return new Promise(function (resolve) {
      var previous = document.activeElement;
      var overlay = document.createElement("div");
      overlay.className = "modal-overlay active";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");

      var modal = document.createElement("div");
      modal.className = "modal modal-sm";
      if (opts.title) {
        var h = document.createElement("h3");
        h.textContent = opts.title;
        modal.appendChild(h);
      }
      var p = document.createElement("p");
      p.className = "modal-text";
      p.textContent = opts.message;
      modal.appendChild(p);

      var input = null;
      if (opts.prompt) {
        input = document.createElement("input");
        input.type = "text";
        input.value = opts.value || "";
        input.placeholder = opts.placeholder || "";
        input.className = "input";
        modal.appendChild(input);
      }

      var actions = document.createElement("div");
      actions.className = "modal-actions";
      var cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-secondary";
      cancel.textContent = opts.cancelText || "Cancel";
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");
      ok.textContent = opts.confirmText || "OK";
      actions.appendChild(cancel);
      actions.appendChild(ok);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      function close(value) {
        document.removeEventListener("keydown", onKey, true);
        overlay.remove();
        if (previous && previous.focus) previous.focus();
        resolve(value);
      }
      function accept() {
        close(opts.prompt ? input.value : true);
      }
      function onKey(e) {
        if (e.key === "Escape") {
          e.stopPropagation();
          close(opts.prompt ? null : false);
        } else if (e.key === "Enter" && opts.prompt && document.activeElement === input) {
          e.preventDefault();
          accept();
        }
      }
      document.addEventListener("keydown", onKey, true);
      cancel.addEventListener("click", function () {
        close(opts.prompt ? null : false);
      });
      ok.addEventListener("click", accept);
      overlay.addEventListener("mousedown", function (e) {
        if (e.target === overlay) close(opts.prompt ? null : false);
      });
      (input || ok).focus();
    });
  }

  // Turns an AI reply into safe HTML: everything is escaped, then **bold** and
  // line breaks are re-added. Never put a reply into innerHTML any other way.
  window.formatAiReply = function (text) {
    var safe = String(text == null ? "" : text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
    return safe
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");
  };

  window.uiConfirm = function (message, opts) {
    opts = opts || {};
    return dialog({
      message: message,
      title: opts.title,
      confirmText: opts.confirmText || "Confirm",
      cancelText: opts.cancelText,
      danger: opts.danger !== false && /delete|remove|disconnect|dismiss|cannot be undone/i.test(message),
    });
  };

  window.uiPrompt = function (message, opts) {
    opts = opts || {};
    return dialog({
      message: message,
      prompt: true,
      title: opts.title,
      placeholder: opts.placeholder,
      value: opts.value,
      confirmText: opts.confirmText || "Continue",
    });
  };
})();
