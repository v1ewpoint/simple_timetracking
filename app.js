'use strict';

// ---------- Speicher (nur lokal auf dem Gerät) ----------
const STORAGE_KEY = 'timetracking.entries.v1';

function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Browser bitten, die Daten nicht automatisch zu löschen
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// ---------- Datums- und Zeithilfen ----------
const pad = (n) => String(n).padStart(2, '0');

function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Dauer in Minuten; Ende vor Beginn = über Mitternacht
function durationMin(start, end) {
  let diff = toMinutes(end) - toMinutes(start);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

const hoursFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatHours = (min) => `${hoursFmt.format(min / 60)} h`;
// 60-Minuten-Takt, z. B. 8:30
const formatHM = (min) => `${Math.floor(min / 60)}:${pad(min % 60)}`;
// Beide Darstellungen: Std:Min oben, Dezimalstunden darunter
const bothHours = (min) => `${formatHM(min)}<span class="day-sub">${formatHours(min)}</span>`;

const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const shortDateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });

// ISO-Kalenderwoche (Montag als Wochenstart)
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function weekKey(isoDate) {
  const { year, week } = isoWeek(parseISODate(isoDate));
  return `${year}-W${pad(week)}`;
}

// ---------- UI-Hilfen ----------
const $ = (sel) => document.querySelector(sel);

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// HTML für eine Woche inkl. Wochensumme
function weekSectionHtml(anyDayOfWeek, list, { id = '', empty = '', markDate = '' } = {}) {
  const monday = mondayOf(anyDayOfWeek);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const { week, year } = isoWeek(monday);
  const total = list.reduce((s, e) => s + durationMin(e.start, e.end), 0);

  const body = list.length ? `
        <table>
          <thead><tr><th>Datum</th><th>Beginn</th><th>Ende</th><th class="num">Std.</th><th></th></tr></thead>
          <tbody>
            ${list.map((e) => {
              const d = parseISODate(e.date);
              return `
              <tr data-date="${escapeHtml(e.date)}"${e.date === markDate ? ' class="mark"' : ''}>
                <td>${shortDateFmt.format(d)}<span class="day-sub">${weekdayFmt.format(d)}</span></td>
                <td>${escapeHtml(e.start)}</td>
                <td>${escapeHtml(e.end)}</td>
                <td class="num">${bothHours(durationMin(e.start, e.end))}</td>
                <td class="del"><button class="icon-btn" data-del="${escapeHtml(e.id)}" aria-label="Löschen">✕</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>` : `<p class="empty">${escapeHtml(empty)}</p>`;

  return `
      <section class="week"${id ? ` id="${id}"` : ''}>
        <div class="week-head">
          <div>KW ${week} / ${year}
            <small>${shortDateFmt.format(monday)} – ${dateFmt.format(sunday)}</small>
          </div>
          <div class="week-sum">${formatHM(total)} Std.<small>${formatHours(total)}</small></div>
        </div>${body}
      </section>`;
}

// Datums-/Uhrzeit-Auswahl beim Antippen des ganzen Feldes öffnen
document.addEventListener('click', (e) => {
  const input = e.target.closest('input[type="date"], input[type="time"]');
  if (!input || typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // z. B. wenn die Auswahl bereits offen ist – dann öffnet der Browser sie selbst
  }
});

// ---------- Seite 1: Erfassen ----------
const fDate = $('#f-date');
const fStart = $('#f-start');
const fEnd = $('#f-end');
const fPreview = $('#f-preview');

function resetForm() {
  fDate.value = toISODate(new Date());
  fStart.value = '';
  fEnd.value = '';
  updatePreview();
}

function updatePreview() {
  if (fStart.value && fEnd.value) {
    const min = durationMin(fStart.value, fEnd.value);
    const overnight = toMinutes(fEnd.value) < toMinutes(fStart.value);
    fPreview.textContent = `Dauer: ${formatHM(min)} Std. (${formatHours(min)})${overnight ? ' (über Mitternacht)' : ''}`;
  } else {
    fPreview.innerHTML = '&nbsp;';
  }
}

[fStart, fEnd].forEach((el) => el.addEventListener('input', updatePreview));

$('#entry-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!fDate.value || !fStart.value || !fEnd.value) {
    toast('Bitte Datum, Beginn und Ende ausfüllen');
    return;
  }
  if (fStart.value === fEnd.value) {
    toast('Beginn und Ende sind gleich');
    return;
  }
  const entries = loadEntries();
  entries.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    date: fDate.value,
    start: fStart.value,
    end: fEnd.value,
  });
  saveEntries(entries);
  toast(`Eingetragen: ${formatHM(durationMin(fStart.value, fEnd.value))} Std.`);
  const keepDate = fDate.value;
  resetForm();
  fDate.value = keepDate;
  renderToday();
});

// Erste Seite: die ganze Woche des gewählten Datums (Mo–So, chronologisch)
function renderToday() {
  const day = fDate.value || toISODate(new Date());
  const key = weekKey(day);
  const list = loadEntries()
    .filter((e) => weekKey(e.date) === key)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  $('#current-week').innerHTML = weekSectionHtml(parseISODate(day), list, {
    empty: 'Noch keine Einträge in dieser Woche.',
    markDate: day,
  });
}

fDate.addEventListener('change', renderToday);

// ---------- Seite 2: Übersicht ----------
function renderWeeks() {
  const entries = loadEntries().sort((a, b) =>
    b.date.localeCompare(a.date) || a.start.localeCompare(b.start));

  if (!entries.length) {
    $('#weeks').innerHTML = '<p class="empty">Noch keine Einträge vorhanden.</p>';
    return;
  }

  // Gruppieren nach ISO-Woche (neueste zuerst)
  const groups = new Map();
  for (const e of entries) {
    const key = weekKey(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  let html = '';
  for (const [key, list] of groups) {
    html += weekSectionHtml(parseISODate(list[0].date), list, { id: `week-${key}` });
  }
  $('#weeks').innerHTML = html;
}

function scrollToEl(el) {
  const offset = $('.topbar').offsetHeight + $('.search').offsetHeight + 8;
  const y = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: y, behavior: 'smooth' });
}

function jumpToDate(isoDate) {
  const msg = $('#search-msg');
  msg.textContent = '';
  document.querySelectorAll('tr.hl').forEach((r) => r.classList.remove('hl'));
  if (!isoDate) return;

  const rows = document.querySelectorAll(`#weeks tr[data-date="${isoDate}"]`);
  if (rows.length) {
    rows.forEach((r) => r.classList.add('hl'));
    scrollToEl(rows[0]);
    setTimeout(() => rows.forEach((r) => r.classList.remove('hl')), 3000);
    return;
  }
  const week = document.getElementById(`week-${weekKey(isoDate)}`);
  if (week) {
    msg.textContent = `Keine Einträge am ${dateFmt.format(parseISODate(isoDate))} – zeige die Woche.`;
    scrollToEl(week);
  } else {
    msg.textContent = `Keine Einträge in der Woche vom ${dateFmt.format(parseISODate(isoDate))}.`;
  }
}

