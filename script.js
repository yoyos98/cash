/* ================================================================
   FINANCIAL TRACKER PRO – SCRIPT PRINCIPALE
   Gestione stato, localStorage, UI, Chart.js, Smart Advisor
   ================================================================ */

'use strict';

/* ----------------------------------------------------------------
   1. CONFIGURAZIONE – Categorie per tipo e icone
---------------------------------------------------------------- */

/** Categorie disponibili per tipo di transazione */
const CATEGORIES = {
  entrata: [
    { value: 'Lavoro',                 emoji: '💼' },
    { value: 'Croce Blu / Volontariato', emoji: '🏥' },
    { value: 'Amici / Regali',         emoji: '🎁' },
    { value: 'Altro',                  emoji: '💰' }
  ],
  uscita: [
    { value: 'Cibo / Spesa',           emoji: '🛒' },
    { value: 'Divertimento / Serate',  emoji: '🎉' },
    { value: 'Amici / Uscite',         emoji: '👥' },
    { value: 'Trasporti',              emoji: '🚌' },
    { value: 'Abbonamenti / Tech',     emoji: '💻' },
    { value: 'Altro',                  emoji: '📦' }
  ]
};

/** Mappa categoria → emoji per la cronologia */
const CATEGORY_EMOJI = {};
Object.values(CATEGORIES).forEach(list =>
  list.forEach(c => { CATEGORY_EMOJI[c.value] = c.emoji; })
);

/** Nomi abbreviati dei mesi in italiano */
const MONTH_NAMES_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu',
                            'Lug','Ago','Set','Ott','Nov','Dic'];
const MONTH_NAMES_FULL  = ['Gennaio','Febbraio','Marzo','Aprile','Maggio',
                            'Giugno','Luglio','Agosto','Settembre','Ottobre',
                            'Novembre','Dicembre'];

/** Chiave localStorage per la persistenza dei dati */
const STORAGE_KEY = 'finance_tracker_transactions';

/* ----------------------------------------------------------------
   2. STATO APPLICAZIONE
---------------------------------------------------------------- */

/** Tipo di transazione attualmente selezionato nel form */
let currentType = 'entrata';

/** Filtro attivo sulla cronologia ('all' | 'entrata' | 'uscita') */
let currentFilter = 'all';

/** Periodo del grafico in mesi ('6m' | '3m' | '1m') */
let currentChartPeriod = '6m';

/** Istanza corrente del grafico Chart.js (per distruzione/ricostruzione) */
let chartInstance = null;

/* ----------------------------------------------------------------
   3. ACCESSO AL DOM – Cache dei riferimenti agli elementi
---------------------------------------------------------------- */

const DOM = {
  /* Header */
  currentMonthLabel: document.getElementById('currentMonthLabel'),

  /* Bottone apertura/chiusura panel */
  btnToggleForm:     document.getElementById('btnToggleForm'),
  addIcon:           document.getElementById('addIcon'),

  /* Pannello rapido e overlay */
  quickAddPanel:     document.getElementById('quickAddPanel'),
  overlay:           document.getElementById('overlay'),

  /* Toggle tipo transazione */
  btnEntrata:        document.getElementById('btnEntrata'),
  btnUscita:         document.getElementById('btnUscita'),

  /* Form */
  transactionForm:   document.getElementById('transactionForm'),
  inputAmount:       document.getElementById('inputAmount'),
  inputDesc:         document.getElementById('inputDesc'),
  inputCategory:     document.getElementById('inputCategory'),
  formError:         document.getElementById('formError'),
  btnSubmit:         document.getElementById('btnSubmit'),

  /* Dashboard schede */
  totalIncomeMonthly:  document.getElementById('totalIncomeMonthly'),
  totalExpenseMonthly: document.getElementById('totalExpenseMonthly'),
  totalSavingsAll:     document.getElementById('totalSavingsAll'),

  /* Grafico */
  financeChart:      document.getElementById('financeChart'),
  chartEmptyState:   document.getElementById('chartEmptyState'),

  /* Consigli */
  adviceContainer:   document.getElementById('adviceContainer'),

  /* Cronologia */
  transactionList:   document.getElementById('transactionList'),
  historyEmpty:      document.getElementById('historyEmpty'),

  /* Filtri cronologia */
  filterBtns:        document.querySelectorAll('.filter-btn'),

  /* Selettori periodo grafico */
  periodBtns:        document.querySelectorAll('.period-btn'),

  /* Main content (per offset quando il panel è aperto) */
  mainContent:       document.getElementById('mainContent')
};

