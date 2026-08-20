'use strict';

let COMPONENTS = [];
let inventory = {};
let currentUser = '';
let currentNote = '';
let historySnapshot = null;

const loginOverlay = document.getElementById('loginOverlay');
const app = document.getElementById('app');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const currentUserEl = document.getElementById('currentUser');

const tabs = document.querySelectorAll('.tab');
const pages = document.querySelectorAll('.page');

const entryForm = document.getElementById('entryForm');
const productSearch = document.getElementById('productSearch');
const selectedProductId = document.getElementById('selectedProductId');
const suggestions = document.getElementById('suggestions');
const selectedProductInfo = document.getElementById('selectedProductInfo');
const quantityInput = document.getElementById('quantityInput');
const expiryInput = document.getElementById('expiryInput');
const entryMessage = document.getElementById('entryMessage');
const resetEntryBtn = document.getElementById('resetEntryBtn');

const stockTableBody = document.getElementById('stockTableBody');
const orderTableBody = document.getElementById('orderTableBody');
const orderEmpty = document.getElementById('orderEmpty');
const orderTableWrap = document.getElementById('orderTableWrap');
const orderBadge = document.getElementById('orderBadge');
const expiryTableBody = document.getElementById('expiryTableBody');
const expiryEmpty = document.getElementById('expiryEmpty');
const expiryTableWrap = document.getElementById('expiryTableWrap');
const recommendationNotes = document.getElementById('recommendationNotes');
const saveNotesBtn = document.getElementById('saveNotesBtn');
const notesStatus = document.getElementById('notesStatus');