$('#search-btn').addEventListener('click', () => jumpToDate($('#search-date').value));
$('#search-date').addEventListener('change', (e) => jumpToDate(e.target.value));

function rerender() {
  renderToday();
  renderWeeks();
}

// ---------- Löschen (beide Seiten) ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  if (!confirm('Eintrag wirklich löschen?')) return;
  saveEntries(loadEntries().filter((x) => x.id !== btn.dataset.del));
  rerender();
  toast('Eintrag gelöscht');
});

// ---------- Backup ----------
// Automatisch: einmal pro Tag eine Kopie in IndexedDB (bleibt auf dem Gerät).
// Manuell: Export als JSON-Datei bzw. Import aus einer Datei.
const BACKUP_KEEP_DAYS = 30;
const LAST_EXPORT_KEY = 'timetracking.lastExport';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('timetracking', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbTx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('backups', mode);
    const req = fn(tx.objectStore('backups'));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const listBackups = () => dbTx('readonly', (s) => s.getAll());

function addBackup(type, entries) {
  return dbTx('readwrite', (s) => s.add({
    type,
    day: toISODate(new Date()),
    createdAt: new Date().toISOString(),
    entries,
  }));
}

async function autoBackup() {
  try {
    const entries = loadEntries();
    if (!entries.length) return;
    const today = toISODate(new Date());
    const all = await listBackups();
    if (!all.some((b) => b.type === 'auto' && b.day === today)) {
      await addBackup('auto', entries);
    }
    // Backups älter als BACKUP_KEEP_DAYS löschen
    const limit = new Date();
    limit.setDate(limit.getDate() - BACKUP_KEEP_DAYS);
    const old = all.filter((b) => b.day < toISODate(limit)).map((b) => b.id);
    if (old.length) await dbTx('readwrite', (s) => { old.forEach((id) => s.delete(id)); });
  } catch (err) {
    console.warn('Auto-Backup fehlgeschlagen', err);
  }
}

async function exportBackup() {
  const entries = loadEntries();
  if (!entries.length) {
    toast('Keine Daten zum Sichern vorhanden');
    return;
  }
  const json = JSON.stringify({ app: 'zeiterfassung', version: 1, exportedAt: new Date().toISOString(), entries }, null, 2);
  const file = new File([json], `zeiterfassung-backup-${toISODate(new Date())}.json`, { type: 'application/json' });

  // Auf dem Smartphone: Teilen-Dialog (z. B. in Dateien, Drive oder per Mail sichern)
  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Zeiterfassung Backup' });
      markExported();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  markExported();
}

function markExported() {
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  toast('Backup gespeichert');
}

const isValidEntry = (e) => e
  && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
  && /^\d{2}:\d{2}$/.test(e.start)
  && /^\d{2}:\d{2}$/.test(e.end);

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('Datei ist kein gültiges Backup');
    return;
  }
  const incoming = (Array.isArray(data) ? data : data && data.entries) || [];
  const valid = incoming.filter(isValidEntry);
  if (!valid.length) {
    toast('Keine Einträge in der Datei gefunden');
    return;
  }
  // Zusammenführen: gleiche Einträge (Datum, Beginn, Ende) nicht doppelt übernehmen
  const current = loadEntries();
  const sig = (e) => `${e.date}|${e.start}|${e.end}`;
  const known = new Set(current.map(sig));
  const added = valid
    .filter((e) => !known.has(sig(e)))
    .map((e, i) => ({ id: `imp${Date.now().toString(36)}${i}`, date: e.date, start: e.start, end: e.end }));

  if (!added.length) {
    toast('Alle Einträge sind bereits vorhanden');
    return;
  }
  if (!confirm(`${added.length} neue Einträge aus dem Backup übernehmen?\n(Vorhandene Einträge bleiben erhalten.)`)) return;
  if (current.length) await addBackup('vor Import', current).catch(() => {});
  saveEntries(current.concat(added));
  rerender();
  toast(`${added.length} Einträge importiert`);
}

