/* ============================================================
   CONFIGURATION
   ============================================================ */

// ATTENTION : sur GitHub Pages, ces identifiants sont visibles dans le code source.
// Cette connexion sert seulement de verrou léger côté navigateur.
const AUTH = {
  username: "admin",
  password: "inventaire123"
};

// Liste de TOUS les composants autorisés.
// Ajoutez / modifiez simplement les lignes ci-dessous.
// min = stock minimum à conserver
// max = stock maximum cible après réapprovisionnement
const COMPONENTS = [
  { id: "ATV", name: "ATV", min: 5, max: 20 },
  { id: "M340", name: "M340", min: 4, max: 16 },
  { id: "TSX47", name: "TSX47", min: 3, max: 12 },
  { id: "BMXP342020", name: "BMXP342020", min: 2, max: 8 },
  { id: "BMXDDI1602", name: "BMXDDI1602", min: 4, max: 15 },
  { id: "BMXDDO1602", name: "BMXDDO1602", min: 4, max: 15 },
  { id: "HMIGTO5310", name: "HMIGTO5310", min: 1, max: 5 },
  { id: "LC1D09", name: "LC1D09", min: 8, max: 30 },
  { id: "GV2ME14", name: "GV2ME14", min: 6, max: 24 },
  { id: "XB4BA31", name: "XB4BA31", min: 10, max: 40 }
];

const STORAGE_KEY = "inventaire_composants_v1";
const SESSION_KEY = "inventaire_logged_in";

/* ============================================================
   ÉTAT ET STOCKAGE
   ============================================================ */

function buildDefaultInventory() {
  const inventory = {};
  COMPONENTS.forEach((component) => {
    inventory[component.id] = {
      quantity: 0,
      expiry: ""
    };
  });
  return inventory;
}

function loadInventory() {
  const defaults = buildDefaultInventory();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    COMPONENTS.forEach((component) => {
      if (saved[component.id]) {
        defaults[component.id] = {
          quantity: Math.max(0, Number(saved[component.id].quantity) || 0),
          expiry: saved[component.id].expiry || ""
        };
      }
    });
  } catch (error) {
    console.warn("Impossible de lire l'inventaire sauvegardé.", error);
  }

  return defaults;
}

let inventory = loadInventory();

function saveInventory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  renderAll();
}

function getComponentById(id) {
  return COMPONENTS.find((component) => component.id === id);
}

function getLowStockComponents() {
  return COMPONENTS.filter((component) => {
    const current = inventory[component.id]?.quantity ?? 0;
    return current < component.min;
  });
}

/* ============================================================
   CONNEXION
   ============================================================ */

const loginOverlay = document.getElementById("loginOverlay");
const app = document.getElementById("app");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

function showApp() {
  loginOverlay.classList.add("hidden");
  app.classList.remove("hidden");
  renderAll();
}

function showLogin() {
  app.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginUsername").focus();
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (username === AUTH.username && password === AUTH.password) {
    sessionStorage.setItem(SESSION_KEY, "true");
    loginError.textContent = "";
    showApp();
  } else {
    loginError.textContent = "Identifiant ou mot de passe incorrect.";
  }
});

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  showLogin();
});

/* ============================================================
   NAVIGATION ENTRE LES 3 PAGES
   ============================================================ */

const tabs = document.querySelectorAll(".tab");
const pages = document.querySelectorAll(".page");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active-page"));

    tab.classList.add("active");
    document.getElementById(tab.dataset.page).classList.add("active-page");

    if (tab.dataset.page === "stockPage") renderStockTable();
    if (tab.dataset.page === "orderPage") renderOrderTable();
  });
});

/* ============================================================
   PAGE 1 — SAISIE + AUTOCOMPLÉTION
   ============================================================ */

const entryForm = document.getElementById("entryForm");
const productSearch = document.getElementById("productSearch");
const selectedProductId = document.getElementById("selectedProductId");
const suggestions = document.getElementById("suggestions");
const selectedProductInfo = document.getElementById("selectedProductInfo");
const quantityInput = document.getElementById("quantityInput");
const expiryInput = document.getElementById("expiryInput");
const entryMessage = document.getElementById("entryMessage");
const resetEntryBtn = document.getElementById("resetEntryBtn");

function normalize(value) {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function renderSuggestions(searchTerm) {
  const term = normalize(searchTerm);
  suggestions.innerHTML = "";

  if (!term) {
    suggestions.classList.add("hidden");
    return;
  }

  // Priorité aux produits qui COMMENCENT par les lettres saisies.
  // Puis, si nécessaire, on garde ceux qui contiennent le texte.
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
    suggestions.classList.remove("hidden");
    return;
  }

  matches.forEach((component) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.innerHTML = `
      <span class="suggestion-code">${escapeHtml(component.name)}</span>
      <span class="suggestion-threshold">Mini ${component.min} · Maxi ${component.max}</span>
    `;

    button.addEventListener("click", () => selectProduct(component.id));
    suggestions.appendChild(button);
  });

  suggestions.classList.remove("hidden");
}