const historyDate = document.getElementById('historyDate');
const loadHistoryBtn = document.getElementById('loadHistoryBtn');
const historyStatus = document.getElementById('historyStatus');
const historyContent = document.getElementById('historyContent');
const historyTableBody = document.getElementById('historyTableBody');
const historyNote = document.getElementById('historyNote');
const exportHistoryPdf = document.getElementById('exportHistoryPdf');
const exportHistoryExcel = document.getElementById('exportHistoryExcel');

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  let payload = {};
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    const error = new Error(payload.error || `Erreur HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function showApp() {
  loginOverlay.classList.add('hidden');
  app.classList.remove('hidden');
  currentUserEl.textContent = currentUser ? `Connecté : ${currentUser}` : '';
  renderAll();
}

function showLogin() {
  app.classList.add('hidden');
  loginOverlay.classList.remove('hidden');
  loginForm.reset();
  loginError.textContent = '';
  setTimeout(() => document.getElementById('loginUsername').focus(), 0);
}

async function loadApplicationData() {
  const [components, items, note] = await Promise.all([
    api('/api/components'),
    api('/api/inventory'),
    api('/api/notes/current')
  ]);

  COMPONENTS = components;
  inventory = {};
  items.forEach((item) => {
    inventory[item.id] = {
      quantity: Number(item.quantity) || 0,
      expiry: item.expiry || '',
      updatedAt: item.updated_at || null,
      updatedBy: item.updated_by || null
    };
  });

  currentNote = note.content || '';
  recommendationNotes.value = currentNote;
  historyDate.value = getTodayFileName();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUsername').value.trim(),
        password: document.getElementById('loginPassword').value
      })
    });
    currentUser = result.user.username;
    await loadApplicationData();
    showApp();
  } catch (error) {
    loginError.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST', body: '{}' });
  } catch {
    // Même si le serveur ne répond pas, on masque les données côté navigateur.
  }
  COMPONENTS = [];
  inventory = {};
  currentNote = '';
  currentUser = '';
  historySnapshot = null;
  showLogin();
});

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    pages.forEach((page) => page.classList.remove('active-page'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.page).classList.add('active-page');

    if (tab.dataset.page === 'stockPage') renderStockTable();
    if (tab.dataset.page === 'orderPage') renderOrderPage();
  });
});

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('fr-FR');
}

function getComponentById(id) {
  return COMPONENTS.find((component) => component.id === id);
}

function renderSuggestions(searchTerm) {
  const term = normalize(searchTerm);
  suggestions.innerHTML = '';
  if (!term) {
    suggestions.classList.add('hidden');
    return;
  }

  const startsWith = COMPONENTS.filter((component) =>
    normalize(component.name).startsWith(term) || normalize(component.id).startsWith(term)
  );
  const contains = COMPONENTS.filter((component) =>
    !startsWith.includes(component) &&
    (normalize(component.name).includes(term) || normalize(component.id).includes(term))
  );
  const matches = [...startsWith, ...contains].slice(0, 12);

  if (matches.length === 0) {
    suggestions.innerHTML = '<div class="suggestion-item">Aucun composant trouvé</div>';
    suggestions.classList.remove('hidden');
    return;
  }

  matches.forEach((component) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.innerHTML = `
      <span class="suggestion-code">${escapeHtml(component.name)}</span>
      <span class="suggestion-threshold">Mini ${component.min} · Maxi ${component.max}</span>
    `;
    button.addEventListener('click', () => selectProduct(component.id));
    suggestions.appendChild(button);
  });
  suggestions.classList.remove('hidden');
}

function selectProduct(id) {
  const component = getComponentById(id);
  if (!component) return;
  selectedProductId.value = component.id;
  productSearch.value = component.name;
  selectedProductInfo.textContent = `Stock mini : ${component.min} — Stock maxi : ${component.max}`;
  quantityInput.value = inventory[component.id]?.quantity ?? 0;
  expiryInput.value = inventory[component.id]?.expiry ?? '';
  suggestions.classList.add('hidden');
  quantityInput.focus();
}

productSearch.addEventListener('input', () => {
  selectedProductId.value = '';
  selectedProductInfo.textContent = '';
  renderSuggestions(productSearch.value);
});
productSearch.addEventListener('focus', () => {
  if (productSearch.value) renderSuggestions(productSearch.value);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.autocomplete-wrapper')) suggestions.classList.add('hidden');
});

async function saveInventoryItem(componentId, quantity, expiry) {
  const item = await api(`/api/inventory/${encodeURIComponent(componentId)}`, {
    method: 'PUT',
    body: JSON.stringify({ quantity, expiry: expiry || null })
  });
  inventory[componentId] = {
    quantity: Number(item.quantity) || 0,
    expiry: item.expiry || '',
    updatedAt: item.updated_at || null,
    updatedBy: item.updated_by || currentUser
  };
  return item;
}

entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  entryMessage.classList.add('hidden');
  const componentId = selectedProductId.value;
  const quantity = Number(quantityInput.value);
  const expiry = expiryInput.value;

  if (!componentId || !getComponentById(componentId)) {
    showEntryMessage('Sélectionnez un composant dans la liste de suggestions.', true);
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    showEntryMessage('La quantité doit être un nombre entier positif ou égal à zéro.', true);
    return;
  }

  const submit = entryForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await saveInventoryItem(componentId, quantity, expiry);
    const component = getComponentById(componentId);
    showEntryMessage(`${component.name} enregistré : ${quantity} unité(s).`);
    renderAll();
  } catch (error) {
    if (error.status === 401) return showLogin();
    showEntryMessage(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

function showEntryMessage(message, error = false) {
  entryMessage.textContent = message;
  entryMessage.classList.remove('hidden', 'error-box');
  if (error) entryMessage.classList.add('error-box');
  setTimeout(() => entryMessage.classList.add('hidden'), 4000);
}

resetEntryBtn.addEventListener('click', resetEntryForm);
function resetEntryForm() {
  entryForm.reset();
  selectedProductId.value = '';
  selectedProductInfo.textContent = '';
  suggestions.classList.add('hidden');
  entryMessage.classList.add('hidden');
  productSearch.focus();
}

function getStatus(component, quantity) {
  if (quantity <= component.min) return { label: 'À recommander', className: 'status-low' };
  if (quantity > component.max) return { label: 'Au-dessus du maxi', className: 'status-high' };
  return { label: 'Stock OK', className: 'status-ok' };
}

function getLowStockComponents(sourceInventory = inventory) {
  return COMPONENTS.filter((component) => (sourceInventory[component.id]?.quantity ?? 0) <= component.min);
}

function renderStockTable() {
  stockTableBody.innerHTML = '';
  COMPONENTS.forEach((component) => {
    const current = inventory[component.id] || { quantity: 0, expiry: '' };
    const status = getStatus(component, current.quantity);
    const row = document.createElement('tr');
    if (current.quantity <= component.min) row.classList.add('low-row');
    row.innerHTML = `
      <td class="product-name">${escapeHtml(component.name)}</td>
      <td><input class="stock-quantity-input" type="number" min="0" step="1" value="${current.quantity}" data-id="${escapeHtml(component.id)}" /></td>
      <td><input class="stock-expiry-input" type="date" value="${escapeHtml(current.expiry)}" data-id="${escapeHtml(component.id)}" /></td>
      <td>${component.min}</td>
      <td>${component.max}</td>
      <td><span class="status ${status.className}">${status.label}</span></td>
    `;
    stockTableBody.appendChild(row);
  });

  document.querySelectorAll('.stock-quantity-input').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const id = event.target.dataset.id;
      const quantity = Math.max(0, Math.floor(Number(event.target.value) || 0));
      event.target.disabled = true;
      try {
        await saveInventoryItem(id, quantity, inventory[id]?.expiry || '');
        renderAll();
      } catch (error) {
        alert(error.message);
        renderStockTable();
      }
    });
  });

  document.querySelectorAll('.stock-expiry-input').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const id = event.target.dataset.id;
      event.target.disabled = true;
      try {
        await saveInventoryItem(id, inventory[id]?.quantity ?? 0, event.target.value);
        renderAll();
      } catch (error) {
        alert(error.message);
        renderStockTable();
      }
    });
  });
}

function renderOrderPage() {
  const lowStock = getLowStockComponents();
  orderTableBody.innerHTML = '';
  if (lowStock.length === 0) {
    orderEmpty.classList.remove('hidden');
    orderTableWrap.classList.add('hidden');
  } else {
    orderEmpty.classList.add('hidden');
    orderTableWrap.classList.remove('hidden');
    lowStock.forEach((component) => {
      const current = inventory[component.id]?.quantity ?? 0;
      const toOrder = Math.max(0, component.max - current);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="product-name">${escapeHtml(component.name)}</td>
        <td class="order-quantity">${toOrder}</td>
        <td>${current}</td>
        <td>${component.min}</td>
        <td>${component.max}</td>
      `;
      orderTableBody.appendChild(row);
    });
  }

  const expiring = getExpiringComponents(inventory);
  expiryTableBody.innerHTML = '';
  if (expiring.length === 0) {
    expiryEmpty.classList.remove('hidden');
    expiryTableWrap.classList.add('hidden');
  } else {
    expiryEmpty.classList.add('hidden');
    expiryTableWrap.classList.remove('hidden');
    expiring.forEach((component) => {
      const current = inventory[component.id] || { quantity: 0, expiry: '' };
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="product-name">${escapeHtml(component.name)}</td>
        <td>${current.quantity}</td>
        <td>${formatDateForExport(current.expiry)}</td>
        <td><span class="status status-low">${escapeHtml(getExpiryStatus(current.expiry))}</span></td>
      `;
      expiryTableBody.appendChild(row);
    });
  }
}

function getExpiringComponents(sourceInventory) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 30);

  return COMPONENTS.filter((component) => {
    const expiry = sourceInventory[component.id]?.expiry;
    if (!expiry) return false;
    const expiryDate = new Date(`${expiry}T00:00:00`);
    return !Number.isNaN(expiryDate.getTime()) && expiryDate <= limit;
  }).sort((a, b) => {
    const dateA = new Date(`${sourceInventory[a.id].expiry}T00:00:00`);
    const dateB = new Date(`${sourceInventory[b.id].expiry}T00:00:00`);
    return dateA - dateB;
  });
}

function getExpiryStatus(expiry) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDate = new Date(`${expiry}T00:00:00`);
  const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const daysExpired = Math.abs(diffDays);
    return `Périmé depuis ${daysExpired} jour${daysExpired > 1 ? 's' : ''}`;
  }
  if (diffDays === 0) return 'Périme aujourd’hui';
  return `${diffDays} jour${diffDays > 1 ? 's' : ''} restant${diffDays > 1 ? 's' : ''}`;
}

function renderOrderBadge() {
  orderBadge.textContent = getLowStockComponents().length;
}

saveNotesBtn.addEventListener('click', async () => {
  saveNotesBtn.disabled = true;
  notesStatus.textContent = 'Enregistrement…';
  try {
    const result = await api('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ content: recommendationNotes.value })
    });
    currentNote = result.content ?? recommendationNotes.value.trim();
    recommendationNotes.value = currentNote;
    notesStatus.textContent = result.unchanged ? 'Aucune modification.' : 'Commentaire enregistré.';
  } catch (error) {
    notesStatus.textContent = error.message;
  } finally {
    saveNotesBtn.disabled = false;
  }
});

loadHistoryBtn.addEventListener('click', loadHistory);
historyDate.addEventListener('change', () => {
  historySnapshot = null;
  historyContent.classList.add('hidden');
  exportHistoryExcel.disabled = true;
  exportHistoryPdf.disabled = true;
});

async function loadHistory() {
  const date = historyDate.value;
  if (!date) {
    historyStatus.textContent = 'Choisissez une date.';
    return;
  }
  loadHistoryBtn.disabled = true;
  historyStatus.textContent = 'Chargement…';
  try {
    historySnapshot = await api(`/api/history?date=${encodeURIComponent(date)}`);
    renderHistory(historySnapshot);
    historyStatus.textContent = `Inventaire au ${formatDateForExport(date)} (fin de journée).`;
    historyContent.classList.remove('hidden');
    exportHistoryExcel.disabled = false;
    exportHistoryPdf.disabled = false;
  } catch (error) {
    historySnapshot = null;
    historyContent.classList.add('hidden');
    historyStatus.textContent = error.message;
  } finally {
    loadHistoryBtn.disabled = false;
  }
}

function renderHistory(snapshot) {
  historyTableBody.innerHTML = '';
  snapshot.items.forEach((item) => {
    const quantity = Number(item.quantity) || 0;
    const status = getStatus(item, quantity);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="product-name">${escapeHtml(item.name)}</td>
      <td>${quantity}</td>
      <td>${formatDateForExport(item.expiry || '')}</td>
      <td>${item.min}</td>
      <td>${item.max}</td>
      <td><span class="status ${status.className}">${status.label}</span></td>
      <td>${escapeHtml(formatHistoryChange(item.last_changed_at, item.changed_by))}</td>
    `;
    historyTableBody.appendChild(row);
  });

  const note = snapshot.note?.content || '';
  historyNote.textContent = note || 'Aucun commentaire.';
  historyNote.classList.toggle('muted', !note);
}

