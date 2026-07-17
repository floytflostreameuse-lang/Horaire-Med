const STORAGE_KEY = 'lunaRecoveryApp_v3';
const APP_VERSION = 4;

const NAV_ITEMS = [
  ['dashboard', 'Accueil', 'house.svg'],
  ['todo', 'Todo list', 'check-square.svg'],
  ['timeline', 'Timeline', 'hourglass-medium.svg'],
  ['schedule', 'Horaire', 'calendar-dots.svg'],
  ['meds', 'Médicaments', 'pill.svg'],
  ['symptoms', 'Symptômes', 'person-arms-spread.svg'],
  ['instructions', 'Instructions', 'moon.svg'],
  ['history', 'Historique', 'check-square.svg'],
  ['stats', 'Statistiques', 'chart-bar.svg'],
  ['settings', 'Paramètres', 'gear.svg']
];

const PAGE_META = {
  dashboard: ['Aujourd’hui', 'Récupération post-opératoire'],
  todo: ['Todo list', 'Vue quotidienne'],
  timeline: ['Timeline', 'Vue chronologique'],
  schedule: ['Calendrier / horaire', 'Vue globale'],
  meds: ['Médicaments', 'Traitement'],
  symptoms: ['Symptômes', 'Suivi quotidien'],
  instructions: ['Instructions', 'Après l’opération'],
  history: ['Historique', 'Journal automatique'],
  stats: ['Statistiques', 'Résumé'],
  settings: ['Paramètres', 'Personnalisation']
};

const MED_COLORS = {
  ibuprofen: '#f6ae63',
  acetaminophen: '#d17db1',
  dexamethasone: '#78b8c7',
  azithromycin: '#8d72d9'
};

function localISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localISO(date);
}

function combine(dateString, timeString) {
  return new Date(`${dateString}T${timeString}:00`);
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatDate(dateString, options = { day: 'numeric', month: 'long' }) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString('fr-CA', options);
}