function selectProduct(id) {
  const component = getComponentById(id);
  if (!component) return;

  selectedProductId.value = component.id;
  productSearch.value = component.name;
  selectedProductInfo.textContent = `Stock mini : ${component.min} — Stock maxi : ${component.max}`;

  // Pré-remplit la valeur actuelle pour faciliter une correction d'inventaire.
  quantityInput.value = inventory[component.id]?.quantity ?? 0;
  expiryInput.value = inventory[component.id]?.expiry ?? "";

  suggestions.classList.add("hidden");
  quantityInput.focus();
}

productSearch.addEventListener("input", () => {
  selectedProductId.value = "";
  selectedProductInfo.textContent = "";
  renderSuggestions(productSearch.value);
});

productSearch.addEventListener("focus", () => {
  if (productSearch.value) renderSuggestions(productSearch.value);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".autocomplete-wrapper")) {
    suggestions.classList.add("hidden");
  }
});

entryForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const componentId = selectedProductId.value;
  const quantity = Number(quantityInput.value);
  const expiry = expiryInput.value;

  if (!componentId || !getComponentById(componentId)) {
    entryMessage.textContent = "Sélectionnez un composant dans la liste de suggestions.";
    entryMessage.classList.remove("hidden");
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 0) {
    entryMessage.textContent = "La quantité doit être un nombre entier positif ou égal à zéro.";
    entryMessage.classList.remove("hidden");
    return;
  }

  inventory[componentId] = { quantity, expiry };
  saveInventory();

  const component = getComponentById(componentId);
  entryMessage.textContent = `${component.name} enregistré : ${quantity} unité(s).`;
  entryMessage.classList.remove("hidden");

  setTimeout(() => entryMessage.classList.add("hidden"), 3500);
});

resetEntryBtn.addEventListener("click", resetEntryForm);

function resetEntryForm() {
  entryForm.reset();
  selectedProductId.value = "";
  selectedProductInfo.textContent = "";
  suggestions.classList.add("hidden");
  entryMessage.classList.add("hidden");
  productSearch.focus();
}

/* ============================================================
   PAGE 2 — STOCK ACTUEL
   ============================================================ */

const stockTableBody = document.getElementById("stockTableBody");

function getStatus(component, quantity) {
  if (quantity < component.min) {
    return { label: "À recommander", className: "status-low" };
  }

  if (quantity > component.max) {
    return { label: "Au-dessus du maxi", className: "status-high" };
  }

  return { label: "Stock OK", className: "status-ok" };
}

function renderStockTable() {
  stockTableBody.innerHTML = "";

  COMPONENTS.forEach((component) => {
    const current = inventory[component.id] || { quantity: 0, expiry: "" };
    const status = getStatus(component, current.quantity);

    const row = document.createElement("tr");
    if (current.quantity < component.min) row.classList.add("low-row");

    row.innerHTML = `
      <td class="product-name">${escapeHtml(component.name)}</td>
      <td>
        <input
          class="stock-quantity-input"
          type="number"
          min="0"
          step="1"
          value="${current.quantity}"
          data-id="${escapeHtml(component.id)}"
          aria-label="Quantité ${escapeHtml(component.name)}"
        />
      </td>
      <td>
        <input
          class="stock-expiry-input"
          type="date"
          value="${escapeHtml(current.expiry)}"
          data-id="${escapeHtml(component.id)}"
          aria-label="Date de fin ${escapeHtml(component.name)}"
        />
      </td>
      <td>${component.min}</td>
      <td>${component.max}</td>
      <td><span class="status ${status.className}">${status.label}</span></td>
    `;

    stockTableBody.appendChild(row);
  });

  document.querySelectorAll(".stock-quantity-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const id = event.target.dataset.id;
      const value = Math.max(0, Math.floor(Number(event.target.value) || 0));
      inventory[id].quantity = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
      renderAll();
    });
  });

  document.querySelectorAll(".stock-expiry-input").forEach((input) => {
    input.addEventListener("change", (event) => {
      const id = event.target.dataset.id;
      inventory[id].expiry = event.target.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
      renderOrderTable();
      renderOrderBadge();
    });
  });
}

/* ============================================================
   PAGE 3 — À RECOMMANDER
   ============================================================ */

const orderTableBody = document.getElementById("orderTableBody");
const orderEmpty = document.getElementById("orderEmpty");
const orderTableWrap = document.getElementById("orderTableWrap");
const orderBadge = document.getElementById("orderBadge");