function formatHistoryChange(timestamp, username) {
  if (!timestamp) return 'Aucune modification enregistrée';
  const date = new Date(timestamp);
  const formatted = Number.isNaN(date.getTime()) ? String(timestamp) : date.toLocaleString('fr-FR');
  return username ? `${formatted} — ${username}` : formatted;
}

function ensureXlsx() {
  if (typeof XLSX === 'undefined') {
    alert("La bibliothèque Excel n'a pas pu être chargée. Vérifiez votre connexion Internet.");
    return false;
  }
  return true;
}

function rowsToSheet(headers, rows, widths = []) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  if (widths.length) sheet['!cols'] = widths.map((wch) => ({ wch }));
  return sheet;
}

function exportStockToExcel() {
  if (!ensureXlsx()) return;
  const rows = COMPONENTS.map((component) => {
    const current = inventory[component.id] || { quantity: 0, expiry: '' };
    return [component.name, current.quantity, formatDateForExport(current.expiry), component.min, component.max, getStatus(component, current.quantity).label];
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(
    ['Composant', 'Stock actuel', 'Date de fin', 'Stock minimum', 'Stock maximum', 'État'],
    rows,
    [32, 14, 16, 16, 16, 20]
  ), 'Stock actuel');
  XLSX.writeFile(workbook, `stock-actuel-${getTodayFileName()}.xlsx`);
}

function exportOrderToExcel() {
  if (!ensureXlsx()) return;
  const lowStock = getLowStockComponents();
  const expiring = getExpiringComponents(inventory);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, rowsToSheet(
    ['Composant', 'Quantité à commander', 'Stock actuel', 'Stock minimum', 'Stock maximum'],
    lowStock.map((component) => {
      const current = inventory[component.id]?.quantity ?? 0;
      return [component.name, Math.max(0, component.max - current), current, component.min, component.max];
    }),
    [32, 22, 14, 16, 16]
  ), 'À recommander');

  XLSX.utils.book_append_sheet(workbook, rowsToSheet(
    ['Composant', 'Stock actuel', 'Date de péremption', 'Délai'],
    expiring.map((component) => {
      const current = inventory[component.id] || { quantity: 0, expiry: '' };
      return [component.name, current.quantity, formatDateForExport(current.expiry), getExpiryStatus(current.expiry)];
    }),
    [32, 14, 20, 24]
  ), 'Péremptions');

  XLSX.utils.book_append_sheet(workbook, rowsToSheet(
    ['Commentaire'],
    [[recommendationNotes.value.trim()]],
    [80]
  ), 'Commentaire');

  XLSX.writeFile(workbook, `commande-${getTodayFileName()}.xlsx`);
}