function formatLongDate(dateString) {
  return formatDate(dateString, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `med-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSettings(settings = {}) {
  return {
    surgeryDate: '2026-07-17',
    firstPainDoseTime: '14:00',
    trackingDays: 6,
    notifications: false,
    sleepStart: '23:00',
    sleepEnd: '08:00',
    avoidSleep: true,
    ...settings
  };
}

function isTimeInSleepWindow(time, settings = state?.settings || normalizeSettings()) {
  if (!settings.avoidSleep) return false;
  const value = timeToMinutes(time);
  const start = timeToMinutes(settings.sleepStart);
  const end = timeToMinutes(settings.sleepEnd);

  // Les bornes exactes restent disponibles : une prise à 23 h peut être prise juste avant de dormir,
  // et une prise à 8 h peut être prise au réveil.
  if (start === end) return false;
  if (start < end) return value > start && value < end;
  return value > start || value < end;
}

function adjustDateTimeForSleep(dateString, timeString, settings = state?.settings || normalizeSettings()) {
  if (!isTimeInSleepWindow(timeString, settings)) {
    return { date: dateString, time: timeString, sleepAdjusted: false };
  }

  const value = timeToMinutes(timeString);
  const start = timeToMinutes(settings.sleepStart);
  const end = timeToMinutes(settings.sleepEnd);
  let adjustedDate = dateString;

  // Pour une fenêtre qui traverse minuit (ex. 23 h à 8 h), une heure après le coucher
  // est déplacée au réveil du lendemain; une heure après minuit va au réveil du même jour.
  if (start > end && value > start) adjustedDate = addDays(dateString, 1);

  return {
    date: adjustedDate,
    time: settings.sleepEnd,
    sleepAdjusted: true,
    originalDate: dateString,
    originalTime: timeString
  };
}

function buildPainSchedules(settings) {
  const acetaminophen = {};
  const ibuprofen = {};
  const start = combine(settings.surgeryDate, settings.firstPainDoseTime);
  const end = new Date(start.getTime() + 48 * 60 * 60 * 1000);
  let next = new Date(start);
  let index = 0;

  // On conserve l'alternance de 3 heures pendant les périodes d'éveil.
  // Lorsqu'une prise tomberait pendant le sommeil, elle passe au réveil et est marquée comme ajustée.
  while (next <= end) {
    const originalDate = localISO(next);
    const originalTime = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
    const adjusted = adjustDateTimeForSleep(originalDate, originalTime, settings);
    const actual = combine(adjusted.date, adjusted.time);
    if (actual > end) break;

    const isAcetaminophen = index % 2 === 0;
    const target = isAcetaminophen ? acetaminophen : ibuprofen;
    const dose = isAcetaminophen ? '2 comprimés (1000 mg)' : '1 comprimé (600 mg)';
    (target[adjusted.date] ||= []).push({
      time: adjusted.time,
      dose,
      sleepAdjusted: adjusted.sleepAdjusted,
      originalDate: adjusted.originalDate,
      originalTime: adjusted.originalTime
    });

    next = new Date(actual.getTime() + 3 * 60 * 60 * 1000);
    index += 1;
  }

  return { acetaminophen, ibuprofen };
}

function buildDefaultMedications(settings) {
  settings = normalizeSettings(settings);
  const pain = buildPainSchedules(settings);
  const day2 = addDays(settings.surgeryDate, 1);
  const day3 = addDays(settings.surgeryDate, 2);
  const day4 = addDays(settings.surgeryDate, 3);
  const day5 = addDays(settings.surgeryDate, 4);

  return [
    {
      id: 'acetaminophen',
      builtIn: true,
      sleepPolicy: 'global',
      name: 'Acétaminophène',
      strength: '500 mg par comprimé',
      quantity: '2 comprimés',
      doseSummary: '1000 mg par prise',
      color: MED_COLORS.acetaminophen,
      startDate: settings.surgeryDate,
      endDate: addDays(settings.surgeryDate, 2),
      scheduleType: 'custom',
      customSchedule: pain.acetaminophen,
      instructions: 'Alterner avec l’ibuprofène toutes les 3 heures pendant 48 heures, puis prendre seulement au besoin selon l’ordonnance.',
      afterSchedule: 'Au besoin après les 48 premières heures.'
    },
    {
      id: 'ibuprofen',
      builtIn: true,
      sleepPolicy: 'global',
      name: 'Ibuprofène',
      strength: '600 mg',
      quantity: '1 comprimé',
      doseSummary: '600 mg par prise',
      color: MED_COLORS.ibuprofen,
      startDate: settings.surgeryDate,
      endDate: addDays(settings.surgeryDate, 2),
      scheduleType: 'custom',
      customSchedule: pain.ibuprofen,
      instructions: 'Alterner avec l’acétaminophène toutes les 3 heures pendant 48 heures, puis prendre seulement au besoin selon l’ordonnance.',
      afterSchedule: 'Au besoin après les 48 premières heures.'
    },
    {
      id: 'dexamethasone',
      builtIn: true,
      sleepPolicy: 'global',
      name: 'Dexaméthasone',
      strength: '4 mg',
      quantity: '1 comprimé',
      doseSummary: '4 mg par prise',
      color: MED_COLORS.dexamethasone,
      startDate: settings.surgeryDate,
      endDate: day4,
      scheduleType: 'custom',
      customSchedule: {
        [settings.surgeryDate]: [{ time: '22:00', dose: '1 comprimé (4 mg)' }],
        [day2]: [{ time: '08:00', dose: '1 comprimé (4 mg)' }, { time: '20:00', dose: '1 comprimé (4 mg)' }],
        [day3]: [{ time: '08:00', dose: '1 comprimé (4 mg)' }, { time: '20:00', dose: '1 comprimé (4 mg)' }],
        [day4]: [{ time: '08:00', dose: '1 comprimé (4 mg)' }, { time: '20:00', dose: '1 comprimé (4 mg)' }]
      },
      instructions: '1 comprimé au coucher le jour de l’opération, puis 1 comprimé deux fois par jour pendant 3 jours. Les 2 comprimés pris avant l’opération ne sont pas comptés ici.'
    },
    {
      id: 'azithromycin',
      builtIn: true,
      sleepPolicy: 'global',
      name: 'Azithromycine',
      strength: '250 mg par comprimé',
      quantity: 'Variable selon le jour',
      doseSummary: 'Jour 1 : 500 mg · Jours 2 à 5 : 250 mg',
      color: MED_COLORS.azithromycin,
      startDate: settings.surgeryDate,
      endDate: day5,
      scheduleType: 'custom',
      customSchedule: {
        [settings.surgeryDate]: [{ time: settings.firstPainDoseTime, dose: '2 comprimés (500 mg)' }],
        [day2]: [{ time: settings.firstPainDoseTime, dose: '1 comprimé (250 mg)' }],
        [day3]: [{ time: settings.firstPainDoseTime, dose: '1 comprimé (250 mg)' }],
        [day4]: [{ time: settings.firstPainDoseTime, dose: '1 comprimé (250 mg)' }],
        [day5]: [{ time: settings.firstPainDoseTime, dose: '1 comprimé (250 mg)' }]
      },
      instructions: 'Prendre 2 comprimés le premier jour, puis 1 comprimé toutes les 24 heures du 2e au 5e jour.'
    }
  ];
}

function createDefaultState() {
  const settings = normalizeSettings();

  return {
    version: APP_VERSION,
    theme: 'dark',
    settings,
    medications: buildDefaultMedications(settings),
    completed: {},
    symptoms: {}
  };
}

function loadState() {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { return createDefaultState(); }
  if (!saved) return createDefaultState();
  try {
    const parsed = JSON.parse(saved);
    const previousVersion = Number(parsed.version || 0);
    const defaults = createDefaultState();
    parsed.settings = normalizeSettings(parsed.settings);
    parsed.theme = parsed.theme || defaults.theme;
    parsed.completed = parsed.completed || {};
    parsed.symptoms = parsed.symptoms || {};
    parsed.medications = Array.isArray(parsed.medications) ? parsed.medications : defaults.medications;
    parsed.medications = parsed.medications.map((medication) => ({
      sleepPolicy: 'global',
      ...medication
    }));

    // La version 4 ajoute le mode sommeil. Les médicaments intégrés sont recalculés
    // automatiquement afin qu'une ancienne sauvegarde ne conserve pas les prises de nuit.
    if (previousVersion < 4) {
      const customMedications = parsed.medications.filter((medication) => !medication.builtIn);
      const oldBuiltIns = Object.fromEntries(parsed.medications.filter((medication) => medication.builtIn).map((medication) => [medication.id, medication]));
      const rebuilt = buildDefaultMedications(parsed.settings).map((medication) => ({
        ...medication,
        name: oldBuiltIns[medication.id]?.name || medication.name,
        color: oldBuiltIns[medication.id]?.color || medication.color,
        instructions: oldBuiltIns[medication.id]?.instructions || medication.instructions
      }));
      parsed.medications = [...rebuilt, ...customMedications];
    }

    parsed.version = APP_VERSION;
    return parsed;
  } catch {
    return createDefaultState();
  }
}

let state = loadState();
let activeView = 'dashboard';
let selectedScheduleDate = state.settings.surgeryDate;
let todoFilter = 'all';
let selectedTimelineId = null;
let toastTimer;

function saveState({ render = true } = {}) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* Le mode fichier privé peut bloquer le stockage. */ }
  if (render) renderAll();
}

function medicationById(id) {
  return state.medications.find((medication) => medication.id === id);
}

function occurrenceId(medicationId, date, time) {
  return `${medicationId}|${date}|${time}`;
}

function medicationAvoidsSleep(medication) {
  if (medication.sleepPolicy === 'strict') return false;
  if (medication.sleepPolicy === 'avoid') return true;
  return Boolean(state.settings.avoidSleep);
}

function sleepAdjustmentText(item) {
  if (!item.sleepAdjusted) return '';
  const original = item.originalDate && item.originalDate !== item.date
    ? `${formatDate(item.originalDate)} à ${item.originalTime}`
    : item.originalTime;
  return `Ajustée au réveil (prévue initialement ${original})`;
}

function sleepBadgeMarkup(item) {
  return item.sleepAdjusted
    ? `<span class="sleep-badge" title="${sleepAdjustmentText(item)}">☾ Ajustée au sommeil</span>`
    : '';
}

function normalizeScheduleEntry(entry, medication) {
  if (typeof entry === 'string') return { time: entry, dose: `${medication.quantity} (${medication.strength})` };
  return entry;
}

function generateOccurrences() {
  const occurrences = [];

  state.medications.forEach((medication) => {
    if (medication.scheduleType === 'prn') return;

    if (medication.scheduleType === 'custom' && medication.customSchedule) {
      Object.entries(medication.customSchedule).forEach(([date, entries]) => {
        entries.forEach((rawEntry) => {
          const entry = normalizeScheduleEntry(rawEntry, medication);
          const id = occurrenceId(medication.id, date, entry.time);
          occurrences.push({
            id,
            medicationId: medication.id,
            name: medication.name,
            date,
            time: entry.time,
            dose: entry.dose,
            color: medication.color,
            instructions: medication.instructions,
            sleepAdjusted: Boolean(entry.sleepAdjusted),
            originalDate: entry.originalDate || null,
            originalTime: entry.originalTime || null,
            done: Boolean(state.completed[id]),
            takenAt: state.completed[id]?.at || null
          });
        });
      });
      return;
    }

    if (medication.scheduleType === 'fixed') {
      const start = new Date(`${medication.startDate}T12:00:00`);
      const end = new Date(`${medication.endDate}T12:00:00`);
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const sourceDate = localISO(cursor);
        (medication.times || []).forEach((sourceTime) => {
          const effectiveSettings = { ...state.settings, avoidSleep: medicationAvoidsSleep(medication) };
          const adjusted = adjustDateTimeForSleep(sourceDate, sourceTime, effectiveSettings);
          const id = occurrenceId(medication.id, sourceDate, sourceTime);
          occurrences.push({
            id,
            medicationId: medication.id,
            name: medication.name,
            date: adjusted.date,
            time: adjusted.time,
            dose: `${medication.quantity}${medication.strength ? ` · ${medication.strength}` : ''}`,
            color: medication.color,
            instructions: medication.instructions,
            sleepAdjusted: adjusted.sleepAdjusted,
            originalDate: adjusted.originalDate || null,
            originalTime: adjusted.originalTime || null,
            done: Boolean(state.completed[id]),
            takenAt: state.completed[id]?.at || null
          });
        });
      }
    }
  });

  return occurrences.sort((a, b) => combine(a.date, a.time) - combine(b.date, b.time));
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bonjour ✦';
  if (hour < 18) return 'Bon après-midi ✦';
  return 'Bonsoir ✦';
}

function recoveryDay(date = localISO()) {
  const start = new Date(`${state.settings.surgeryDate}T12:00:00`);
  const current = new Date(`${date}T12:00:00`);
  return Math.max(1, Math.floor((current - start) / 86400000) + 1);
}

function isWithinTracking(date) {
  return date >= state.settings.surgeryDate && date < addDays(state.settings.surgeryDate, state.settings.trackingDays);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelectorAll('.theme-icon').forEach((icon) => {
    icon.style.setProperty('--icon', `url('${state.theme === 'dark' ? 'sun.svg' : 'moon.svg'}')`);
  });
  document.querySelector('meta[name="theme-color"]').content = state.theme === 'dark' ? '#07101f' : '#edf2f7';
  document.getElementById('themeSwitch')?.classList.toggle('on', state.theme === 'dark');
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  saveState();
  showToast(state.theme === 'dark' ? 'Mode sombre activé' : 'Mode clair activé');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderDesktopNavigation() {
  const container = document.querySelector('.side-nav');
  container.innerHTML = NAV_ITEMS.map(([id, label, icon]) => `
    <button data-nav="${id}" class="${id === activeView ? 'active' : ''}">
      <span class="ui-icon" style="--icon:url('${icon}')"></span>
      <span>${label}</span>
    </button>
  `).join('');
}

function navigate(view) {
  activeView = view;
  document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.dataset.view === view));
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.nav === view));
  const [title, eyebrow] = PAGE_META[view];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageEyebrow').textContent = eyebrow;
  closeMoreSheet();
  renderDesktopNavigation();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openMoreSheet() {
  document.getElementById('moreSheet').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeMoreSheet() {
  document.getElementById('moreSheet').hidden = true;
  document.body.style.overflow = '';
}

function setRing(element, percent) {
  element.style.setProperty('--progress', `${Math.max(0, Math.min(100, percent)) * 3.6}deg`);
}

function getTodayOccurrences() {
  return generateOccurrences().filter((item) => item.date === localISO());
}

function getNextOccurrence() {
  const now = new Date();
  return generateOccurrences().find((item) => !item.done && combine(item.date, item.time) >= now) || null;
}

function renderDashboard() {
  const today = localISO();
  const all = generateOccurrences();
  const todayItems = all.filter((item) => item.date === today);
  const todayDone = todayItems.filter((item) => item.done).length;
  const done = all.filter((item) => item.done).length;
  const totalPercent = all.length ? Math.round(done / all.length * 100) : 0;
  const todayPercent = todayItems.length ? Math.round(todayDone / todayItems.length * 100) : 0;

  document.getElementById('dashboardGreeting').textContent = getGreeting();
  document.getElementById('recoveryDay').textContent = `Jour ${recoveryDay(today)}`;
  document.getElementById('surgeryDateText').textContent = `Chirurgie le ${formatDate(state.settings.surgeryDate, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  document.getElementById('safetyScheduleText').textContent = `Les prises postopératoires commencent à ${state.settings.firstPainDoseTime.replace(':', ' h ')}. Les 5 comprimés pris avant l’opération ne sont pas comptés. ${state.settings.avoidSleep ? `Le mode sommeil évite les prises entre ${state.settings.sleepStart} et ${state.settings.sleepEnd} et marque les déplacements d’un symbole ☾.` : 'Le mode sommeil est désactivé : les heures exactes sont conservées.'}`;
  document.getElementById('progressPercent').textContent = `${totalPercent}%`;
  setRing(document.getElementById('orbitProgress'), totalPercent);
  document.getElementById('todayDone').textContent = todayDone;
  document.getElementById('todayTotal').textContent = todayItems.length;
  document.getElementById('todayPercent').textContent = `${todayPercent}%`;
  setRing(document.getElementById('todayRing'), todayPercent);

  const preview = todayItems.filter((item) => !item.done).slice(0, 4);
  const fallback = todayItems.slice(-3);
  const previewItems = preview.length ? preview : fallback;
  document.getElementById('dashboardTasks').innerHTML = previewItems.length
    ? previewItems.map((item) => `
      <div class="preview-task ${item.done ? 'done' : ''}">
        <time>${item.time}</time>
        <span class="dot" style="--med-color:${item.color}"></span>
        <div><strong>${item.name}</strong><small>${item.dose}</small>${sleepBadgeMarkup(item)}</div>
        <span class="status-glyph">${item.done ? '✓' : '○'}</span>
      </div>
    `).join('')
    : '<div class="empty-state">Aucune prise prévue aujourd’hui.</div>';

  renderNextDose();
}

function renderNextDose() {
  const next = getNextOccurrence();
  const name = document.getElementById('nextDoseName');
  const detail = document.getElementById('nextDoseDetail');
  const countdown = document.getElementById('countdown');
  const button = document.getElementById('takeNextDoseButton');
  const orb = document.getElementById('nextDoseOrb');
  const progress = document.getElementById('nextDoseProgress');

  if (!next) {
    name.textContent = 'Traitement planifié terminé';
    detail.textContent = 'Les médicaments au besoin restent disponibles dans la section Médicaments.';
    countdown.textContent = 'Terminé ✦';
    button.hidden = true;
    progress.style.width = '100%';
    orb.style.background = 'var(--success)';
    return;
  }

  const now = new Date();
  const target = combine(next.date, next.time);
  const difference = Math.max(0, target - now);
  const hours = Math.floor(difference / 3600000);
  const minutes = Math.floor((difference % 3600000) / 60000);
  const seconds = Math.floor((difference % 60000) / 1000);

  name.textContent = next.name;
  detail.innerHTML = `${next.dose} · ${formatDate(next.date)} à ${next.time}${next.sleepAdjusted ? `<br>${sleepBadgeMarkup(next)}` : ''}`;
  countdown.textContent = difference <= 1000
    ? 'Maintenant'
    : `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  button.hidden = false;
  button.dataset.occurrence = next.id;
  orb.style.background = next.color;
  orb.style.color = next.color;

  const previous = generateOccurrences().filter((item) => combine(item.date, item.time) < target).at(-1);
  if (previous) {
    const start = combine(previous.date, previous.time);
    const interval = Math.max(1, target - start);
    const elapsed = Math.max(0, Math.min(interval, now - start));
    progress.style.width = `${Math.round(elapsed / interval * 100)}%`;
  } else {
    progress.style.width = '20%';
  }
}

function taskMarkup(item) {
  const overdue = !item.done && combine(item.date, item.time) < new Date();
  return `
    <label class="task-item ${item.done ? 'done' : ''} ${overdue ? 'overdue' : ''}" style="--med-color:${item.color}">
      <input class="task-check" type="checkbox" data-occurrence="${item.id}" ${item.done ? 'checked' : ''}>
      <time class="task-time">${item.time}</time>
      <span>
        <span class="task-title">${item.name}</span>
        <span class="task-meta">${item.dose}</span>
        ${sleepBadgeMarkup(item)}
      </span>
      <span class="task-badge">${item.done ? 'Prise' : overdue ? 'En retard' : 'À venir'}</span>
    </label>
  `;
}

function renderTodo() {
  const input = document.getElementById('todoDate');
  if (!input.value) input.value = isWithinTracking(localISO()) ? localISO() : state.settings.surgeryDate;
  let items = generateOccurrences().filter((item) => item.date === input.value);
  const allCount = items.length;
  const doneCount = items.filter((item) => item.done).length;

  if (todoFilter === 'pending') items = items.filter((item) => !item.done);
  if (todoFilter === 'done') items = items.filter((item) => item.done);

  document.getElementById('todoSummary').innerHTML = `<span>${formatLongDate(input.value)}</span><strong>${doneCount}/${allCount} complétées</strong>`;
  document.getElementById('todoList').innerHTML = items.length
    ? items.map(taskMarkup).join('')
    : '<div class="empty-state">Aucune prise dans cette catégorie.</div>';
}

function renderTimeline() {
  const input = document.getElementById('timelineDate');
  if (!input.value) input.value = isWithinTracking(localISO()) ? localISO() : state.settings.surgeryDate;
  const items = generateOccurrences().filter((item) => item.date === input.value);
  const timeline = document.getElementById('timeline');

  if (!items.length) {
    timeline.innerHTML = '<div class="empty-state">Aucune prise prévue ce jour-là.</div>';
    document.getElementById('timelineDetails').innerHTML = '';
    return;
  }

  if (!selectedTimelineId || !items.some((item) => item.id === selectedTimelineId)) {
    selectedTimelineId = items.find((item) => !item.done)?.id || items[0].id;
  }

  timeline.innerHTML = items.map((item) => `
    <div class="timeline-node ${item.done ? 'done' : ''} ${item.id === selectedTimelineId ? 'selected' : ''}" style="--med-color:${item.color}">
      <time>${item.time}</time>
      <button data-timeline-item="${item.id}" aria-label="Voir ${item.name} à ${item.time}"></button>
      <span class="node-name">${item.name}${item.sleepAdjusted ? '<em>☾</em>' : ''}</span>
    </div>
  `).join('');

  const selected = items.find((item) => item.id === selectedTimelineId);
  document.getElementById('timelineDetails').innerHTML = `
    <article class="card timeline-detail-card" style="--med-color:${selected.color}">
      <div class="detail-top"><div><p class="section-label">Prise sélectionnée</p><h3>${selected.name}</h3></div><span class="detail-time">${selected.time}</span></div>
      <p><strong>${selected.dose}</strong><br>${selected.instructions}</p>
      ${selected.sleepAdjusted ? `<p class="sleep-detail">☾ ${sleepAdjustmentText(selected)}</p>` : ''}
      <button class="primary-button full" data-occurrence-action="${selected.id}">${selected.done ? 'Annuler la prise' : 'Marquer comme prise'}</button>
    </article>
  `;
}

function renderSchedule() {
  const days = Array.from({ length: state.settings.trackingDays }, (_, index) => addDays(state.settings.surgeryDate, index));
  if (!days.includes(selectedScheduleDate)) selectedScheduleDate = days[0];

  document.getElementById('scheduleDays').innerHTML = days.map((date, index) => `
    <button class="day-tab ${date === selectedScheduleDate ? 'active' : ''}" data-schedule-date="${date}">
      <strong>J${index + 1}</strong><small>${formatDate(date, { day: '2-digit', month: '2-digit' })}</small>
    </button>
  `).join('');

  document.getElementById('scheduleDateTitle').textContent = formatLongDate(selectedScheduleDate);
  const items = generateOccurrences().filter((item) => item.date === selectedScheduleDate);
  document.getElementById('scheduleGrid').innerHTML = items.length
    ? items.map((item) => `
      <div class="schedule-row" style="--med-color:${item.color}">
        <time>${item.time}</time>
        <span class="schedule-line"><i></i></span>
        <div class="schedule-event"><strong>${item.name}</strong><small>${item.dose}</small>${sleepBadgeMarkup(item)}</div>
        <input class="task-check schedule-check" type="checkbox" data-occurrence="${item.id}" ${item.done ? 'checked' : ''}>
      </div>
    `).join('')
    : '<div class="empty-state">Aucune prise prévue ce jour-là.</div>';
}

function scheduleSummary(medication) {
  if (medication.id === 'acetaminophen' || medication.id === 'ibuprofen') return state.settings.avoidSleep ? `En alternance toutes les 3 h pendant l’éveil, pause entre ${state.settings.sleepStart} et ${state.settings.sleepEnd}` : 'Toutes les 6 h, en alternance toutes les 3 h pendant 48 h';
  if (medication.id === 'dexamethasone') return 'Au coucher le jour 1, puis à 08:00 et 20:00 pendant 3 jours';
  if (medication.id === 'azithromycin') return `Tous les jours à ${state.settings.firstPainDoseTime}, pendant 5 jours`;
  if (medication.scheduleType === 'prn') return 'Au besoin, sans heure fixe';
  const times = (medication.times || []).join(' · ');
  if (medicationAvoidsSleep(medication)) return `${times} · sommeil évité`;
  return times;
}

function renderMedications() {
  document.getElementById('medicationCards').innerHTML = state.medications.map((medication) => `
    <article class="card med-card" style="--med-color:${medication.color}">
      <div class="med-card-top">
        <span class="med-icon-wrap"><span class="ui-icon" style="--icon:url('pill.svg')"></span></span>
        <div><h3>${medication.name}</h3><span class="med-dose">${medication.doseSummary || `${medication.quantity} · ${medication.strength}`}</span></div>
        <span class="active-pill">${medication.scheduleType === 'prn' ? 'Au besoin' : 'Actif'}</span>
      </div>
      <p class="med-summary"><strong>${scheduleSummary(medication)}</strong></p>
      <p class="med-instructions">${medication.instructions || ''}</p>
      ${medication.scheduleType !== 'prn' ? `<p class="med-sleep-policy">☾ ${medicationAvoidsSleep(medication) ? `Évite les prises entre ${state.settings.sleepStart} et ${state.settings.sleepEnd}` : 'Respecte les heures exactes, même la nuit'}</p>` : ''}
      ${medication.afterSchedule ? `<p class="med-instructions"><strong>Ensuite :</strong> ${medication.afterSchedule}</p>` : ''}
      <div class="med-card-actions">
        <button data-edit-med="${medication.id}">${medication.builtIn ? 'Voir / modifier' : 'Modifier'}</button>
        <button class="delete-med" data-delete-med="${medication.id}" ${medication.builtIn ? 'disabled title="Les médicaments préremplis ne peuvent pas être supprimés"' : ''}>Supprimer</button>
      </div>
    </article>
  `).join('');
}

const symptomDefinitions = [
  { key: 'pain', label: 'Douleur', symbol: '✦', max: 10, suffix: '/10' },
  { key: 'swelling', label: 'Enflure', symbol: '◉', max: 10, suffix: '/10' },
  { key: 'bleeding', label: 'Saignement', symbol: '◇', max: 5, suffix: '/5' },
  { key: 'nausea', label: 'Nausée', symbol: '≈', max: 5, suffix: '/5' },
  { key: 'jaw', label: 'Ouverture de la mâchoire', symbol: '◌', max: 10, suffix: '/10' },
  { key: 'fatigue', label: 'Fatigue', symbol: '☾', max: 10, suffix: '/10' }
];

function renderSymptoms() {
  const dateInput = document.getElementById('symptomDate');
  if (!dateInput.value) dateInput.value = isWithinTracking(localISO()) ? localISO() : state.settings.surgeryDate;
  const values = state.symptoms[dateInput.value] || {};

  document.getElementById('symptomControls').innerHTML = symptomDefinitions.map((definition) => {
    const value = values[definition.key] ?? 0;
    return `
      <div class="symptom-row">
        <div class="symptom-label">
          <span><i class="symptom-icon">${definition.symbol}</i>${definition.label}</span>
          <span class="symptom-value" id="symptomValue-${definition.key}">${value}${definition.suffix}</span>
        </div>
        <input type="range" data-symptom="${definition.key}" min="0" max="${definition.max}" value="${value}">
      </div>
    `;
  }).join('');

  const history = Object.entries(state.symptoms).sort(([a], [b]) => b.localeCompare(a));
  document.getElementById('symptomHistory').innerHTML = history.length
    ? history.map(([date, data]) => `
      <div class="history-item">
        <div><strong>${formatLongDate(date)}</strong><br><small>Douleur ${data.pain ?? 0}/10 · Enflure ${data.swelling ?? 0}/10 · Fatigue ${data.fatigue ?? 0}/10</small></div>
        <span class="history-status">✦</span>
      </div>
    `).join('')
    : '<div class="empty-state">Aucun symptôme enregistré pour le moment.</div>';
}

function renderHistory() {
  const completed = generateOccurrences().filter((item) => item.done).sort((a, b) => new Date(b.takenAt) - new Date(a.takenAt));
  document.getElementById('doseHistory').innerHTML = completed.length
    ? completed.map((item) => {
      const takenAt = item.takenAt ? new Date(item.takenAt).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : `${formatDate(item.date)} ${item.time}`;
      return `
        <div class="history-item">
          <div><strong>${item.name}</strong><br><small>Prévue : ${formatDate(item.date)} à ${item.time} · ${item.dose}<br>Confirmée : ${takenAt}</small></div>
          <span class="history-status">✓</span>
        </div>
      `;
    }).join('')
    : '<div class="empty-state">Aucune prise n’a encore été cochée.</div>';
}

function renderStats() {
  const occurrences = generateOccurrences();
  const completed = occurrences.filter((item) => item.done).length;
  const remaining = occurrences.length - completed;
  const rate = occurrences.length ? Math.round(completed / occurrences.length * 100) : 0;
  const start = new Date(`${state.settings.surgeryDate}T00:00:00`);
  const end = new Date(`${addDays(state.settings.surgeryDate, state.settings.trackingDays)}T00:00:00`);
  const treatment = Math.max(0, Math.min(100, Math.round((Date.now() - start) / (end - start) * 100)));

  document.getElementById('statCompleted').textContent = completed;
  document.getElementById('statRemaining').textContent = remaining;
  document.getElementById('statRate').textContent = `${rate}%`;
  document.getElementById('statRingLabel').textContent = `${rate}%`;
  setRing(document.getElementById('statRing'), rate);
  document.getElementById('statTreatment').textContent = `${treatment}%`;
  document.getElementById('treatmentBar').style.width = `${treatment}%`;
}

function renderSettings() {
  document.getElementById('surgeryDate').value = state.settings.surgeryDate;
  document.getElementById('firstPainDoseTime').value = state.settings.firstPainDoseTime;
  document.getElementById('trackingDays').value = state.settings.trackingDays;
  document.getElementById('sleepStart').value = state.settings.sleepStart;
  document.getElementById('sleepEnd').value = state.settings.sleepEnd;
  document.getElementById('sleepSwitch').classList.toggle('on', state.settings.avoidSleep);
  document.getElementById('sleepStatusText').textContent = state.settings.avoidSleep
    ? `Actif · aucune prise planifiée entre ${state.settings.sleepStart} et ${state.settings.sleepEnd}`
    : 'Désactivé · les heures exactes sont conservées';
  document.getElementById('notificationSwitch').classList.toggle('on', state.settings.notifications);
  document.getElementById('notificationDot').classList.toggle('off', !state.settings.notifications);
  const badge = document.getElementById('trackingDaysBadge');
  if (badge) badge.textContent = `${state.settings.trackingDays} jours`;
}

function renderAll() {
  applyTheme();
  renderDesktopNavigation();
  renderDashboard();
  renderTodo();
  renderTimeline();
  renderSchedule();
  renderMedications();
  renderSymptoms();
  renderHistory();
  renderStats();
  renderSettings();
}

function toggleOccurrence(id) {
  if (state.completed[id]) {
    delete state.completed[id];
    showToast('Prise retirée de l’historique');
  } else {
    state.completed[id] = { at: new Date().toISOString() };
    showToast('Prise enregistrée ✦');
  }
  saveState();
}

function shiftInputDate(inputId, amount) {
  const input = document.getElementById(inputId);
  input.value = addDays(input.value || localISO(), amount);
  input.dispatchEvent(new Event('change'));
}

function openMedicationModal(medication = null) {
  const dialog = document.getElementById('medicationModal');
  document.getElementById('medicationForm').reset();
  document.getElementById('medDialogTitle').textContent = medication ? `Modifier ${medication.name}` : 'Ajouter un médicament';
  document.getElementById('medId').value = medication?.id || '';
  document.getElementById('medName').value = medication?.name || '';
  document.getElementById('medStrength').value = medication?.strength || '';
  document.getElementById('medQuantity').value = medication?.quantity || '';
  document.getElementById('medStartDate').value = medication?.startDate || state.settings.surgeryDate;
  document.getElementById('medEndDate').value = medication?.endDate || addDays(state.settings.surgeryDate, 5);

  const isBuiltIn = Boolean(medication?.builtIn);
  const scheduleType = isBuiltIn ? 'fixed' : (medication?.scheduleType || 'fixed');
  document.getElementById('medScheduleType').value = scheduleType;
  document.getElementById('medScheduleType').disabled = isBuiltIn;
  document.getElementById('medSleepPolicy').value = medication?.sleepPolicy || 'global';
  document.getElementById('medSleepPolicy').disabled = isBuiltIn;

  let times = medication?.times || [];
  if (isBuiltIn) {
    times = [...new Set(Object.values(medication.customSchedule || {}).flat().map((entry) => normalizeScheduleEntry(entry, medication).time))].sort();
  }
  document.getElementById('medTimes').value = times.join(', ');
  document.getElementById('medTimes').disabled = isBuiltIn;
  document.getElementById('medTimesField').style.opacity = isBuiltIn ? '.55' : '1';
  document.getElementById('medSleepPolicyField').style.opacity = isBuiltIn ? '.55' : '1';
  document.getElementById('medInstructions').value = medication?.instructions || '';
  document.querySelectorAll('input[name="medColor"]').forEach((radio) => radio.checked = radio.value === (medication?.color || '#f6ae63'));
  updateMedicationScheduleFields();
  dialog.showModal();
}

function updateMedicationScheduleFields() {
  const isPrn = document.getElementById('medScheduleType').value === 'prn';
  document.getElementById('medTimesField').hidden = isPrn;
  document.getElementById('medSleepPolicyField').hidden = isPrn;
  document.getElementById('medTimes').required = !isPrn && !document.getElementById('medTimes').disabled;
}

function saveMedicationFromForm(event) {
  event.preventDefault();
  const id = document.getElementById('medId').value || uid();
  const existing = medicationById(id);
  const builtIn = Boolean(existing?.builtIn);
  const color = document.querySelector('input[name="medColor"]:checked')?.value || '#f6ae63';

  if (builtIn) {
    existing.name = document.getElementById('medName').value.trim();
    existing.strength = document.getElementById('medStrength').value.trim();
    existing.quantity = document.getElementById('medQuantity').value.trim();
    existing.instructions = document.getElementById('medInstructions').value.trim();
    existing.color = color;
    existing.doseSummary = `${existing.quantity} · ${existing.strength}`;
  } else {
    const scheduleType = document.getElementById('medScheduleType').value;
    const times = document.getElementById('medTimes').value.split(',').map((time) => time.trim()).filter(Boolean);
    const medication = {
      id,
      builtIn: false,
      name: document.getElementById('medName').value.trim(),
      strength: document.getElementById('medStrength').value.trim(),
      quantity: document.getElementById('medQuantity').value.trim(),
      doseSummary: `${document.getElementById('medQuantity').value.trim()} · ${document.getElementById('medStrength').value.trim()}`,
      color,
      startDate: document.getElementById('medStartDate').value,
      endDate: document.getElementById('medEndDate').value,
      scheduleType,
      times,
      sleepPolicy: document.getElementById('medSleepPolicy').value,
      instructions: document.getElementById('medInstructions').value.trim()
    };
    const index = state.medications.findIndex((item) => item.id === id);
    if (index >= 0) state.medications[index] = medication;
    else state.medications.push(medication);
  }

  document.getElementById('medicationModal').close();
  saveState();
  showToast('Médicament enregistré');
}

async function toggleNotifications() {
  if (!('Notification' in window) || location.protocol === 'file:') {
    showToast(location.protocol === 'file:' ? 'Les notifications seront disponibles une fois le site publié sur GitHub Pages.' : 'Les notifications ne sont pas prises en charge par ce navigateur.');
    return;
  }

  if (state.settings.notifications) {
    state.settings.notifications = false;
    saveState();
    showToast('Notifications désactivées');
    return;
  }

  const permission = await Notification.requestPermission();
  state.settings.notifications = permission === 'granted';
  saveState();
  showToast(state.settings.notifications ? 'Notifications activées' : 'Permission refusée');
}

function maybeNotify() {
  if (!state.settings.notifications || Notification.permission !== 'granted') return;
  const now = new Date();
  const soon = generateOccurrences().find((item) => {
    const difference = Math.abs(combine(item.date, item.time) - now);
    return !item.done && difference < 45000;
  });
  if (!soon) return;
  const key = `luna-notified-${soon.id}`;
  if (sessionStorage.getItem(key)) return;
  new Notification(`Luna · ${soon.time}`, { body: `${soon.name} — ${soon.dose}`, icon: 'moon.svg' });
  sessionStorage.setItem(key, '1');
}

function rebuildBuiltInSchedules() {
  const customMedications = state.medications.filter((medication) => !medication.builtIn);
  const oldBuiltIns = Object.fromEntries(state.medications.filter((medication) => medication.builtIn).map((medication) => [medication.id, medication]));
  const rebuilt = buildDefaultMedications(state.settings).map((medication) => ({
    ...medication,
    name: oldBuiltIns[medication.id]?.name || medication.name,
    color: oldBuiltIns[medication.id]?.color || medication.color,
    instructions: oldBuiltIns[medication.id]?.instructions || medication.instructions
  }));
  state.medications = [...rebuilt, ...customMedications];
}

function saveScheduleSettings() {
  const surgeryDate = document.getElementById('surgeryDate').value;
  const firstPainDoseTime = document.getElementById('firstPainDoseTime').value;
  const trackingDays = Number(document.getElementById('trackingDays').value);
  const sleepStart = document.getElementById('sleepStart').value;
  const sleepEnd = document.getElementById('sleepEnd').value;
  if (!surgeryDate || !firstPainDoseTime || !trackingDays || !sleepStart || !sleepEnd) return;

  state.settings.surgeryDate = surgeryDate;
  state.settings.firstPainDoseTime = firstPainDoseTime;
  state.settings.trackingDays = trackingDays;
  state.settings.sleepStart = sleepStart;
  state.settings.sleepEnd = sleepEnd;
  selectedScheduleDate = surgeryDate;
  rebuildBuiltInSchedules();
  saveState();
  showToast('Horaire et sommeil recalculés');
}

function toggleSleepAvoidance() {
  state.settings.avoidSleep = !state.settings.avoidSleep;
  rebuildBuiltInSchedules();
  saveState();
  showToast(state.settings.avoidSleep ? 'Les prises de nuit sont maintenant évitées' : 'Les heures exactes sont maintenant conservées');
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `luna-recuperation-${localISO()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.settings || !parsed.medications) throw new Error('Format invalide');
      state = { ...parsed, settings: normalizeSettings(parsed.settings), version: APP_VERSION };
      state.medications = state.medications.map((medication) => ({ sleepPolicy: 'global', ...medication }));
      selectedScheduleDate = state.settings.surgeryDate;
      saveState();
      showToast('Données importées');
    } catch {
      showToast('Ce fichier ne semble pas valide.');
    }
  };
  reader.readAsText(file);
}

function resetData() {
  if (!confirm('Réinitialiser toute l’application et effacer les prises cochées?')) return;
  state = createDefaultState();
  selectedScheduleDate = state.settings.surgeryDate;
  saveState();
  showToast('Application réinitialisée');
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const navigation = event.target.closest('[data-nav]');
    if (navigation) navigate(navigation.dataset.nav);

    const dateStep = event.target.closest('[data-date-step]');
    if (dateStep) shiftInputDate(dateStep.dataset.dateTarget, Number(dateStep.dataset.dateStep));

    const scheduleDate = event.target.closest('[data-schedule-date]');
    if (scheduleDate) {
      selectedScheduleDate = scheduleDate.dataset.scheduleDate;
      renderSchedule();
    }

    const timelineItem = event.target.closest('[data-timeline-item]');
    if (timelineItem) {
      selectedTimelineId = timelineItem.dataset.timelineItem;
      renderTimeline();
    }

    const occurrenceAction = event.target.closest('[data-occurrence-action]');
    if (occurrenceAction) toggleOccurrence(occurrenceAction.dataset.occurrenceAction);

    const editMedication = event.target.closest('[data-edit-med]');
    if (editMedication) openMedicationModal(medicationById(editMedication.dataset.editMed));

    const deleteMedication = event.target.closest('[data-delete-med]');
    if (deleteMedication && !deleteMedication.disabled && confirm('Supprimer ce médicament et ses rappels?')) {
      state.medications = state.medications.filter((medication) => medication.id !== deleteMedication.dataset.deleteMed);
      saveState();
      showToast('Médicament supprimé');
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-occurrence]')) toggleOccurrence(event.target.dataset.occurrence);
    if (event.target.id === 'todoDate') renderTodo();
    if (event.target.id === 'timelineDate') renderTimeline();
    if (event.target.id === 'symptomDate') renderSymptoms();
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-symptom]')) {
      const definition = symptomDefinitions.find((item) => item.key === event.target.dataset.symptom);
      document.getElementById(`symptomValue-${definition.key}`).textContent = `${event.target.value}${definition.suffix}`;
    }
  });

  document.getElementById('moreNav').addEventListener('click', openMoreSheet);
  document.getElementById('closeMoreSheet').addEventListener('click', closeMoreSheet);
  document.getElementById('moreSheet').addEventListener('click', (event) => { if (event.target.id === 'moreSheet') closeMoreSheet(); });

  ['themeToggle', 'desktopThemeToggle', 'settingsThemeToggle'].forEach((id) => document.getElementById(id).addEventListener('click', toggleTheme));
  ['notificationButton', 'settingsNotificationToggle'].forEach((id) => document.getElementById(id).addEventListener('click', toggleNotifications));

  document.getElementById('takeNextDoseButton').addEventListener('click', (event) => toggleOccurrence(event.currentTarget.dataset.occurrence));

  document.getElementById('todoFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    todoFilter = button.dataset.filter;
    document.querySelectorAll('#todoFilters button').forEach((item) => item.classList.toggle('active', item === button));
    renderTodo();
  });

  document.getElementById('openMedicationModal').addEventListener('click', () => openMedicationModal());
  document.getElementById('closeMedicationModal').addEventListener('click', () => document.getElementById('medicationModal').close());
  document.getElementById('medScheduleType').addEventListener('change', updateMedicationScheduleFields);
  document.getElementById('medicationForm').addEventListener('submit', saveMedicationFromForm);

  document.getElementById('saveSymptoms').addEventListener('click', () => {
    const date = document.getElementById('symptomDate').value;
    state.symptoms[date] = {};
    document.querySelectorAll('[data-symptom]').forEach((input) => state.symptoms[date][input.dataset.symptom] = Number(input.value));
    saveState();
    showToast('Symptômes enregistrés');
  });

  document.getElementById('saveScheduleSettings').addEventListener('click', saveScheduleSettings);
  document.getElementById('saveSleepSettings').addEventListener('click', saveScheduleSettings);
  document.getElementById('avoidSleepToggle').addEventListener('click', toggleSleepAvoidance);
  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('importData').addEventListener('change', (event) => event.target.files[0] && importData(event.target.files[0]));
  document.getElementById('resetData').addEventListener('click', resetData);
}

bindEvents();
renderAll();
navigate('dashboard');
setInterval(() => {
  renderDashboard();
  maybeNotify();
}, 1000);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

window.addEventListener('error', () => {
  const toast = document.getElementById('toast');
  if (toast) { toast.textContent = 'Une erreur est survenue. Recharge la page ou utilise le fichier Luna.html inclus.'; toast.classList.add('show'); }
});