/* ----------------------------------------------------------------
   4. PERSISTENZA – Lettura e scrittura localStorage
---------------------------------------------------------------- */

/**
 * Legge l'array delle transazioni dal localStorage.
 * Ritorna un array vuoto se non ci sono dati o in caso di errore.
 * @returns {Array<Object>}
 */
function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('[FinanceTracker] Errore lettura localStorage:', err);
    return [];
  }
}

/**
 * Salva l'array delle transazioni nel localStorage.
 * @param {Array<Object>} transactions
 */
function saveTransactions(transactions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch (err) {
    console.error('[FinanceTracker] Errore scrittura localStorage:', err);
  }
}

/* ----------------------------------------------------------------
   5. UTILITÀ – Formattazione e date
---------------------------------------------------------------- */

/**
 * Formatta un numero come valuta EUR con separatore italiano.
 * Esempio: 1234.5 → "€1.234,50"
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Restituisce la chiave "YYYY-MM" da un timestamp ISO.
 * @param {string} timestamp – ISO date string
 * @returns {string}
 */
function getMonthKey(timestamp) {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/**
 * Restituisce la chiave "YYYY-WNN" (anno + numero settimana ISO) da un timestamp.
 * @param {string} timestamp
 * @returns {string}
 */
function getWeekKey(timestamp) {
  const d = new Date(timestamp);
  // Calcola il numero della settimana ISO 8601
  const startOfYear  = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dayOfYear    = Math.floor((d - startOfYear) / 86400000);
  const weekNum      = Math.ceil((dayOfYear + startOfYear.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Restituisce la chiave "YYYY-MM-DD" da un timestamp.
 * @param {string} timestamp
 * @returns {string}
 */
function getDayKey(timestamp) {
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converte una chiave "YYYY-MM-DD" in etichetta leggibile in italiano.
 * Mostra "Oggi" e "Ieri" per le ultime due giornate.
 * @param {string} dayKey
 * @returns {string}
 */
function dayKeyToLabel(dayKey) {
  const today     = getDayKey(new Date().toISOString());
  const yesterday = getDayKey(new Date(Date.now() - 86400000).toISOString());
  if (dayKey === today)     return 'Oggi';
  if (dayKey === yesterday) return 'Ieri';
  const [yyyy, mm, dd] = dayKey.split('-');
  const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
  return `${dd} ${MONTH_NAMES_FULL[d.getMonth()]} ${yyyy}`;
}

/**
 * Genera un ID univoco basato su timestamp + numero casuale.
 * @returns {string}
 */
function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ----------------------------------------------------------------
   6. GESTIONE PANNELLO – Apertura / Chiusura form rapido
---------------------------------------------------------------- */

/**
 * Apre il pannello di inserimento rapido.
 * Applica animazioni CSS e accessibilità ARIA.
 */
function openPanel() {
  DOM.quickAddPanel.classList.add('is-open');
  DOM.quickAddPanel.setAttribute('aria-hidden', 'false');
  DOM.overlay.classList.add('is-visible');
  DOM.overlay.setAttribute('aria-hidden', 'false');
  DOM.btnToggleForm.classList.add('is-open');
  // Focus sul campo importo per avviare subito l'inserimento
  setTimeout(() => DOM.inputAmount.focus(), 350);
  // Impedisce lo scroll del contenuto sottostante
  document.body.style.overflow = 'hidden';
}

/**
 * Chiude il pannello di inserimento rapido e resetta il form.
 */
function closePanel() {
  DOM.quickAddPanel.classList.remove('is-open');
  DOM.quickAddPanel.setAttribute('aria-hidden', 'true');
  DOM.overlay.classList.remove('is-visible');
  DOM.overlay.setAttribute('aria-hidden', 'true');
  DOM.btnToggleForm.classList.remove('is-open');
  document.body.style.overflow = '';
  clearFormError();
}

/**
 * Alterna apertura/chiusura del pannello.
 */
function togglePanel() {
  const isOpen = DOM.quickAddPanel.classList.contains('is-open');
  if (isOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

/* ----------------------------------------------------------------
   7. AGGIORNAMENTO CATEGORIE NEL SELECT
   Il menu si aggiorna dinamicamente al cambio del tipo
---------------------------------------------------------------- */

/**
 * Popola il <select> delle categorie in base al tipo di transazione corrente.
 * @param {string} type – 'entrata' | 'uscita'
 */
function updateCategorySelect(type) {
  const select = DOM.inputCategory;
  select.innerHTML = '';
  CATEGORIES[type].forEach(cat => {
    const opt = document.createElement('option');
    opt.value      = cat.value;
    opt.textContent = `${cat.emoji}  ${cat.value}`;
    select.appendChild(opt);
  });
}

/**
 * Gestisce il click sui bottoni Toggle Entrata/Uscita.
 * @param {string} type – 'entrata' | 'uscita'
 */
function setTransactionType(type) {
  currentType = type;
  // Aggiorna stato visivo dei bottoni
  DOM.btnEntrata.classList.toggle('active', type === 'entrata');
  DOM.btnUscita.classList.toggle('active', type === 'uscita');
  // Rigenera le opzioni del select
  updateCategorySelect(type);
}

/* ----------------------------------------------------------------
   8. VALIDAZIONE FORM
---------------------------------------------------------------- */

/**
 * Mostra un messaggio di errore sotto al form.
 * @param {string} message
 */
function showFormError(message) {
  DOM.formError.textContent = message;
}

/**
 * Cancella il messaggio di errore.
 */
function clearFormError() {
  DOM.formError.textContent = '';
}

/**
 * Valida i campi del form prima di aggiungere la transazione.
 * @param {number} amount
 * @param {string} desc
 * @returns {boolean} – true se valido
 */
function validateForm(amount, desc) {
  if (!amount || isNaN(amount) || amount <= 0) {
    showFormError('Inserisci un importo valido maggiore di 0.');
    DOM.inputAmount.focus();
    return false;
  }
  if (amount > 9999999) {
    showFormError('L\'importo inserito è troppo grande.');
    DOM.inputAmount.focus();
    return false;
  }
  if (!desc.trim()) {
    showFormError('Inserisci una descrizione per la transazione.');
    DOM.inputDesc.focus();
    return false;
  }
  clearFormError();
  return true;
}

/* ----------------------------------------------------------------
   9. AGGIUNTA TRANSAZIONE
---------------------------------------------------------------- */

/**
 * Gestisce il submit del form: crea e salva la nuova transazione,
 * aggiorna l'intera UI, chiude il pannello.
 * @param {Event} e – submit event
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const amount   = parseFloat(DOM.inputAmount.value);
  const desc     = DOM.inputDesc.value.trim();
  const category = DOM.inputCategory.value;

  if (!validateForm(amount, desc)) return;

  const transaction = {
    id:        generateId(),
    type:      currentType,      // 'entrata' | 'uscita'
    amount:    amount,
    description: desc,
    category:  category,
    timestamp: new Date().toISOString()
  };

  // Carica, aggiungi e salva
  const transactions = loadTransactions();
  transactions.unshift(transaction); // Aggiungi in cima (più recente prima)
  saveTransactions(transactions);

  // Feedback visivo sul bottone
  DOM.btnSubmit.classList.add('success-pulse');
  setTimeout(() => DOM.btnSubmit.classList.remove('success-pulse'), 700);

  // Resetta il form
  DOM.transactionForm.reset();
  updateCategorySelect(currentType); // Ripristina le opzioni dopo reset

  // Chiudi il pannello
  closePanel();

  // Aggiorna tutta l'interfaccia
  renderAll(transactions);
}

/* ----------------------------------------------------------------
   10. ELIMINAZIONE TRANSAZIONE
---------------------------------------------------------------- */

/**
 * Rimuove una transazione per ID con animazione di uscita,
 * poi aggiorna lo storage e la UI.
 * @param {string} id – ID della transazione da eliminare
 * @param {HTMLElement} itemEl – elemento DOM della transazione
 */
function deleteTransaction(id, itemEl) {
  // Anima l'uscita dell'elemento
  itemEl.classList.add('is-removing');

  setTimeout(() => {
    let transactions = loadTransactions();
    transactions = transactions.filter(t => t.id !== id);
    saveTransactions(transactions);
    renderAll(transactions);
  }, 280); // Attesa pari alla durata della transizione CSS
}

/* ----------------------------------------------------------------
   11. CALCOLI – Totali e aggregati
---------------------------------------------------------------- */

/**
 * Calcola le somme di entrate e uscite per il mese corrente.
 * @param {Array<Object>} transactions
 * @returns {{ income: number, expense: number, savings: number }}
 */
function calcCurrentMonth(transactions) {
  const nowKey = getMonthKey(new Date().toISOString());
  let income = 0;
  let expense = 0;

  transactions.forEach(t => {
    if (getMonthKey(t.timestamp) !== nowKey) return;
    if (t.type === 'entrata') income  += t.amount;
    else                       expense += t.amount;
  });

  return { income, expense, savings: income - expense };
}

/**
 * Calcola il risparmio netto storico totale (tutte le transazioni).
 * @param {Array<Object>} transactions
 * @returns {number}
 */
function calcAllTimeSavings(transactions) {
  return transactions.reduce((acc, t) => {
    return acc + (t.type === 'entrata' ? t.amount : -t.amount);
  }, 0);
}

/**
 * Aggrega entrate e uscite per mese per il grafico.
 * Restituisce gli ultimi N mesi (incluso il corrente).
 * @param {Array<Object>} transactions
 * @param {number} numMonths – numero di mesi da includere
 * @returns {{ labels: string[], incomeData: number[], expenseData: number[] }}
 */
function aggregateByMonth(transactions, numMonths) {
  const now   = new Date();
  const keys  = [];
  const labels = [];

  // Genera le chiavi degli ultimi N mesi
  for (let i = numMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    keys.push(key);
    labels.push(MONTH_NAMES_SHORT[d.getMonth()]);
  }

  // Somma importi per chiave mese
  const incomeMap  = {};
  const expenseMap = {};
  keys.forEach(k => { incomeMap[k] = 0; expenseMap[k] = 0; });

  transactions.forEach(t => {
    const k = getMonthKey(t.timestamp);
    if (!(k in incomeMap)) return;
    if (t.type === 'entrata') incomeMap[k]  += t.amount;
    else                       expenseMap[k] += t.amount;
  });

  return {
    labels,
    incomeData:  keys.map(k => incomeMap[k]),
    expenseData: keys.map(k => expenseMap[k])
  };
}

/**
 * Calcola la spesa totale in una settimana specifica.
 * @param {Array<Object>} transactions
 * @param {string} weekKey – chiave "YYYY-WNN"
 * @returns {number}
 */
function calcWeekExpense(transactions, weekKey) {
  return transactions
    .filter(t => t.type === 'uscita' && getWeekKey(t.timestamp) === weekKey)
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Calcola la spesa per una categoria specifica nel mese corrente.
 * @param {Array<Object>} transactions
 * @param {string} category
 * @returns {number}
 */
function calcCategoryExpenseCurrentMonth(transactions, category) {
  const nowKey = getMonthKey(new Date().toISOString());
  return transactions
    .filter(t =>
      t.type === 'uscita' &&
      t.category === category &&
      getMonthKey(t.timestamp) === nowKey
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Verifica se il tasso di risparmio mensile è cresciuto negli ultimi 3 mesi.
 * @param {Array<Object>} transactions
 * @returns {boolean}
 */
function isSavingsRateGrowing(transactions) {
  const now = new Date();
  const savingsByMonth = [];

  for (let i = 2; i >= 0; i--) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const income  = transactions
      .filter(t => t.type === 'entrata' && getMonthKey(t.timestamp) === key)
      .reduce((s, t) => s + t.amount, 0);
    const expense = transactions
      .filter(t => t.type === 'uscita' && getMonthKey(t.timestamp) === key)
      .reduce((s, t) => s + t.amount, 0);
    savingsByMonth.push(income - expense);
  }

  // Cresce se ogni mese è superiore al precedente
  return savingsByMonth[0] < savingsByMonth[1] && savingsByMonth[1] < savingsByMonth[2];
}

/* ----------------------------------------------------------------
   12. RENDER DASHBOARD (schede riassuntive)
---------------------------------------------------------------- */

/**
 * Aggiorna le tre schede di riepilogo con i valori correnti.
 * @param {Array<Object>} transactions
 */
function renderDashboard(transactions) {
  // Etichetta mese corrente nell'header
  const now = new Date();
  DOM.currentMonthLabel.textContent =
    `${MONTH_NAMES_FULL[now.getMonth()]} ${now.getFullYear()}`;

  const { income, expense } = calcCurrentMonth(transactions);
  const allSavings = calcAllTimeSavings(transactions);

  DOM.totalIncomeMonthly.textContent  = formatCurrency(income);
  DOM.totalExpenseMonthly.textContent = formatCurrency(expense);
  DOM.totalSavingsAll.textContent     = formatCurrency(allSavings);
}

/* ----------------------------------------------------------------
   13. RENDER GRAFICO (Chart.js)
---------------------------------------------------------------- */

/**
 * Disegna o aggiorna il grafico a linee con entrate vs uscite.
 * Distrugge l'istanza precedente per evitare memory leak.
 * @param {Array<Object>} transactions
 */
function renderChart(transactions) {
  const numMonths = { '6m': 6, '3m': 3, '1m': 1 }[currentChartPeriod] || 6;
  const { labels, incomeData, expenseData } = aggregateByMonth(transactions, numMonths);

  // Controlla se ci sono dati da mostrare
  const hasData = incomeData.some(v => v > 0) || expenseData.some(v => v > 0);
  DOM.chartEmptyState.classList.toggle('is-visible', !hasData);
  DOM.financeChart.style.display = hasData ? 'block' : 'none';

  if (!hasData) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  const ctx = DOM.financeChart.getContext('2d');

  // Gradiente per l'area sotto la linea delle entrate
  const gradientIncome = ctx.createLinearGradient(0, 0, 0, 200);
  gradientIncome.addColorStop(0, 'rgba(52, 211, 153, 0.3)');
  gradientIncome.addColorStop(1, 'rgba(52, 211, 153, 0)');

  // Gradiente per l'area sotto la linea delle uscite
  const gradientExpense = ctx.createLinearGradient(0, 0, 0, 200);
  gradientExpense.addColorStop(0, 'rgba(248, 113, 113, 0.3)');
  gradientExpense.addColorStop(1, 'rgba(248, 113, 113, 0)');

  // Distruggi il grafico precedente se esiste
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Entrate',
          data: incomeData,
          borderColor: '#34d399',
          backgroundColor: gradientIncome,
          borderWidth: 2.5,
          pointBackgroundColor: '#34d399',
          pointBorderColor: '#121214',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,         // Linea curva e fluida
          fill: true
        },
        {
          label: 'Uscite',
          data: expenseData,
          borderColor: '#f87171',
          backgroundColor: gradientExpense,
          borderWidth: 2.5,
          pointBackgroundColor: '#f87171',
          pointBorderColor: '#121214',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#8e8ea0',
            font: { size: 11, weight: '600', family: '-apple-system, BlinkMacSystemFont, sans-serif' },
            boxWidth: 10,
            boxHeight: 10,
            borderRadius: 3,
            useBorderRadius: true,
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: 'rgba(30, 30, 36, 0.95)',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#f1f1f3',
          bodyColor: '#8e8ea0',
          padding: 12,
          cornerRadius: 10,
          titleFont: { size: 12, weight: '700' },
          bodyFont: { size: 11 },
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255,255,255,0.04)',
            drawBorder: false
          },
          ticks: {
            color: '#56566a',
            font: { size: 10, weight: '600' },
            maxRotation: 0
          },
          border: { display: false }
        },
        y: {
          grid: {
            color: 'rgba(255,255,255,0.04)',
            drawBorder: false
          },
          ticks: {
            color: '#56566a',
            font: { size: 10 },
            maxTicksLimit: 5,
            callback: val => `€${val >= 1000 ? (val/1000).toFixed(1)+'k' : val}`
          },
          border: { display: false }
        }
      }
    }
  });
}

/* ----------------------------------------------------------------
   14. SMART FINANCIAL ADVISOR – Motore di analisi e consigli
---------------------------------------------------------------- */

/**
 * Analizza i dati storici e popola la sezione "Consigli & Trend"
 * con messaggi personalizzati basati sul comportamento finanziario.
 * @param {Array<Object>} transactions
 */
function renderAdvice(transactions) {
  const advices = [];

  if (transactions.length === 0) {
    DOM.adviceContainer.innerHTML = `
      <div class="advice-placeholder">
        <span class="advice-placeholder-icon">💡</span>
        <p>Aggiungi almeno una transazione per ricevere consigli personalizzati.</p>
      </div>`;
    return;
  }

  const { income: monthlyIncome, expense: monthlyExpense } = calcCurrentMonth(transactions);

  /* ---- CONSIGLIO 1: Spese divertimento > 30% delle entrate mensili ---- */
  if (monthlyIncome > 0) {
    const divertimentoSpesa = calcCategoryExpenseCurrentMonth(
      transactions, 'Divertimento / Serate'
    );
    const divertimentoPct = (divertimentoSpesa / monthlyIncome) * 100;

    if (divertimentoPct > 30) {
      advices.push({
        type:  'warning',
        emoji: '⚠️',
        title: 'Attenzione alle spese serali',
        text:  `Questo mese hai speso ${formatCurrency(divertimentoSpesa)} ` +
               `in serate e divertimento (${divertimentoPct.toFixed(0)}% delle entrate). ` +
               `Valuta se ottimizzare questo budget per aumentare i risparmi!`
      });
    }
  }

  /* ---- CONSIGLIO 2: Confronto spesa questa settimana vs settimana scorsa ---- */
  const thisWeekKey  = getWeekKey(new Date().toISOString());
  const lastWeekDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const lastWeekKey  = getWeekKey(lastWeekDate.toISOString());

  const thisWeekExpense = calcWeekExpense(transactions, thisWeekKey);
  const lastWeekExpense = calcWeekExpense(transactions, lastWeekKey);

  if (lastWeekExpense > 0 && thisWeekExpense > 0) {
    if (thisWeekExpense < lastWeekExpense) {
      const pctDiff = (((lastWeekExpense - thisWeekExpense) / lastWeekExpense) * 100).toFixed(0);
      advices.push({
        type:  'positive',
        emoji: '🎉',
        title: 'Ottimo lavoro questa settimana!',
        text:  `Questa settimana hai speso il ${pctDiff}% in meno rispetto alla scorsa ` +
               `(${formatCurrency(thisWeekExpense)} vs ${formatCurrency(lastWeekExpense)}). Continua così!`
      });
    } else if (thisWeekExpense > lastWeekExpense) {
      const pctDiff = (((thisWeekExpense - lastWeekExpense) / lastWeekExpense) * 100).toFixed(0);
      advices.push({
        type:  'warning',
        emoji: '📊',
        title: 'Spese in aumento questa settimana',
        text:  `Questa settimana hai speso il ${pctDiff}% in più rispetto alla scorsa ` +
               `(${formatCurrency(thisWeekExpense)} vs ${formatCurrency(lastWeekExpense)}). Tieni d'occhio il budget!`
      });
    }
  }

  /* ---- CONSIGLIO 3: Risparmio mensile corrente negativo ---- */
  if (monthlyExpense > monthlyIncome && monthlyIncome > 0) {
    advices.push({
      type:  'warning',
      emoji: '🔴',
      title: 'Questo mese sei in rosso',
      text:  `Le uscite (${formatCurrency(monthlyExpense)}) superano le entrate ` +
             `(${formatCurrency(monthlyIncome)}) di ${formatCurrency(monthlyExpense - monthlyIncome)}. ` +
             `Cerca di ridurre le spese non essenziali.`
    });
  }

  /* ---- CONSIGLIO 4: Tasso di risparmio in crescita costante ---- */
  if (isSavingsRateGrowing(transactions)) {
    advices.push({
      type:  'savings',
      emoji: '🌟',
      title: 'Il tuo risparmio cresce costantemente!',
      text:  'Negli ultimi 3 mesi il tuo risparmio netto è cresciuto ogni mese. ' +
             'Ottimo andamento! Considera di mettere a rendere questi soldi.',
      badge: true
    });
  }

  /* ---- CONSIGLIO 5: Tasso di risparmio positivo del mese corrente ---- */
  if (monthlyIncome > 0 && monthlyExpense > 0 && monthlyExpense <= monthlyIncome) {
    const savingsRate = (((monthlyIncome - monthlyExpense) / monthlyIncome) * 100).toFixed(0);
    if (parseInt(savingsRate) >= 20) {
      advices.push({
        type:  'positive',
        emoji: '💪',
        title: `Tasso di risparmio: ${savingsRate}%`,
        text:  `Questo mese stai risparmiando il ${savingsRate}% delle tue entrate. ` +
               `Un ottimo risultato! L'obiettivo consigliato è almeno il 20%.`
      });
    }
  }

  /* ---- CONSIGLIO 6: Solo entrate senza uscite (mese nuovo) ---- */
  if (monthlyIncome > 0 && monthlyExpense === 0) {
    advices.push({
      type:  'info',
      emoji: '📌',
      title: 'Nessuna uscita registrata questo mese',
      text:  'Non hai ancora registrato spese per il mese corrente. ' +
             'Tieni traccia di ogni uscita per avere un quadro finanziario completo.'
    });
  }

  /* ---- CONSIGLIO 7: Categoria più costosa del mese ---- */
  if (monthlyExpense > 0) {
    const categoryTotals = {};
    const nowKey = getMonthKey(new Date().toISOString());
    transactions
      .filter(t => t.type === 'uscita' && getMonthKey(t.timestamp) === nowKey)
      .forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      });

    let topCategory = null;
    let topAmount   = 0;
    Object.entries(categoryTotals).forEach(([cat, amt]) => {
      if (amt > topAmount) { topAmount = amt; topCategory = cat; }
    });

    if (topCategory) {
      const pct = ((topAmount / monthlyExpense) * 100).toFixed(0);
      advices.push({
        type:  'info',
        emoji: CATEGORY_EMOJI[topCategory] || '📂',
        title: `Top spesa: ${topCategory}`,
        text:  `"${topCategory}" è la categoria con più uscite questo mese: ` +
               `${formatCurrency(topAmount)} (${pct}% del totale uscite).`
      });
    }
  }

  /* ---- Nessun consiglio disponibile ---- */
  if (advices.length === 0) {
    advices.push({
      type:  'info',
      emoji: '💡',
      title: 'Continua ad aggiungere transazioni',
      text:  'Più dati inserisci, più precisi saranno i consigli personalizzati per te.'
    });
  }

  /* ---- Render dell'HTML ---- */
  DOM.adviceContainer.innerHTML = advices.map(a => `
    <div class="advice-card advice-${a.type}" role="article">
      <span class="advice-emoji">${a.emoji}</span>
      <div class="advice-body">
        <p class="advice-title">${a.title}</p>
        <p class="advice-text">${a.text}</p>
        ${a.badge ? '<span class="savings-badge">📈 Risparmio in crescita</span>' : ''}
      </div>
    </div>
  `).join('');
}