function exportExpiryToExcel() {
  if (!ensureXlsx()) return;
  const expiring = getExpiringComponents(inventory);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(
    ['Composant', 'Stock actuel', 'Date de péremption', 'Délai'],
    expiring.map((component) => {
      const current = inventory[component.id];
      return [component.name, current.quantity, formatDateForExport(current.expiry), getExpiryStatus(current.expiry)];
    }),
    [32, 14, 20, 24]
  ), 'Péremptions');
  XLSX.writeFile(workbook, `peremptions-${getTodayFileName()}.xlsx`);
}

function exportHistoryToExcel() {
  if (!historySnapshot || !ensureXlsx()) return;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(
    ['Composant', 'Stock', 'Péremption', 'Minimum', 'Maximum', 'État', 'Dernière modification'],
    historySnapshot.items.map((item) => {
      const quantity = Number(item.quantity) || 0;
      return [item.name, quantity, formatDateForExport(item.expiry || ''), item.min, item.max, getStatus(item, quantity).label, formatHistoryChange(item.last_changed_at, item.changed_by)];
    }),
    [32, 10, 16, 12, 12, 20, 34]
  ), 'Inventaire');
  XLSX.utils.book_append_sheet(workbook, rowsToSheet(
    ['Commentaire'],
    [[historySnapshot.note?.content || '']],
    [80]
  ), 'Commentaire');
  XLSX.writeFile(workbook, `historique-${historySnapshot.date}.xlsx`);
}

