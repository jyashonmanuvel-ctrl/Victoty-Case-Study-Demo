/* utils.js
   Small, reusable helper functions shared across the app.
   Everything lives on the global VP namespace to avoid ES module
   loading (which breaks under file:// in some browsers).
*/
window.VP = window.VP || {};

VP.utils = (function () {

  /** Format a number as Indian Rupees, e.g. 1234.5 -> "₹1,234.50" */
  function money(n) {
    n = Number(n) || 0;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Today's date as YYYY-MM-DD, used for storage and default form values. */
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Turn an ISO date (YYYY-MM-DD) into "Oct 12, 2023" for display. */
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  }

  /** "Dravidan hospital" -> "DH", used for the avatar circle. */
  function initialsOf(name) {
    return (name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  }

  /** Debounce helper for the search box so we don't re-render on every keystroke. */
  function debounce(fn, delay) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Generate the next sequential ID like CUS004 or INV004 from a list of
   * existing ids that share the same prefix. Pads to at least 3 digits.
   */
  function nextSequentialId(prefix, existingIds) {
    let max = 0;
    existingIds.forEach(id => {
      const m = String(id).match(new RegExp('^' + prefix + '(\\d+)$'));
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    const next = max + 1;
    return prefix + String(next).padStart(3, '0');
  }

  /* ---------------- Toast ---------------- */
  function showToast(msg, isError) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ---------------- Confirm dialog ----------------
     A single reusable confirmation modal. Call:
     VP.utils.confirm({ title, message, confirmLabel, danger:true }, onConfirm)
  */
  function confirmDialog(opts, onConfirm) {
    const overlay = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = opts.title || 'Are you sure?';
    document.getElementById('confirmMessage').textContent = opts.message || '';
    const btn = document.getElementById('confirmActionBtn');
    btn.textContent = opts.confirmLabel || 'Confirm';
    btn.className = 'btn ' + (opts.danger ? 'btn-danger solid' : 'btn-primary');
    overlay.classList.add('show');

    const cleanup = () => {
      overlay.classList.remove('show');
      btn.removeEventListener('click', handleConfirm);
    };
    const handleConfirm = () => {
      cleanup();
      onConfirm && onConfirm();
    };
    btn.addEventListener('click', handleConfirm);
    document.getElementById('confirmCancelBtn').onclick = cleanup;
  }

  return { money, todayISO, formatDate, initialsOf, debounce, nextSequentialId, showToast, confirm: confirmDialog };
})();
