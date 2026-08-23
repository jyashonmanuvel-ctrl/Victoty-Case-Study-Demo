/* app.js
   Bootstraps the app: opens IndexedDB, seeds demo data on first run,
   wires up buttons, handles page navigation (Dashboard / Customers /
   Customer Detail), and owns the single in-memory `state` object.
*/
window.VP = window.VP || {};

VP.app = (function () {
  const { showToast, todayISO } = VP.utils;

  const state = {
    customers: [],
    bills: [],
    currentDetailId: null,
    editingCustomerId: null,
    editingBillId: null,
    activeView: 'dashboard' // 'dashboard' | 'customers' | 'detail'
  };

  const seedCustomers = [
    { id: 'CUS001', name: 'Dravidan Hospital', phone: '+91 98765 43210' },
    { id: 'CUS002', name: 'TELC Church', phone: '+91 98765 00011' },
    { id: 'CUS003', name: 'CSI Church', phone: '+91 98765 00022' },
    { id: 'CUS004', name: 'Subam', phone: '+91 98765 00033' }
  ];
  const seedBills = [
    { billNo: 'INV001', customerId: 'CUS001', date: '2023-10-12', qty: 200, description: 'Prescription pad printing', amount: 850, createdAt: Date.now() - 5000 },
    { billNo: 'INV002', customerId: 'CUS001', date: '2023-09-05', qty: 150, description: 'Discharge summary forms', amount: 1200, createdAt: Date.now() - 4000 },
    { billNo: '', customerId: 'CUS002', date: '2023-10-10', qty: 500, description: 'Sunday bulletin printing', amount: 600, createdAt: Date.now() - 3000 },
    { billNo: 'INV004', customerId: 'CUS003', date: '2023-10-08', qty: 100, description: 'Wedding invitation cards', amount: 840.5, createdAt: Date.now() - 2000 },
    { billNo: 'INV005', customerId: 'CUS004', date: '2023-10-05', qty: 2, description: 'Business cards (2 boxes)', amount: 500, createdAt: Date.now() - 1000 }
  ];

  /* ---------------- View switching ---------------- */

  function setActiveView(view) {
    state.activeView = view;
    document.getElementById('view-dashboard').classList.toggle('hidden', view !== 'dashboard');
    document.getElementById('view-customers').classList.toggle('hidden', view !== 'customers');
    document.getElementById('view-detail').classList.toggle('hidden', view !== 'detail');
    document.getElementById('nav-dashboard').classList.toggle('active', view === 'dashboard');
    document.getElementById('nav-customers').classList.toggle('active', view === 'customers' || view === 'detail');
    renderCurrentView();
  }

  function showDashboard() { state.currentDetailId = null; setActiveView('dashboard'); }
  function showCustomers() { state.currentDetailId = null; setActiveView('customers'); }

  function renderCurrentView() {
    VP.dashboard.renderStats(state);
    if (state.activeView === 'dashboard') {
      VP.bill.renderRecentBills(state);
    } else if (state.activeView === 'customers') {
      VP.customer.renderList(state);
    } else if (state.activeView === 'detail') {
      VP.customer.renderDetail();
    }
  }

  /* ---------------- Modal open/close helpers used by inline onclick ---------------- */

  function openModal(id) { document.getElementById(id).classList.add('show'); }
  function closeModal(id) { document.getElementById(id).classList.remove('show'); }

  function openCustomerAddModal() { VP.customer.openModal('add'); }
  function openBillAddModal() { VP.bill.openAddModal(); }

  /* ---------------- Profile dropdown ---------------- */

  function toggleProfileMenu(evt) {
    evt.stopPropagation();
    document.getElementById('profileDropdown').classList.toggle('show');
  }
  document.addEventListener('click', () => {
    const dd = document.getElementById('profileDropdown');
    if (dd) dd.classList.remove('show');
  });

  /* ---------------- Export / Import / Reset ---------------- */

  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Victor Printers Portal',
      version: 2,
      customers: state.customers,
      bills: state.bills
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'victor-printers-data-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ Data exported as JSON');
  }

  function importData(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function () {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.customers) || !Array.isArray(data.bills)) {
          throw new Error('Missing customers/bills arrays');
        }
        // Drop any stored _id so IndexedDB reassigns clean auto-increment keys.
        const cleanBills = data.bills.map(b => { const { _id, ...rest } = b; return rest; });
        await VP.storage.replaceAll(VP.storage.STORE_CUSTOMERS, data.customers);
        await VP.storage.replaceAll(VP.storage.STORE_BILLS, cleanBills);
        state.customers = await VP.storage.getAll(VP.storage.STORE_CUSTOMERS);
        state.bills = await VP.storage.getAll(VP.storage.STORE_BILLS);
        showDashboard();
        showToast('✓ Imported ' + state.customers.length + ' customers, ' + state.bills.length + ' bills');
      } catch (err) {
        showToast('✕ Import failed — file is not valid exported JSON', true);
      }
      evt.target.value = '';
    };
    reader.readAsText(file);
  }

  function resetApplication() {
    document.getElementById('profileDropdown').classList.remove('show');
    VP.utils.confirm({
      title: 'Reset application?',
      message: 'This clears every customer and bill from this browser. Export your data first if you want a backup. This can\'t be undone.',
      confirmLabel: 'Reset Everything',
      danger: true
    }, async () => {
      state.customers = [];
      state.bills = [];
      await VP.storage.clear(VP.storage.STORE_CUSTOMERS);
      await VP.storage.clear(VP.storage.STORE_BILLS);
      showDashboard();
      showToast('✓ Application reset');
    });
  }

  /* ---------------- Init ---------------- */

  // Add/Edit Customer and Add/Edit Bill popups should only close via the ✕
  // icon or the Cancel button — never by clicking the dark backdrop — so a
  // stray click outside the form can't silently discard in-progress input.
  const NO_BACKDROP_CLOSE = ['customerModal', 'billModal'];

  function wireEvents() {
    document.getElementById('searchInput').addEventListener('input', VP.utils.debounce(renderCurrentView, 150));
    document.getElementById('customerSearchInput').addEventListener('input', VP.utils.debounce(renderCurrentView, 150));
    document.getElementById('invoiceSearchInput').addEventListener('input', VP.utils.debounce(renderCurrentView, 150));
    document.getElementById('sortFilter').addEventListener('change', renderCurrentView);
    document.getElementById('recentBillsSort').addEventListener('change', renderCurrentView);
    document.getElementById('billingHistorySort').addEventListener('change', renderCurrentView);
    document.querySelectorAll('.overlay').forEach(o => {
      if (NO_BACKDROP_CLOSE.includes(o.id)) return;
      o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); });
    });
  }

  async function init() {
    // Wire the UI first so every button, modal, and the pending-amount
    // calculator work immediately — even if IndexedDB is slow, blocked by
    // another tab, or unavailable in this browser.
    wireEvents();
    setActiveView('dashboard');

    let available = false;
    try {
      available = await VP.storage.isAvailable();
    } catch (e) {
      available = false;
    }
    document.getElementById('storageBanner').classList.toggle('show', !available);

    if (available) {
      try {
        state.customers = await VP.storage.getAll(VP.storage.STORE_CUSTOMERS);
        state.bills = await VP.storage.getAll(VP.storage.STORE_BILLS);
        if (state.customers.length === 0 && state.bills.length === 0) {
          await VP.storage.replaceAll(VP.storage.STORE_CUSTOMERS, seedCustomers.slice());
          await VP.storage.replaceAll(VP.storage.STORE_BILLS, seedBills.slice());
          state.customers = await VP.storage.getAll(VP.storage.STORE_CUSTOMERS);
          state.bills = await VP.storage.getAll(VP.storage.STORE_BILLS);
        }
      } catch (e) {
        // Loading failed partway through — still give the user a working session.
        document.getElementById('storageBanner').classList.add('show');
        state.customers = seedCustomers.slice();
        state.bills = seedBills.map((b, i) => ({ ...b, _id: 'mem' + i }));
      }
    } else {
      state.customers = seedCustomers.slice();
      state.bills = seedBills.map((b, i) => ({ ...b, _id: 'mem' + i }));
    }

    renderCurrentView();
  }

  return {
    state, init, setActiveView, showDashboard, showCustomers, renderCurrentView,
    openModal, closeModal, openCustomerAddModal, openBillAddModal, toggleProfileMenu,
    exportData, importData, resetApplication
  };
})();

document.addEventListener('DOMContentLoaded', VP.app.init);