function getPdfDocument(title, subtitle = '') {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La bibliothèque PDF n'a pas pu être chargée. Vérifiez votre connexion Internet.");
    return null;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(subtitle || `Export du ${new Date().toLocaleDateString('fr-FR')}`, 14, 21);
  return doc;
}

function ensureAutoTable(doc) {
  if (typeof doc.autoTable !== 'function') {
    alert("Le module de tableau PDF n'a pas pu être chargé.");
    return false;
  }
  return true;
}

function exportStockToPdf() {
  const doc = getPdfDocument('Inventaire - Stock actuel');
  if (!doc || !ensureAutoTable(doc)) return;
  doc.autoTable({
    startY: 27,
    head: [['Composant', 'Stock actuel', 'Date de fin', 'Minimum', 'Maximum', 'État']],
    body: COMPONENTS.map((component) => {
      const current = inventory[component.id] || { quantity: 0, expiry: '' };
      return [component.name, String(current.quantity), formatDateForExport(current.expiry), String(component.min), String(component.max), getStatus(component, current.quantity).label];
    }),
    styles: { fontSize: 9 },
    headStyles: { fontStyle: 'bold' }
  });
  doc.save(`stock-actuel-${getTodayFileName()}.pdf`);
}

function addPdfSectionTitle(doc, title, y) {
  if (y > 188) {
    doc.addPage();
    y = 15;
  }
  doc.setFontSize(12);
  doc.text(title, 14, y);
  return y + 4;
}