/* ----------------------------------------------------------------
   15. RENDER CRONOLOGIA TRANSAZIONI
---------------------------------------------------------------- */

/**
 * Rende la lista delle transazioni filtrata e raggruppata per giorno.
 * @param {Array<Object>} transactions
 */
function renderTransactionList(transactions) {
  // Filtra per tipo se necessario
  const filtered = currentFilter === 'all'
    ? transactions
    : transactions.filter(t => t.type === currentFilter);

  // Mostra/nasconde lo stato vuoto
  const isEmpty = filtered.length === 0;
  DOM.historyEmpty.style.display  = isEmpty ? 'flex'  : 'none';
  DOM.transactionList.style.display = isEmpty ? 'none' : 'flex';

  if (isEmpty) {
    DOM.transactionList.innerHTML = '';
    return;
  }

  // Raggruppa per giorno (mantiene l'ordine: più recente prima)
  const groups = {};
  filtered.forEach(t => {
    const dayKey = getDayKey(t.timestamp);
    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(t);
  });

  // Costruisce l'HTML
  const html = Object.entries(groups).map(([dayKey, dayTransactions]) => {
    const items = dayTransactions.map(t => {
      const isIncome   = t.type === 'entrata';
      const iconClass  = isIncome ? 'icon-income' : 'icon-expense';
      const amtClass   = isIncome ? 'amount-income' : 'amount-expense';
      const amtPrefix  = isIncome ? '+' : '−';
      const emoji      = CATEGORY_EMOJI[t.category] || '💳';

      return `
        <div class="transaction-item" data-id="${t.id}" role="listitem">
          <div class="tx-icon ${iconClass}">${emoji}</div>
          <div class="tx-body">
            <p class="tx-desc" title="${escapeHtml(t.description)}">${escapeHtml(t.description)}</p>
            <p class="tx-category">${escapeHtml(t.category)}</p>
          </div>
          <span class="tx-amount ${amtClass}">${amtPrefix}${formatCurrency(t.amount)}</span>
          <button
            class="tx-delete"
            data-id="${t.id}"
            aria-label="Elimina transazione ${escapeHtml(t.description)}"
            title="Elimina"
          >✕</button>
        </div>
      `;
    }).join('');

    return `
      <div class="day-group">
        <p class="day-label">${dayKeyToLabel(dayKey)}</p>
        ${items}
      </div>
    `;
  }).join('');

  DOM.transactionList.innerHTML = html;

  // Delega gli eventi click sui bottoni di eliminazione
  DOM.transactionList.querySelectorAll('.tx-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id     = btn.dataset.id;
      const itemEl = btn.closest('.transaction-item');
      if (itemEl) deleteTransaction(id, itemEl);
    });
  });
}

