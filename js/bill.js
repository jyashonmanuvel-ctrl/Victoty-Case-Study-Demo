/* bill.js
   Bills are now just: Bill Number (optional), Customer, Date, Description,
   Amount. No paid/pending/status tracking. Clicking a bill anywhere opens a
   read-only View popup; "Edit" inside that popup opens the editable form.
*/
window.VP = window.VP || {};

VP.bill = (function () {
  const { money, formatDate, todayISO, showToast, confirm } = VP.utils;

  function clearFieldErrors(ids) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('invalid'); });
  }
  function customerName(state, custId) {
    const c = state.customers.find(x => x.id === custId);
    return c ? c.name : 'Unknown customer';
  }
  function findBill(state, id) {
    return state.bills.find(b => String(b._id) === String(id));
  }

  /* ---------------- Add / Edit modal ---------------- */

  function openAddModal(prefillCustomerId) {
    const state = VP.app.state;
    clearFieldErrors(['f-bill-customer', 'f-bill-amount']);

    const sel = document.getElementById('in-bill-customer');
    sel.innerHTML = '<option value="">Select Customer</option>' +
      state.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    document.getElementById('billModalTitle').textContent = 'Add New Bill';
    document.getElementById('billSaveBtn').textContent = 'Save Bill';
    state.editingBillId = null;

    document.getElementById('in-bill-no').value = '';
    sel.value = prefillCustomerId || state.currentDetailId || '';
    document.getElementById('in-bill-date').value = todayISO();
    document.getElementById('in-bill-qty').value = '';
    document.getElementById('in-bill-description').value = '';
    document.getElementById('in-bill-remarks').value = '';
    document.getElementById('in-bill-amount').value = '';

    document.getElementById('billModal').classList.add('show');
  }

  function openEditModal(billId) {
    const state = VP.app.state;
    const b = findBill(state, billId);
    if (!b) return;
    clearFieldErrors(['f-bill-customer', 'f-bill-amount']);

    const sel = document.getElementById('in-bill-customer');
    sel.innerHTML = '<option value="">Select Customer</option>' +
      state.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    sel.value = b.customerId;

    document.getElementById('billModalTitle').textContent = 'Edit Bill';
    document.getElementById('billSaveBtn').textContent = 'Save Changes';
    state.editingBillId = b._id;

    document.getElementById('in-bill-no').value = b.billNo || '';
    document.getElementById('in-bill-date').value = b.date;
    document.getElementById('in-bill-qty').value = b.qty || '';
    document.getElementById('in-bill-description').value = b.description || '';
    document.getElementById('in-bill-remarks').value = b.remarks || '';
    document.getElementById('in-bill-amount').value = b.amount;

    closeViewModal();
    document.getElementById('billModal').classList.add('show');
  }

  async function submit() {
    const state = VP.app.state;
    const custId = document.getElementById('in-bill-customer').value;
    const amount = parseFloat(document.getElementById('in-bill-amount').value);
    const date = document.getElementById('in-bill-date').value || todayISO();
    const billNo = document.getElementById('in-bill-no').value.trim(); // left empty if not filled
    const qtyRaw = document.getElementById('in-bill-qty').value;
    const qty = qtyRaw === '' ? null : parseFloat(qtyRaw);
    const description = document.getElementById('in-bill-description').value.trim();
    const remarks = document.getElementById('in-bill-remarks').value.trim();

    let ok = true;
    clearFieldErrors(['f-bill-customer', 'f-bill-amount']);
    if (!custId) { document.getElementById('f-bill-customer').classList.add('invalid'); ok = false; }
    if (!amount || amount <= 0) { document.getElementById('f-bill-amount').classList.add('invalid'); ok = false; }
    if (billNo) {
      const dupe = state.bills.some(b => b.billNo === billNo && String(b._id) !== String(state.editingBillId));
      if (dupe) { showToast('✕ That bill number is already in use', true); return; }
    }
    if (!ok) return;

    let persistFailed = false;

    if (state.editingBillId) {
      const b = findBill(state, state.editingBillId);
      Object.assign(b, { billNo, customerId: custId, date, qty, description, amount, remarks });
      try { await VP.storage.put(VP.storage.STORE_BILLS, b); }
      catch (e) { persistFailed = true; }
    } else {
      const newBill = { customerId: custId, date, qty, description, amount, remarks, billNo, createdAt: Date.now() };
      try {
        const key = await VP.storage.put(VP.storage.STORE_BILLS, newBill);
        newBill._id = key;
      } catch (e) {
        persistFailed = true;
        newBill._id = 'mem' + Date.now();
      }
      state.bills.push(newBill);
    }

    document.getElementById('billModal').classList.remove('show');
    VP.app.renderCurrentView();
    showToast(persistFailed
      ? '⚠ Bill saved for this session, but could not be written to storage'
      : (state.editingBillId ? '✓ Bill updated' : '✓ Bill saved'));
  }

  function remove(billId) {
    const state = VP.app.state;
    const b = findBill(state, billId);
    if (!b) return;
    confirm({
      title: 'Delete this bill?',
      message: `Bill ${b.billNo ? '#' + b.billNo : '(no number)'} will be permanently removed. This can't be undone.`,
      confirmLabel: 'Delete Bill',
      danger: true
    }, async () => {
      state.bills = state.bills.filter(x => String(x._id) !== String(billId));
      try { await VP.storage.remove(VP.storage.STORE_BILLS, b._id); }
      catch (e) { /* still removed from this session's view */ }
      closeViewModal();
      showToast('✓ Bill deleted');
      VP.app.renderCurrentView();
    });
  }

  /* ---------------- View popup (read-only, opened by clicking a bill) ---------------- */

  function openViewModal(billId) {
    const state = VP.app.state;
    const b = findBill(state, billId);
    if (!b) return;

    document.getElementById('viewBillTitle').textContent = b.billNo ? ('Bill #' + b.billNo) : 'Bill (no number)';
    document.getElementById('viewBillBody').innerHTML = `
      <div class="view-row"><span class="view-label">Customer</span><span class="view-value">${customerName(state, b.customerId)}</span></div>
      <div class="view-row"><span class="view-label">Date</span><span class="view-value">${formatDate(b.date)}</span></div>
      <div class="view-row"><span class="view-label">Qty</span><span class="view-value">${(b.qty === null || b.qty === undefined || b.qty === '') ? '—' : b.qty}</span></div>
      <div class="view-row"><span class="view-label">Description</span><span class="view-value">${b.description ? b.description.replace(/</g,'&lt;') : '—'}</span></div>
      <div class="view-row"><span class="view-label">Amount</span><span class="view-value">${money(b.amount)}</span></div>
      <div class="view-row"><span class="view-label">Remarks</span><span class="view-value">${b.remarks ? b.remarks.replace(/</g,'&lt;') : '—'}</span></div>
    `;
    document.getElementById('viewBillModal').dataset.billId = billId;
    document.getElementById('viewBillModal').classList.add('show');
  }

  function closeViewModal() {
    document.getElementById('viewBillModal').classList.remove('show');
  }

  function editFromView() {
    const id = document.getElementById('viewBillModal').dataset.billId;
    openEditModal(id);
  }
  function deleteFromView() {
    const id = document.getElementById('viewBillModal').dataset.billId;
    remove(id);
  }

  /* ---------------- Billing history table (customer detail page) ---------------- */

  function renderBillingHistory(custBills) {
    const body = document.getElementById('billingHistoryBody');
    const totalCount = custBills.length;

    const q = (document.getElementById('invoiceSearchInput').value || '').toLowerCase().trim();
    let list = custBills.slice();
    if (q) {
      list = list.filter(b =>
        (b.billNo || '').toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
      );
    }

    // Always newest first (the sort dropdown was removed from this table).
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (totalCount === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <strong>No bills yet</strong>
        <span>Click "Create New Bill" to add the first invoice.</span>
      </div></td></tr>`;
    } else if (list.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <strong>No matches</strong><span>Try a different search term.</span>
      </div></td></tr>`;
    } else {
      body.innerHTML = list.map(b => `<tr class="row" onclick="VP.bill.openViewModal('${b._id}')">
          <td>${formatDate(b.date)}</td>
          <td style="font-weight:700;">${b.billNo ? '#' + b.billNo : '—'}</td>
          <td>${b.description ? b.description.replace(/</g,'&lt;') : '—'}</td>
          <td>${(b.qty === null || b.qty === undefined || b.qty === '') ? '—' : b.qty}</td>
          <td>${money(b.amount)}</td>
          <td>${b.remarks ? b.remarks.replace(/</g,'&lt;') : '—'}</td>
        </tr>`).join('');
    }
    document.getElementById('d-showing').textContent = `Showing ${list.length} of ${totalCount} entries`;
  }

  /* ---------------- Recent bills table (home dashboard) ---------------- */

  function renderRecentBills(state) {
    const body = document.getElementById('recentBillsBody');
    const q = (document.getElementById('searchInput').value || '').toLowerCase().trim();

    let list = state.bills.slice();
    if (q) {
      list = list.filter(b =>
        (b.billNo || '').toLowerCase().includes(q) ||
        customerName(state, b.customerId).toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
      );
    }
    // Newest first; ties broken by when the bill was added, most recent first.
    list.sort((a, b) => {
      const cmp = (b.date || '').localeCompare(a.date || '');
      if (cmp !== 0) return cmp;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    const recent = list.slice(0, 8);

    if (state.bills.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7"><div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
        <strong>No bills yet</strong>
        <span>Click "New Bill" above to create your first invoice.</span>
      </div></td></tr>`;
    } else if (recent.length === 0) {
      body.innerHTML = `<tr class="empty-row"><td colspan="7"><div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <strong>No matches</strong><span>Try a different search term.</span>
      </div></td></tr>`;
    } else {
      body.innerHTML = recent.map(b => `<tr class="row" onclick="VP.bill.openViewModal('${b._id}')">
          <td>${customerName(state, b.customerId)}</td>
          <td>${formatDate(b.date)}</td>
          <td style="font-weight:700;">${b.billNo ? '#' + b.billNo : '—'}</td>
          <td>${b.description ? b.description.replace(/</g,'&lt;') : '—'}</td>
          <td>${(b.qty === null || b.qty === undefined || b.qty === '') ? '—' : b.qty}</td>
          <td>${money(b.amount)}</td>
          <td>${b.remarks ? b.remarks.replace(/</g,'&lt;') : '—'}</td>
        </tr>`).join('');
    }
    document.getElementById('recentBillsShowing').textContent =
      state.bills.length ? `Showing ${recent.length} most recently added bill${recent.length === 1 ? '' : 's'}` : 'No bills yet';
  }

  return {
    openAddModal, openEditModal, submit, remove,
    openViewModal, closeViewModal, editFromView, deleteFromView,
    renderBillingHistory, renderRecentBills
  };
})();