function exportOrderToPdf() {
  const doc = getPdfDocument('Inventaire - Commande et péremptions');
  if (!doc || !ensureAutoTable(doc)) return;
  const lowStock = getLowStockComponents();
  const expiring = getExpiringComponents(inventory);

  let y = addPdfSectionTitle(doc, 'Composants à recommander', 28);
  doc.autoTable({
    startY: y,
    head: [['Composant', 'Quantité à commander', 'Stock actuel', 'Minimum', 'Maximum']],
    body: lowStock.length ? lowStock.map((component) => {
      const current = inventory[component.id]?.quantity ?? 0;
      return [component.name, String(Math.max(0, component.max - current)), String(current), String(component.min), String(component.max)];
    }) : [['Aucun réapprovisionnement nécessaire', '', '', '', '']],
    styles: { fontSize: 9 },
    headStyles: { fontStyle: 'bold' }
  });

  y = addPdfSectionTitle(doc, 'Péremptions à surveiller', (doc.lastAutoTable?.finalY || 35) + 10);
  doc.autoTable({
    startY: y,
    head: [['Composant', 'Stock actuel', 'Date de péremption', 'Délai']],
    body: expiring.length ? expiring.map((component) => {
      const current = inventory[component.id];
      return [component.name, String(current.quantity), formatDateForExport(current.expiry), getExpiryStatus(current.expiry)];
    }) : [['Aucune péremption proche', '', '', '']],
    styles: { fontSize: 9 },
    headStyles: { fontStyle: 'bold' }
  });

  y = addPdfSectionTitle(doc, 'Commentaire', (doc.lastAutoTable?.finalY || 35) + 10);
  doc.setFontSize(9);
  const comment = recommendationNotes.value.trim() || 'Aucun commentaire.';
  doc.text(doc.splitTextToSize(comment, 265), 14, y + 3);
  doc.save(`commande-${getTodayFileName()}.pdf`);
}

function exportExpiryToPdf() {
  const doc = getPdfDocument('Inventaire - Péremptions');
  if (!doc || !ensureAutoTable(doc)) return;
  const expiring = getExpiringComponents(inventory);
  doc.autoTable({
    startY: 27,
    head: [['Composant', 'Stock actuel', 'Date de péremption', 'Délai']],
    body: expiring.length ? expiring.map((component) => {
      const current = inventory[component.id];
      return [component.name, String(current.quantity), formatDateForExport(current.expiry), getExpiryStatus(current.expiry)];
    }) : [['Aucune péremption proche', '', '', '']],
    styles: { fontSize: 9 },
    headStyles: { fontStyle: 'bold' }
  });
  doc.save(`peremptions-${getTodayFileName()}.pdf`);
}

function exportHistoryToPdf() {
  if (!historySnapshot) return;
  const doc = getPdfDocument(
    'Inventaire - Historique',
    `État de l’inventaire au ${formatDateForExport(historySnapshot.date)} (fin de journée)`
  );
  if (!doc || !ensureAutoTable(doc)) return;
  doc.autoTable({
    startY: 27,
    head: [['Composant', 'Stock', 'Péremption', 'Min.', 'Max.', 'État', 'Dernière modification']],
    body: historySnapshot.items.map((item) => {
      const quantity = Number(item.quantity) || 0;
      return [item.name, String(quantity), formatDateForExport(item.expiry || ''), String(item.min), String(item.max), getStatus(item, quantity).label, formatHistoryChange(item.last_changed_at, item.changed_by)];
    }),
    styles: { fontSize: 7.5 },
    headStyles: { fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 55 }, 6: { cellWidth: 45 } }
  });

  let y = addPdfSectionTitle(doc, 'Commentaire', (doc.lastAutoTable?.finalY || 35) + 10);
  doc.setFontSize(9);
  const comment = historySnapshot.note?.content || 'Aucun commentaire.';
  doc.text(doc.splitTextToSize(comment, 265), 14, y + 3);
  doc.save(`historique-${historySnapshot.date}.pdf`);
}

function formatDateForExport(dateValue) {
  if (!dateValue) return '';
  const [year, month, day] = String(dateValue).slice(0, 10).split('-');
  if (!year || !month || !day) return String(dateValue);
  return `${day}/${month}/${year}`;
}

function getTodayFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderAll() {
  if (!COMPONENTS.length) return;
  renderStockTable();
  renderOrderPage();
  renderOrderBadge();
}

document.getElementById('exportStockExcel').addEventListener('click', exportStockToExcel);
document.getElementById('exportStockPdf').addEventListener('click', exportStockToPdf);
document.getElementById('exportOrderExcel').addEventListener('click', exportOrderToExcel);
document.getElementById('exportOrderPdf').addEventListener('click', exportOrderToPdf);
document.getElementById('exportExpiryExcel').addEventListener('click', exportExpiryToExcel);
document.getElementById('exportExpiryPdf').addEventListener('click', exportExpiryToPdf);
exportHistoryExcel.addEventListener('click', exportHistoryToExcel);
exportHistoryPdf.addEventListener('click', exportHistoryToPdf);

(async function initialize() {
  try {
    const session = await api('/api/session');
    currentUser = session.user.username;
    await loadApplicationData();
    showApp();
  } catch {
    showLogin();
  }
})();