function renderOrderTable() {
  const lowStock = getLowStockComponents();
  orderTableBody.innerHTML = "";

  if (lowStock.length === 0) {
    orderEmpty.classList.remove("hidden");
    orderTableWrap.classList.add("hidden");
    return;
  }

  orderEmpty.classList.add("hidden");
  orderTableWrap.classList.remove("hidden");

  lowStock.forEach((component) => {
    const current = inventory[component.id]?.quantity ?? 0;
    const toOrder = Math.max(0, component.max - current);

    const row = document.createElement("tr");
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

function renderOrderBadge() {
  orderBadge.textContent = getLowStockComponents().length;
}

/* ============================================================
   EXPORT EXCEL
   ============================================================ */

function ensureXlsx() {
  if (typeof XLSX === "undefined") {
    alert("La bibliothèque Excel n'a pas pu être chargée. Vérifiez votre connexion Internet.");
    return false;
  }
  return true;
}

function exportStockToExcel() {
  if (!ensureXlsx()) return;

  const rows = COMPONENTS.map((component) => {
    const current = inventory[component.id] || { quantity: 0, expiry: "" };
    const status = getStatus(component, current.quantity).label;

    return {
      Composant: component.name,
      "Stock actuel": current.quantity,
      "Date de fin": formatDateForExport(current.expiry),
      "Stock minimum": component.min,
      "Stock maximum": component.max,
      État: status
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 20 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Stock actuel");
  XLSX.writeFile(workbook, `stock-actuel-${getTodayFileName()}.xlsx`);
}

function exportOrderToExcel() {
  if (!ensureXlsx()) return;

  const lowStock = getLowStockComponents();
  if (lowStock.length === 0) {
    alert("Aucun composant n'est à recommander.");
    return;
  }

  const rows = lowStock.map((component) => {
    const current = inventory[component.id]?.quantity ?? 0;
    return {
      Composant: component.name,
      "Quantité à commander": Math.max(0, component.max - current),
      "Stock actuel": current,
      "Stock minimum": component.min,
      "Stock maximum": component.max
    };
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 24 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "À recommander");
  XLSX.writeFile(workbook, `a-recommander-${getTodayFileName()}.xlsx`);
}

/* ============================================================
   EXPORT PDF
   ============================================================ */

function getPdfDocument(title) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La bibliothèque PDF n'a pas pu être chargée. Vérifiez votre connexion Internet.");
    return null;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(`Export du ${new Date().toLocaleDateString("fr-FR")}`, 14, 21);

  return doc;
}

function exportStockToPdf() {
  const doc = getPdfDocument("Inventaire - Stock actuel");
  if (!doc) return;

  if (typeof doc.autoTable !== "function") {
    alert("Le module de tableau PDF n'a pas pu être chargé.");
    return;
  }

  const body = COMPONENTS.map((component) => {
    const current = inventory[component.id] || { quantity: 0, expiry: "" };
    return [
      component.name,
      String(current.quantity),
      formatDateForExport(current.expiry),
      String(component.min),
      String(component.max),
      getStatus(component, current.quantity).label
    ];
  });

  doc.autoTable({
    startY: 27,
    head: [["Composant", "Stock actuel", "Date de fin", "Minimum", "Maximum", "État"]],
    body,
    styles: { fontSize: 9 },
    headStyles: { fontStyle: "bold" }
  });

  doc.save(`stock-actuel-${getTodayFileName()}.pdf`);
}

function exportOrderToPdf() {
  const lowStock = getLowStockComponents();
  if (lowStock.length === 0) {
    alert("Aucun composant n'est à recommander.");
    return;
  }

  const doc = getPdfDocument("Inventaire - Composants à recommander");
  if (!doc) return;

  if (typeof doc.autoTable !== "function") {
    alert("Le module de tableau PDF n'a pas pu être chargé.");
    return;
  }

  const body = lowStock.map((component) => {
    const current = inventory[component.id]?.quantity ?? 0;
    return [
      component.name,
      String(Math.max(0, component.max - current)),
      String(current),
      String(component.min),
      String(component.max)
    ];
  });

  doc.autoTable({
    startY: 27,
    head: [["Composant", "Quantité à commander", "Stock actuel", "Minimum", "Maximum"]],
    body,
    styles: { fontSize: 9 },
    headStyles: { fontStyle: "bold" }
  });

  doc.save(`a-recommander-${getTodayFileName()}.pdf`);
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

function formatDateForExport(dateValue) {
  if (!dateValue) return "";
  const [year, month, day] = dateValue.split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function getTodayFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAll() {
  renderStockTable();
  renderOrderTable();
  renderOrderBadge();
}

/* ============================================================
   BOUTONS D'EXPORT
   ============================================================ */

document.getElementById("exportStockExcel").addEventListener("click", exportStockToExcel);
document.getElementById("exportStockPdf").addEventListener("click", exportStockToPdf);
document.getElementById("exportOrderExcel").addEventListener("click", exportOrderToExcel);
document.getElementById("exportOrderPdf").addEventListener("click", exportOrderToPdf);

/* ============================================================
   DÉMARRAGE
   ============================================================ */

if (sessionStorage.getItem(SESSION_KEY) === "true") {
  showApp();
} else {
  showLogin();
}