async function showBackupDialog() {
  const listEl = $('#backup-list');
  try {
    const all = (await listBackups()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const dtFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
    listEl.innerHTML = all.length
      ? all.map((b) => `
        <div class="backup-item">
          <div>${dtFmt.format(new Date(b.createdAt))}
            <small>${b.entries.length} Einträge${b.type !== 'auto' ? ` · ${escapeHtml(b.type)}` : ''}</small>
          </div>
          <button type="button" class="btn-secondary" data-restore="${b.id}">Wiederherstellen</button>
        </div>`).join('')
      : '<p class="empty">Noch keine automatischen Backups.</p>';
  } catch {
    listEl.innerHTML = '<p class="empty">Backups sind in diesem Browser nicht verfügbar.</p>';
  }
  $('#backup-dialog').showModal();
}

$('#backup-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-restore]');
  if (!btn) return;
  const backup = (await listBackups()).find((b) => b.id === Number(btn.dataset.restore));
  if (!backup) return;
  if (!confirm(`Aktuelle Daten durch dieses Backup (${backup.entries.length} Einträge) ersetzen?`)) return;
  const current = loadEntries();
  if (current.length) await addBackup('vor Wiederherstellung', current).catch(() => {});
  saveEntries(backup.entries);
  $('#backup-dialog').close();
  rerender();
  toast('Backup wiederhergestellt');
});

// ---------- Menü ----------
const menu = $('#menu');
const menuBtn = $('#menu-btn');

function toggleMenu(open) {
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    const last = localStorage.getItem(LAST_EXPORT_KEY);
    $('#menu-info').textContent = last
      ? `Letztes Datei-Backup: ${dateFmt.format(new Date(last))}`
      : 'Noch kein Datei-Backup gespeichert';
  }
}

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMenu(menu.hidden);
});
document.addEventListener('click', (e) => {
  if (!menu.hidden && !menu.contains(e.target)) toggleMenu(false);
});
menu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-action]');
  if (!item) return;
  toggleMenu(false);
  if (item.dataset.action === 'export') exportBackup();
  if (item.dataset.action === 'import') $('#import-file').click();
  if (item.dataset.action === 'auto') showBackupDialog();
});
$('#import-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importBackup(file);
});

// App bleibt evtl. über Mitternacht offen → beim Zurückkehren erneut prüfen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') autoBackup();
});

// ---------- Navigation ----------
const pages = { entry: 'Zeit erfassen', list: 'Übersicht' };

function route() {
  const name = location.hash.replace('#', '') in pages ? location.hash.replace('#', '') : 'entry';
  for (const key of Object.keys(pages)) {
    $(`#page-${key}`).hidden = key !== name;
  }
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.page === name));
  $('#page-title').textContent = pages[name];
  if (name === 'list') {
    renderWeeks();
    $('#search-msg').textContent = '';
  } else {
    renderToday();
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

// ---------- Start ----------
resetForm();
route();
autoBackup();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