/**
 * Escape dell'HTML per prevenire XSS nei contenuti dinamici.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ----------------------------------------------------------------
   16. RENDER COMPLETO – Aggiorna tutta la UI in una sola chiamata
---------------------------------------------------------------- */

/**
 * Aggiorna tutte le sezioni dell'interfaccia con i dati aggiornati.
 * È la funzione centrale chiamata dopo ogni modifica allo stato.
 * @param {Array<Object>} [transactions] – se omesso li rilegge dal localStorage
 */
function renderAll(transactions) {
  const txs = transactions || loadTransactions();
  renderDashboard(txs);
  renderChart(txs);
  renderAdvice(txs);
  renderTransactionList(txs);
}

/* ----------------------------------------------------------------
   17. EVENT LISTENERS – Collegamento di tutti gli eventi UI
---------------------------------------------------------------- */

/**
 * Inizializza tutti i listener dell'applicazione.
 */
function initEventListeners() {

  /* -- Bottone apri/chiudi pannello rapido -- */
  DOM.btnToggleForm.addEventListener('click', togglePanel);

  /* -- Chiusura pannello cliccando sull'overlay -- */
  DOM.overlay.addEventListener('click', closePanel);

  /* -- Chiusura pannello con tasto ESC -- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
  });

  /* -- Toggle Entrata / Uscita -- */
  DOM.btnEntrata.addEventListener('click', () => setTransactionType('entrata'));
  DOM.btnUscita.addEventListener('click',  () => setTransactionType('uscita'));

  /* -- Submit del form -- */
  DOM.transactionForm.addEventListener('submit', handleFormSubmit);

  /* -- Filtri cronologia -- */
  DOM.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderTransactionList(loadTransactions());
    });
  });

  /* -- Selettori periodo grafico -- */
  DOM.periodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartPeriod = btn.dataset.period;
      renderChart(loadTransactions());
    });
  });

  /* -- Cancella errore form mentre l'utente digita -- */
  DOM.inputAmount.addEventListener('input', clearFormError);
  DOM.inputDesc.addEventListener('input',   clearFormError);
}

/* ----------------------------------------------------------------
   18. INIZIALIZZAZIONE APPLICAZIONE
---------------------------------------------------------------- */

/**
 * Punto di ingresso principale dell'applicazione.
 * Eseguito al caricamento completo del DOM.
 */
function init() {
  // Popola il select categorie con il tipo di default ('entrata')
  updateCategorySelect(currentType);

  // Aggancia tutti gli event listener
  initEventListeners();

  // Prima renderizzazione con i dati già presenti nel localStorage
  renderAll();
}

// Avvia l'app al caricamento del DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // Il DOM è già disponibile (script in fondo al body)
  init();
}

/* ----------------------------------------------------------------
   19. REGISTRAZIONE SERVICE WORKER
   Attivata solo se il browser supporta la funzionalità.
   La registrazione avviene dopo il caricamento della pagina
   per non rallentare il primo render.
---------------------------------------------------------------- */
window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('[FinanceTracker] Service Worker registrato con scope:', registration.scope);
      })
      .catch(err => {
        console.error('[FinanceTracker] Errore registrazione Service Worker:', err);
      });
  }
});
