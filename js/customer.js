/* customer.js
   Customer list page (search/sort), add/edit modal, delete (cascades to
   bills), and the customer detail page. Bills no longer track paid/pending/
   status — a customer's only bill-derived numbers are "how many bills" and
   "total amount billed".
*/
window.VP = window.VP || {};

VP.customer = (function () {
  const { money, formatDate, initialsOf, nextSequentialId, showToast, confirm } = VP.utils;

  const PAGE_SIZE = 10; // customers per page on the Customer List

  function billsFor(state, custId) {
    return state.bills
      .filter(b => b.customerId === custId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  function totalAmountFor(state, custId) {
    return billsFor(state, custId).reduce((s, b) => s + Number(b.amount || 0), 0);
  }
  function lastBillDate(state, custId) {
    const bs = billsFor(state, custId);
    return bs.length ? bs[0].date : null;
  }

  /* ---------------- Customer List page (search + sort) ----------------
     Search matches Customer ID, Customer Name, or the description of any
     bill belonging to that customer — handy for "who was that wedding
     invite job for?" type lookups.
  */

  function getFilteredSortedCustomers(state) {
    const q = (document.getElementById('customerSearchInput').value || '').toLowerCase().trim();
    const sort = document.getElementById('sortFilter').value; // name-asc (default) | name-desc | newest | oldest

    let list = state.customers.slice();

    if (q) {
      list = list.filter(c => {
        if (c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)) return true;
        return billsFor(state, c.id).some(b => (b.description || '').toLowerCase().includes(q));
      });
    }

    list.sort((a, b) => {
      if (sort === 'newest' || sort === 'oldest') {
        const da = lastBillDate(state, a.id) || '0000-00-00';
        const db = lastBillDate(state, b.id) || '0000-00-00';
        return sort === 'oldest' ? da.localeCompare(db) : db.localeCompare(da);
      }
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return sort === 'name-desc' ? -cmp : cmp;
    });

    return list;
  }

  /** Page numbers to show, e.g. [1, '…', 4, 5, 6, '…', 20]. Short lists show every page. */
  function pageItems(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const items = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);
    if (from > 2) items.push('…');
    for (let p = from; p <= to; p++) items.push(p);
    if (to < total - 1) items.push('…');
    items.push(total);
    return items;
  }

  function renderPagination(current, totalPages) {
    const el = document.getElementById('customerPagination');
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    const btn = (label, page, opts = {}) =>
      `<button class="page-btn${opts.active ? ' active' : ''}" ${opts.disabled ? 'disabled' : ''}
        ${opts.active ? 'aria-current="page"' : ''} onclick="VP.customer.goToPage(${page})">${label}</button>`;
    el.innerHTML =
      btn('‹ Prev', current - 1, { disabled: current === 1 }) +
      pageItems(current, totalPages).map(p =>
        p === '…' ? '<span class="page-gap">…</span>' : btn(p, p, { active: p === current })
      ).join('') +
      btn('Next ›', current + 1, { disabled: current === totalPages });
  }

  function goToPage(page) {
    VP.app.state.customerPage = page;
    VP.app.renderCurrentView();
  }

  function renderList(state) {
    const tbody = document.getElementById('customerTbody');
    const list = getFilteredSortedCustomers(state);

    // Paginate: 10 per page. Clamp in case the list shrank (search, delete, import).
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.customerPage = Math.min(Math.max(1, state.customerPage || 1), totalPages);
    const startIdx = (state.customerPage - 1) * PAGE_SIZE;
    const pageList = list.slice(startIdx, startIdx + PAGE_SIZE);

    if (state.customers.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <strong>No customers yet</strong>
        <span>Click "New Customer" to add your first client.</span>
      </div></td></tr>`;
    } else if (list.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <strong>No matches</strong>
        <span>Try a different search term.</span>
      </div></td></tr>`;
    } else {
      tbody.innerHTML = pageList.map(c => {
        const total = totalAmountFor(state, c.id);
        const last = lastBillDate(state, c.id);
        return `<tr class="row" onclick="VP.customer.openDetail('${c.id}')">
          <td>${c.id}</td>
          <td><div class="cust-cell"><div class="cust-avatar">${initialsOf(c.name)}</div>${c.name}</div></td>
          <td>${c.phone || '—'}</td>
          <td>${last ? formatDate(last) : '—'}</td>
          <td>${money(total)}</td>
        </tr>`;
      }).join('');
    }

    // Footer text:  "Showing 4 out of 4 customers"  (everything fits on one page)
    //               "Showing 1 to 10 out of 100 customers"  (multiple pages)
    const total = list.length;
    const noun = total === 1 ? 'customer' : 'customers';
    let text;
    if (totalPages === 1 || total === 0) {
      text = `Showing ${total} out of ${total} ${noun}`;
    } else {
      const from = startIdx + 1;
      const to = startIdx + pageList.length;
      text = `Showing ${from} to ${to} out of ${total} ${noun}`;
    }
    if (total !== state.customers.length) text += ` (filtered from ${state.customers.length})`;
    document.getElementById('showingText').textContent = text;
    renderPagination(state.customerPage, totalPages);
  }

  /* ---------------- Add / Edit modal ---------------- */

  function clearFieldErrors(ids) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('invalid'); });
  }

  function openModal(mode, custId) {
    const state = VP.app.state;
    clearFieldErrors(['f-cust-name']);
    document.getElementById('customerModalTitle').textContent = mode === 'edit' ? 'Edit Customer' : 'Add New Customer';
    document.getElementById('customerSaveBtn').textContent = mode === 'edit' ? 'Save Changes' : 'Save Customer';
    state.editingCustomerId = mode === 'edit' ? custId : null;

    if (mode === 'edit') {
      const c = state.customers.find(x => x.id === custId);
      document.getElementById('in-cust-name').value = c.name || '';
      document.getElementById('in-cust-phone').value = c.phone || '';
    } else {
      document.getElementById('in-cust-name').value = '';
      document.getElementById('in-cust-phone').value = '';
    }
    document.getElementById('customerModal').classList.add('show');
  }

  function submit() {
    const state = VP.app.state;
    const name = document.getElementById('in-cust-name').value.trim();
    const phone = document.getElementById('in-cust-phone').value.trim(); // optional

    clearFieldErrors(['f-cust-name']);
    if (!name) { document.getElementById('f-cust-name').classList.add('invalid'); return; }

    if (state.editingCustomerId) {
      const c = state.customers.find(x => x.id === state.editingCustomerId);
      Object.assign(c, { name, phone });
      VP.storage.put(VP.storage.STORE_CUSTOMERS, c).catch(() => {});
      showToast('✓ Customer updated');
    } else {
      let id = nextSequentialId('CUS', state.customers.map(c => c.id));
      while (state.customers.some(c => c.id === id)) {
        id = nextSequentialId('CUS', state.customers.map(c => c.id).concat(id));
      }
      const newCust = { id, name, phone };
      state.customers.push(newCust);
      VP.storage.put(VP.storage.STORE_CUSTOMERS, newCust).catch(() => {});
      showToast('✓ Customer "' + name + '" added');
    }

    document.getElementById('customerModal').classList.remove('show');
    VP.app.renderCurrentView();
  }

  function remove(custId) {
    const state = VP.app.state;
    const c = state.customers.find(x => x.id === custId);
    if (!c) return;
    const toDelete = billsFor(state, custId);
    confirm({
      title: 'Delete this customer?',
      message: `"${c.name}" and all ${toDelete.length} associated bill${toDelete.length === 1 ? '' : 's'} will be permanently removed. This can't be undone.`,
      confirmLabel: 'Delete Customer',
      danger: true
    }, async () => {
      state.customers = state.customers.filter(x => x.id !== custId);
      state.bills = state.bills.filter(b => b.customerId !== custId);
      try {
        await VP.storage.remove(VP.storage.STORE_CUSTOMERS, custId);
        for (const b of toDelete) await VP.storage.remove(VP.storage.STORE_BILLS, b._id);
      } catch (e) { /* still removed from this session's view */ }
      showToast('✓ Customer deleted');
      VP.app.showCustomers();
    });
  }

  /* ---------------- Detail page ---------------- */

  function openDetail(custId) {
    const state = VP.app.state;
    if (!state.customers.some(c => c.id === custId)) return;
    state.currentDetailId = custId;
    const invoiceSearch = document.getElementById('invoiceSearchInput');
    if (invoiceSearch) invoiceSearch.value = ''; // fresh search per customer
    VP.app.setActiveView('detail');
    renderDetail();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderDetail() {
    const state = VP.app.state;
    const c = state.customers.find(x => x.id === state.currentDetailId);
    if (!c) { VP.app.showCustomers(); return; }

    document.getElementById('d-id').textContent = 'ID: ' + c.id;
    document.getElementById('d-name').textContent = c.name;
    document.getElementById('d-phone').textContent = c.phone || '—';

    const custBills = billsFor(state, c.id);
    const total = totalAmountFor(state, c.id);

    document.getElementById('d-total-bills').innerHTML = custBills.length + ' <span class="unit">invoices</span>';
    document.getElementById('d-total-amount').textContent = money(total);

    VP.bill.renderBillingHistory(custBills);
  }

  return {
    renderList, goToPage, openModal, submit, remove, openDetail, renderDetail,
    billsFor, totalAmountFor, lastBillDate
  };
})();
