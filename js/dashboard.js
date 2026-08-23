/* dashboard.js
   Just two summary numbers now: how many customers, and how much has been
   billed this month. Pending Collection and Bills Created Today are gone
   along with the paid/pending concept.
*/
window.VP = window.VP || {};

VP.dashboard = (function () {
  const { money } = VP.utils;

  function renderStats(state) {
    document.getElementById('stat-total-customers').textContent = state.customers.length.toLocaleString('en-IN');

    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthlyTotal = state.bills
      .filter(b => (b.date || '').startsWith(monthPrefix))
      .reduce((s, b) => s + Number(b.amount || 0), 0);
    document.getElementById('stat-monthly-total').textContent = money(monthlyTotal);
  }

  return { renderStats };
})();
