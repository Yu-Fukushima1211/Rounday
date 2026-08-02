// Service Worker 登録
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    // 定期的に更新チェック（ページフォーカス時）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update();
    });

    reg.addEventListener('updatefound', () => {
      const newSW = reg.installing;
      newSW.addEventListener('statechange', () => {
        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
          // 新バージョン検出 → バナー表示
          showUpdateBanner(newSW);
        }
      });
    });
  });
}

function showUpdateBanner(newSW) {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    background: var(--text); color: var(--bg);
    padding: 10px 20px; border-radius: var(--radius-btn);
    display: flex; align-items: center; gap: 12px;
    font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.08em;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2); z-index: 9999;
  `;
  banner.innerHTML = `
    <span>新しいバージョンがあります</span>
    <button style="
      background: var(--bg); color: var(--text);
      border: none; border-radius: var(--radius-btn);
      padding: 5px 12px; cursor: pointer;
      font-family: 'DM Mono', monospace; font-size: 11px;
    ">更新する</button>
  `;
  banner.querySelector('button').addEventListener('click', () => {
    newSW.postMessage({ type: 'SKIP_WAITING' });
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  });
  document.body.appendChild(banner);
}
const SLOT_H = 60;
const COLORS = [
  // 既存9色
  '#1a1a18','#4a4a46','#888882','#b5a99a','#c0a882','#a8b89a','#9ab0c8','#b89ab0','#c89a9a',
  // 追加11色
  '#7ab87a','#5a9cb8','#c87a5a','#b8b84a','#8a5ab8','#c85a7a','#5ab8a8','#b85a5a','#5a7ab8','#c8a050','#7ab8b0',
];
const DOW = ['日','月','火','水','木','金','土'];

// ══════════════════════════════════════════
//  データ正規化
//  ※仕様変更なし。localStorageから読んだデータを、内部で安全に扱える形へ揃えるだけ。
// ══════════════════════════════════════════

function normalizeData(raw) {
  const rawEvents = Array.isArray(raw?.events) ? raw.events : [];
  const rawTasks = Array.isArray(raw?.tasks) ? raw.tasks : [];
  const rawTodos = Array.isArray(raw?.todos) ? raw.todos : [];

  const normalizedEvents = normalizeEvents(rawEvents);
  const normalizedTasks = normalizeTasks(rawTasks);
  const normalizedTodos = normalizeTodos(rawTodos);

  return {
    version: 4,
    events: normalizedEvents,
    tasks: normalizedTasks,
    todos: normalizedTodos,
    settings: normalizeSettings(raw?.settings),
    nextEvId: normalizeNextId(raw?.nextEvId, normalizedEvents),
    nextTId: normalizeNextId(raw?.nextTId, normalizedTasks),
    nextTodoId: normalizeNextId(raw?.nextTodoId, normalizedTodos),
  };
}

function normalizeSettings(rawSettings) {
  const defaults = {
    weekStart: 0,
    timeStart: 0,
    timeEnd: 24,
    theme: 'ios-light',
    accent: 'blue',
    morningNotif: false,
    morningNotifH: 8,
    morningNotifM: 0,
    selfMessageSnoozeDefault: {
      type: 'day',
      hours: 3
    },
    reminderSnoozeDefault: {
      type: 'day',
      hours: 3
    }
  };

  const src = isPlainObject(rawSettings) ? rawSettings : {};
  const normalized = {
    ...defaults,
    ...src,
  };

  normalized.weekStart = normalized.weekStart === 1 ? 1 : 0;

  if (!Number.isFinite(Number(normalized.timeStart))) {
    normalized.timeStart = defaults.timeStart;
  } else {
    normalized.timeStart = Number(normalized.timeStart);
  }

  if (!Number.isFinite(Number(normalized.timeEnd))) {
    normalized.timeEnd = defaults.timeEnd;
  } else {
    normalized.timeEnd = Number(normalized.timeEnd);
  }

  if (!['ios-light', 'ios-dark'].includes(normalized.theme)) {
    normalized.theme = defaults.theme;
  }

  if (!['blue', 'indigo', 'purple', 'pink', 'orange', 'green', 'teal', 'graphite'].includes(normalized.accent)) {
    normalized.accent = defaults.accent;
  }

  normalized.morningNotif = !!normalized.morningNotif;
  normalized.morningNotifH = normalizeHour(normalized.morningNotifH, defaults.morningNotifH);
  normalized.morningNotifM = normalizeMinute(normalized.morningNotifM, defaults.morningNotifM);

  normalized.selfMessageSnoozeDefault = normalizeSnoozeDefault(
    normalized.selfMessageSnoozeDefault,
    defaults.selfMessageSnoozeDefault
  );

  normalized.reminderSnoozeDefault = normalizeSnoozeDefault(
    normalized.reminderSnoozeDefault,
    defaults.reminderSnoozeDefault
  );

  return normalized;
}

function normalizeSnoozeDefault(rawDefault, fallback) {
  const src = isPlainObject(rawDefault) ? rawDefault : {};
  const type = ['day', 'week', 'hours', 'custom'].includes(src.type)
    ? src.type
    : fallback.type;

  const hours = Math.max(1, Number(src.hours) || fallback.hours);

  return {
    type,
    hours
  };
}

function normalizeEvents(rawEvents) {
  return rawEvents
    .filter(isPlainObject)
    .map(normalizeEvent)
    .filter(Boolean);
}

function normalizeEvent(ev) {
  const normalized = { ...ev };

  normalized.id = normalizeId(normalized.id);
  if (normalized.id == null) return null;

  normalized.title = typeof normalized.title === 'string'
    ? normalized.title
    : String(normalized.title || '');

  normalized.type = normalized.type === 'nonfocus' ? 'nonfocus' : 'focus';

  normalized.color = typeof normalized.color === 'string' && normalized.color
    ? normalized.color
    : COLORS[0];

  normalized.start = normalizeMinuteOfDay(normalized.start, 0);
  normalized.end = normalizeMinuteOfDay(normalized.end, normalized.start + 30);
  if (normalized.end <= normalized.start) {
    normalized.end = normalized.start + 30;
  }

  normalized.memo = typeof normalized.memo === 'string' ? normalized.memo : '';

  normalized.dateKey = typeof normalized.dateKey === 'string'
    ? normalized.dateKey
    : todayStr();

  normalized.repeat = normalizeRepeat(normalized.repeat);

  normalized.linkedGroupId =
    normalized.linkedGroupId == null || normalized.linkedGroupId === ''
      ? null
      : normalized.linkedGroupId;

  normalized.notification = normalizeNotification(normalized.notification);

  normalized.alertTiming = typeof normalized.alertTiming === 'string'
    ? normalized.alertTiming
    : 'none';

  normalized.alertH =
    normalized.alertH == null
      ? null
      : normalizeHour(normalized.alertH, 0);

  normalized.alertM =
    normalized.alertM == null
      ? null
      : normalizeMinute(normalized.alertM, 0);

  normalized.alertMsg = typeof normalized.alertMsg === 'string'
    ? normalized.alertMsg
    : '';

  normalized.notifOverrides = isPlainObject(normalized.notifOverrides)
    ? normalized.notifOverrides
    : {};

  normalized.dayMemos = isPlainObject(normalized.dayMemos)
    ? normalized.dayMemos
    : {};

  normalized.excludeDates = Array.isArray(normalized.excludeDates)
    ? normalized.excludeDates.filter(d => typeof d === 'string')
    : [];

  return normalized;
}

function normalizeRepeat(rawRepeat) {
  const src = isPlainObject(rawRepeat) ? rawRepeat : { type: 'none' };
  const type = ['none', 'weekly', 'nweekly', 'monthly_dow'].includes(src.type)
    ? src.type
    : 'none';

  const normalized = {
    ...src,
    type
  };

  if (type === 'none') {
    return { type: 'none' };
  }

  normalized.weekdays = Array.isArray(src.weekdays)
    ? src.weekdays.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];

  normalized.interval = Math.max(1, Number(src.interval) || 1);

  normalized.monthWeeks = Array.isArray(src.monthWeeks)
    ? src.monthWeeks.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 5)
    : [];

  if (src.monthWeek != null && normalized.monthWeeks.length === 0) {
    const mw = Number(src.monthWeek);
    if (Number.isInteger(mw) && mw >= 1 && mw <= 5) {
      normalized.monthWeeks = [mw];
    }
  }

  normalized.monthDow =
    src.monthDow == null
      ? 0
      : Math.min(6, Math.max(0, Number(src.monthDow) || 0));

  normalized.from = typeof src.from === 'string' ? src.from : '';
  normalized.to = typeof src.to === 'string' ? src.to : '';

  return normalized;
}

function normalizeNotification(rawNotification) {
  const src = isPlainObject(rawNotification) ? rawNotification : {};

  const normalized = {
    ...src,
    enabled: !!src.enabled,
    notifH: src.notifH == null ? null : normalizeHour(src.notifH, null),
    notifM: src.notifM == null ? null : normalizeMinute(src.notifM, 0),
    message: typeof src.message === 'string' ? src.message : '',
    statusByDate: normalizeSelfMessageStatusByDate(src.statusByDate)
  };

  return normalized;
}

function normalizeSelfMessageStatusByDate(rawStatusByDate) {
  if (!isPlainObject(rawStatusByDate)) return {};

  const result = {};

  Object.keys(rawStatusByDate).forEach(dk => {
    const src = isPlainObject(rawStatusByDate[dk])
      ? rawStatusByDate[dk]
      : {};

    result[dk] = {
      done: !!src.done,
      doneAt: src.doneAt || null,
      bannerDismissedAt: src.bannerDismissedAt || null,
      snoozedUntil: src.snoozedUntil || null,
    };
  });

  return result;
}

function normalizeTasks(rawTasks) {
  return rawTasks
    .filter(isPlainObject)
    .map(task => ({ ...task }))
    .filter(task => normalizeId(task.id) != null);
}

function normalizeTodos(rawTodos) {
  return rawTodos
    .filter(isPlainObject)
    .map(todo => ({ ...todo }))
    .filter(todo => normalizeId(todo.id) != null);
}

function normalizeNextId(rawNextId, items) {
  const loaded = Number(rawNextId);
  if (Number.isInteger(loaded) && loaded >= 1) {
    return loaded;
  }

  const maxId = items.reduce((max, item) => {
    const id = normalizeId(item.id);
    return id == null ? max : Math.max(max, id);
  }, 0);

  return maxId + 1;
}

function normalizeId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function normalizeHour(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 23) return fallback;
  return n;
}

function normalizeMinute(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 59) return fallback;
  return n;
}

function normalizeMinuteOfDay(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(24 * 60, Math.round(n)));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

let numDays = window.innerWidth < 480 ? 1 : 3;
let anchorDate = stripTime(new Date());

// ── データ読み込み ──
// ※保存キーは変更しない。読み込み直後に内部データだけ正規化する。
const appData = normalizeData({
  events: load('tos-events2'),
  tasks: load('tos-tasks'),
  todos: load('rounday-todos'),
  settings: load('rounday-settings'),
  nextEvId: load('tos-eid'),
  nextTId: load('tos-tid'),
  nextTodoId: load('rounday-next-tid'),
});

let events = appData.events;
let tasks = appData.tasks;
let todos = appData.todos;
let settings = appData.settings;
let nextEvId = appData.nextEvId;
let nextTId = appData.nextTId;
let nextTodoId = appData.nextTodoId;

// ── 設定 ──
function saveSettings() {
  persistSettings();
}


let modalMode = 'create';
let editId = null;
let pendingDay = null;
let selectedType = 'focus';
let selectedColor = COLORS[0];
let selectedWeekdays = [];
let selectedMonthWeeks = [];
let ctxTargetId = null;
let dragDay = null, dragStartY = 0, dragEl = null, isDragging = false;

// ── TODO機能 ──
let todoModalMode = 'create';
let editTodoId = null;
let pendingTodoOriginDateKey = null; // コンテキストメニューから開いた時の日付
let todoSchedulingMode = false;      // 「予定に追加」フロー中かどうか
let schedulingTodoId = null;         // 予定化しようとしているTODOのID
let pendingFromTodoId = null;        // 予定保存時にTODOを更新するためのID

// ── 通知モーダル（単体）用のターゲット管理 ──
let notifModalTargetId = null; // コンテキストメニューから開いた時のevId

// ── 自分へのメッセージ ──
let currentSelfMessageBannerItem = null;
let selfMessageSnoozeTimeouts = [];

// ── リマインダー再通知 ──
let reminderSnoozeTargetId = null;
let reminderNotificationTimeouts = [];

function stripTime(d){ const r=new Date(d); r.setHours(0,0,0,0); return r; }
function getWeekStart(d){
  const day = d.getDay();
  const diff = settings.weekStart === 1
    ? (day === 0 ? -6 : 1 - day)
    : -day;
  return addDays(stripTime(d), diff);
}
function addDays(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function dateKey(d){ 
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function minToTime(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; }
function save(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}

function load(k) {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

// ── 現在のアプリデータを1つの形にまとめる ──
// ※保存形式は変えない。Expo移行時に扱いやすくするための内部整理。
function getCurrentAppData() {
  return {
    events,
    tasks,
    todos,
    settings,
    nextEvId,
    nextTId,
    nextTodoId
  };
}

// ── 予定・リマインダー・TODO系の保存 ──
// ※今までの saveAll() と同じ保存対象。挙動を変えない。
function persistScheduleData(data = getCurrentAppData()) {
  save('tos-events2', data.events);
  save('tos-tasks', data.tasks);
  save('tos-eid', data.nextEvId);
  save('tos-tid', data.nextTId);
  save('rounday-todos', data.todos);
  save('rounday-next-tid', data.nextTodoId);
}

// ── 設定の保存 ──
// ※今までの saveSettings() と同じ保存対象。
function persistSettings(data = getCurrentAppData()) {
  save('rounday-settings', data.settings);
}

// ── アプリ全体の保存 ──
// ※今は既存処理からは直接使わない。Expo移行時の全体保存入口として用意する。
function persistAppData(data = getCurrentAppData()) {
  persistScheduleData(data);
  persistSettings(data);
}

// ── 既存コード互換用 ──
// ※既存の saveAll() 呼び出しは、今まで通り予定・リマインダー・TODO系だけ保存する。
function saveAll() {
  persistScheduleData();
}

// ── Web通知APIラッパー ──
// ※仕様変更なし。Notification API依存を1か所に寄せて、Expo移行時に差し替えやすくする。
function canUseWebNotification() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function requestWebNotificationPermission() {
  if (!canUseWebNotification()) {
    return Promise.resolve('unsupported');
  }
  return Notification.requestPermission();
}

function showWebNotification(title, options = {}) {
  if (!canUseWebNotification()) return null;
  return new Notification(title, options);
}

// ── 通知タイマー管理ラッパー ──
// ※仕様変更なし。setTimeout / clearTimeout を1か所に寄せて、Expo移行時に差し替えやすくする。
function scheduleNotificationTimer(callback, delay, timerList = null) {
  const timerId = setTimeout(callback, delay);

  if (Array.isArray(timerList)) {
    timerList.push(timerId);
  }

  return timerId;
}

function clearNotificationTimers(timerList) {
  if (!Array.isArray(timerList)) return [];

  timerList.forEach(timerId => clearTimeout(timerId));
  return [];
}

// ── 操作ロジック整理ヘルパー ──
// ※仕様変更なし。配列操作・ID発行・保存後処理の入口を作り、Expo移行時に移しやすくする。
function commitScheduleChange(options = {}) {
  const {
    render = true,
    notifications = false,
    todo = false,
    task = false,
    self = false,
    banner = false,
  } = options;

  saveAll();

  if (render) renderEvents();
  if (notifications) scheduleAllNotifications();
  if (todo) renderTodoList();
  if (task) renderTaskList();
  if (self) renderSelfMessagePanel();
  if (banner) updateSelfMessageBanner();
}

function issueEventId() {
  return nextEvId++;
}

function addEventData(eventData) {
  events.push(eventData);
  return eventData;
}

function replaceEventData(eventId, eventData) {
  const idx = events.findIndex(ev => ev.id === eventId);
  if (idx === -1) return null;
  events[idx] = eventData;
  return events[idx];
}

function updateEventData(eventId, updater) {
  const idx = events.findIndex(ev => ev.id === eventId);
  if (idx === -1) return null;

  const current = events[idx];
  const patch = typeof updater === 'function' ? updater(current) : updater;
  events[idx] = { ...current, ...patch };
  return events[idx];
}

function removeEventData(eventId) {
  const before = events.length;
  events = events.filter(ev => ev.id !== eventId);
  return events.length !== before;
}

function unlinkTodosFromEvent(eventId) {
  todos = todos.map(todo => {
    if (!Array.isArray(todo.scheduledEvents)) return todo;
    const filtered = todo.scheduledEvents.filter(id => id !== eventId);
    if (filtered.length === todo.scheduledEvents.length) return todo;
    return { ...todo, scheduledEvents: filtered };
  });
}

function issueTodoId() {
  return nextTodoId++;
}

function addTodoData(todoData) {
  todos.push(todoData);
  return todoData;
}

function replaceTodoData(todoId, todoData) {
  const idx = todos.findIndex(todo => todo.id === todoId);
  if (idx === -1) return null;
  todos[idx] = todoData;
  return todos[idx];
}

function updateTodoData(todoId, updater) {
  const idx = todos.findIndex(todo => todo.id === todoId);
  if (idx === -1) return null;

  const current = todos[idx];
  const patch = typeof updater === 'function' ? updater(current) : updater;
  todos[idx] = { ...current, ...patch };
  return todos[idx];
}

function removeTodoData(todoId) {
  const before = todos.length;
  todos = todos.filter(todo => todo.id !== todoId);
  return todos.length !== before;
}

function removeCompletedTodoData() {
  const before = todos.length;
  todos = todos.filter(todo => !todo.done);
  return todos.length !== before;
}

function cleanupExpiredCompletedTodos(cutoffDate) {
  const before = todos.length;
  todos = todos.filter(todo => !(todo.done && todo.doneAt && new Date(todo.doneAt) < cutoffDate));
  return todos.length !== before;
}

function issueReminderId() {
  return nextTId++;
}

function addReminderData(taskData) {
  tasks.push(taskData);
  return taskData;
}

function replaceReminderData(taskId, taskData) {
  const idx = tasks.findIndex(task => task.id === taskId);
  if (idx === -1) return null;
  tasks[idx] = taskData;
  return tasks[idx];
}

function updateReminderData(taskId, updater) {
  const idx = tasks.findIndex(task => task.id === taskId);
  if (idx === -1) return null;

  const current = tasks[idx];
  const patch = typeof updater === 'function' ? updater(current) : updater;
  tasks[idx] = { ...current, ...patch };
  return tasks[idx];
}

function removeReminderData(taskId) {
  const before = tasks.length;
  tasks = tasks.filter(task => task.id !== taskId);
  return tasks.length !== before;
}

function hexToRgb(h){ return {r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)}; }
function textColor(h){ const {r,g,b}=hexToRgb(h); return (r*299+g*587+b*114)/1000>128?'#111110':'#ffffff'; }
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function todayStr(){ return dateKey(new Date()); }
function isInvalidRepeatEvent(ev) {
  return (
    ev.repeat &&
    (ev.repeat.type === 'weekly' || ev.repeat.type === 'nweekly') &&
    (!Array.isArray(ev.repeat.weekdays) || ev.repeat.weekdays.length === 0)
  );
}
function getSelectableEvents() {
  return events.filter(ev => !isInvalidRepeatEvent(ev));
}

// ── 通知時刻セレクト初期化 ──
function populateNotifTimeSelects(hId, mId) {
  const selH = document.getElementById(hId);
  const selM = document.getElementById(mId);
  selH.innerHTML = '';
  selM.innerHTML = '';
  for(let h=0;h<24;h++){
    const o=document.createElement('option'); o.value=h;
    o.textContent=String(h).padStart(2,'0')+'時'; selH.appendChild(o);
  }
  for(let m=0;m<60;m+=5){
    const o=document.createElement('option'); o.value=m;
    o.textContent=String(m).padStart(2,'0')+'分'; selM.appendChild(o);
  }
}

function populateTimeSelects(){
  // 予定の開始時刻は0〜23時、終了時刻は24:00まで選べるようにする
  const sh=document.getElementById('fSh'); sh.innerHTML='';
  for(let h=0;h<24;h++){ const o=document.createElement('option'); o.value=h; o.textContent=String(h).padStart(2,'0')+'時'; sh.appendChild(o); }

  const eh=document.getElementById('fEh'); eh.innerHTML='';
  for(let h=0;h<=24;h++){ const o=document.createElement('option'); o.value=h; o.textContent=String(h).padStart(2,'0')+'時'; eh.appendChild(o); }

  ['fSm','fEm'].forEach(id=>{
    const sel=document.getElementById(id); sel.innerHTML='';
    for(let m=0;m<60;m+=5){ const o=document.createElement('option'); o.value=m; o.textContent=String(m).padStart(2,'0')+'分'; sel.appendChild(o); }
  });
  const th=document.getElementById('tHour'); th.innerHTML='';
  for(let h=0;h<24;h++){ const o=document.createElement('option'); o.value=h; o.textContent=String(h).padStart(2,'0')+'時'; th.appendChild(o); }
  const tm=document.getElementById('tMin'); tm.innerHTML='';
  for(let m=0;m<60;m+=5){ const o=document.createElement('option'); o.value=m; o.textContent=String(m).padStart(2,'0')+'分'; tm.appendChild(o); }
  // 自分へのメッセージ通知時刻
  populateNotifTimeSelects('fNotifH','fNotifM');
  // メッセージ一括通知モーダル
  populateNotifTimeSelects('bulkNotifH','bulkNotifM');
  // TODOモーダル用時刻セレクト
  const tdH = document.getElementById('tdHour'); tdH.innerHTML = '';
  for(let h=0;h<24;h++){ const o=document.createElement('option'); o.value=h; o.textContent=String(h).padStart(2,'0')+'時'; tdH.appendChild(o); }
  const tdM = document.getElementById('tdMin'); tdM.innerHTML = '';
  for(let m=0;m<60;m+=5){ const o=document.createElement('option'); o.value=m; o.textContent=String(m).padStart(2,'0')+'分'; tdM.appendChild(o); }
}

function syncEndMinuteFor24(){
  const endHour = document.getElementById('fEh');
  const endMinute = document.getElementById('fEm');
  if(!endHour || !endMinute) return;

  if(Number(endHour.value) === 24){
    endMinute.value = 0;
    endMinute.disabled = true;
  } else {
    endMinute.disabled = false;
  }
}
populateTimeSelects();
document.getElementById('fEh').addEventListener('change', syncEndMinuteFor24);
syncEndMinuteFor24();
// 通知タイミング用セレクト初期化
populateNotifTimeSelects('fAlertH','fAlertM');
// 自分へのメッセージ再通知カスタム時刻
populateNotifTimeSelects('selfSnoozeCustomH','selfSnoozeCustomM');
// リマインダー再通知カスタム時刻
populateNotifTimeSelects('reminderSnoozeCustomH','reminderSnoozeCustomM');
// 詳細セクション開閉
document.getElementById('detailToggleBtn').addEventListener('click', function() {
  const sec = document.getElementById('detailSection');
  const isOpen = sec.classList.toggle('open');
  this.textContent = isOpen ? '▼ 詳細設定' : '▶ 詳細設定';
});

// 通知タイミング選択
document.getElementById('fAlertTiming').addEventListener('change', function() {
  document.getElementById('alertCustomField').style.display = this.value === 'custom' ? 'flex' : 'none';
});

document.getElementById('fNotifEnabled').addEventListener('change', function() {
  document.getElementById('notifFields').style.display = this.checked ? 'flex' : 'none';
});

function populateLinkedGroup(excludeId) {
  const sel = document.getElementById('fLinkedGroup');
  sel.innerHTML = '<option value="">なし（新規グループ）</option>';

  const seen = new Set();

  getSelectableEvents().forEach(ev => {
    if (ev.id === excludeId) return;

    const gid = ev.linkedGroupId || ev.id;
    const key = gid + '::' + ev.title;

    if (!seen.has(key)) {
      seen.add(key);

      const o = document.createElement('option');
      o.value = gid;
      o.textContent = ev.title;
      sel.appendChild(o);
    }
  });
}

// color swatches
(()=>{
  const row=document.getElementById('colorRow');
  COLORS.forEach(c=>{
    const sw=document.createElement('div'); sw.className='color-swatch'+(c===COLORS[0]?' selected':'');
    sw.style.background=c;
    sw.addEventListener('click',()=>{ selectedColor=c; row.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('selected')); sw.classList.add('selected'); });
    row.appendChild(sw);
  });
})();

const WD_LABELS=['日','月','火','水','木','金','土'];
(()=>{
  const row=document.getElementById('weekdayRow');
  WD_LABELS.forEach((l,i)=>{
    const btn=document.createElement('button'); btn.className='wd-btn'; btn.textContent=l; btn.dataset.wd=i;
    btn.addEventListener('click',()=>{
      btn.classList.toggle('active');
      if(btn.classList.contains('active')){ if(!selectedWeekdays.includes(i)) selectedWeekdays.push(i); }
      else { selectedWeekdays=selectedWeekdays.filter(w=>w!==i); }
    });
    row.appendChild(btn);
  });
})();
document.querySelectorAll('[data-mw]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const v=Number(btn.dataset.mw);
    btn.classList.toggle('active');
    if(btn.classList.contains('active')){ if(!selectedMonthWeeks.includes(v)) selectedMonthWeeks.push(v); }
    else { selectedMonthWeeks=selectedMonthWeeks.filter(w=>w!==v); }
  });
});

document.getElementById('btnFocus').addEventListener('click',()=>setType('focus'));
document.getElementById('btnNonfocus').addEventListener('click',()=>setType('nonfocus'));
function setType(t){
  selectedType=t;
  document.getElementById('btnFocus').classList.toggle('active',t==='focus');
  document.getElementById('btnNonfocus').classList.toggle('active',t==='nonfocus');
  document.getElementById('memoField').style.display=t==='focus'?'flex':'none';
}

document.getElementById('fRepeat').addEventListener('change',updateRepeatSubs);
function updateRepeatSubs(){
  const v=document.getElementById('fRepeat').value;
  document.getElementById('subWeekdays').classList.toggle('visible', v==='weekly'||v==='nweekly');
  document.getElementById('subNWeekly').classList.toggle('visible', v==='nweekly');
  document.getElementById('subMonthlyDow').classList.toggle('visible', v==='monthly_dow');
  document.getElementById('subRepeatRange').classList.toggle('visible', v!=='none');
}

// ── グリッド構築 ──
function buildGrid(){ buildTimeCol(); buildToolbar(); buildDays(); renderEvents(); updateNowLine(); }

function buildTimeCol(){
  const col=document.getElementById('time-col'); col.innerHTML='';
  const hours = settings.timeEnd - settings.timeStart;
  for(let i=0;i<=hours;i++){
    const h = settings.timeStart + i;
    if(h > 24) break;
    const lbl=document.createElement('div');
    lbl.className='time-label'+(h===0?' hour-0':'');
    lbl.style.top=(i*SLOT_H)+'px';
    lbl.textContent=h===24?'24:00':String(h).padStart(2,'0')+':00';
    col.appendChild(lbl);
  }
  col.style.height=(hours*SLOT_H)+'px';
}

function buildToolbar(){
  const wrap=document.getElementById('toolbarDays'); wrap.innerHTML='';
  for(let i=0;i<numDays;i++){
    const d=addDays(anchorDate,i);
    const cell=document.createElement('div');
    cell.className='toolbar-day'+(dateKey(d)===todayStr()?' is-today':'');
    cell.innerHTML=`<span class="toolbar-dow">${DOW[d.getDay()]}</span><span class="toolbar-date">${d.getDate()}</span>`;
    wrap.appendChild(cell);
  }
  const start=anchorDate;
  const end=addDays(anchorDate,numDays-1);
  const fmt=d=>`${d.getMonth()+1}/${d.getDate()}`;
  const label=numDays===1 ? fmt(start) : `${fmt(start)}〜${fmt(end)}`;
  document.getElementById('calOpenBtn').textContent=label;
}

function buildDays(){
  const wrap=document.getElementById('days-wrap'); wrap.innerHTML='';
  const hours = settings.timeEnd - settings.timeStart;
  for(let i=0;i<numDays;i++){
    const d=addDays(anchorDate,i);
    const col=document.createElement('div'); col.className='day-col';
    col.dataset.dayIndex=i; col.dataset.dateKey=dateKey(d);
    col.style.height=(hours*SLOT_H)+'px';
    if(dateKey(d)===todayStr()) col.style.background='rgba(0,0,0,0.013)';
    for(let hi=0;hi<hours;hi++){
      const line=document.createElement('div'); line.className='hour-line'; line.style.top=(hi*SLOT_H)+'px'; col.appendChild(line);
      if(hi<hours-1){ const half=document.createElement('div'); half.className='hour-line half'; half.style.top=(hi*SLOT_H+30)+'px'; col.appendChild(half); }
    }
    col.addEventListener('mousedown', onDayMousedown);
    col.addEventListener('touchstart', onDayTouchstart, {passive:false});
    wrap.appendChild(col);
    const style = document.getElementById('dynEvStyle') || (() => {
    const s = document.createElement('style');
    s.id = 'dynEvStyle';
    document.head.appendChild(s);
    return s;
})();
style.textContent = numDays >= 5
  ? `.ev-focus { left: 4px; right: 2px; } .ev-nonfocus-bar { display: none; } .ev-nonfocus-label { display: none; }`
  : `.ev-focus { left: 18px; right: 6px; }`;
  }
}

let nowLineEl=null;
function updateNowLine(){
  if(nowLineEl){ nowLineEl.remove(); nowLineEl=null; }
  const now=new Date(); const col=document.querySelector(`.day-col[data-date-key="${dateKey(now)}"]`);
  if(!col) return;
  const top=(((now.getHours()*60+now.getMinutes()) - settings.timeStart*60)/60)*SLOT_H;
  nowLineEl=document.createElement('div'); nowLineEl.className='now-line'; nowLineEl.style.top=top+'px';
  col.appendChild(nowLineEl);
}
setInterval(updateNowLine,60000);

// ── イベント描画 ──
function expandRepeatingEvent(ev){
  if(!ev.repeat || ev.repeat.type==='none') return [ev];
  const results=[];
  const from=new Date(ev.repeat.from+'T00:00:00');
  const to=new Date(ev.repeat.to+'T00:00:00');
  let cur=new Date(from);
  while(cur<=to){
    let match=false;
    const dow=cur.getDay();
    const rt=ev.repeat.type;
    if(rt==='weekly'){ match=ev.repeat.weekdays.includes(dow); }
    else if(rt==='nweekly'){
      const diffDays=Math.round((cur-from)/(86400000));
      const weekNum=Math.floor(diffDays/7);
      match=(weekNum%ev.repeat.interval===0) && ev.repeat.weekdays.includes(dow);
    } else if(rt==='monthly_dow'){
      if(dow===ev.repeat.monthDow){
        const weekOfMonth=Math.ceil(cur.getDate()/7);
const weeks=ev.repeat.monthWeeks?.length>0
  ? ev.repeat.monthWeeks
  : (ev.repeat.monthWeek ? [ev.repeat.monthWeek] : []);
match=weeks.includes(weekOfMonth);
      }
    }
    if(match){
  const excluded = ev.excludeDates || [];
  if(!excluded.includes(dateKey(cur))){
     results.push({...ev, dateKey:dateKey(cur), _virtual:true, _baseId:ev.id});
     }
    }
    cur=addDays(cur,1);
  }
  return results;
}

function allVisibleEvents(){
  const result=[];
  events.forEach(ev=>{
    if(ev.repeat && ev.repeat.type!=='none'){ result.push(...expandRepeatingEvent(ev)); }
    else { result.push(ev); }
  });
  return result;
}

function renderEvents(){
  document.querySelectorAll('.ev-focus,.ev-nonfocus-wrap,.ev-nonfocus-bar,.ev-nonfocus-label').forEach(e=>e.remove());
  allVisibleEvents().forEach(ev=>{
    const col=document.querySelector(`.day-col[data-date-key="${ev.dateKey}"]`);
    if(!col) return;
    if(ev.type==='focus') renderFocusEv(ev,col);
    else renderNonfocusEv(ev,col);
  });
}

function renderFocusEv(ev,col){
  const topPx=((ev.start - settings.timeStart*60)/60)*SLOT_H;
  const hPx=Math.max(((ev.end-ev.start)/60)*SLOT_H,18);
  const div=document.createElement('div'); div.className='ev-focus'; div.dataset.evId=ev._baseId||ev.id; div.setAttribute('data-ev-id', ev._baseId||ev.id);
  div.style.top=topPx+'px'; div.style.height=hPx+'px'; div.style.background=ev.color; div.style.color=textColor(ev.color);
  const inner=document.createElement('div'); inner.className='ev-focus-inner';
  inner.innerHTML=`<div class="ev-title">${esc(ev.title)}</div>`;
  if(hPx>28 && numDays<=4) inner.innerHTML+=`<div class="ev-time-label">${minToTime(ev.start)}〜${minToTime(ev.end)}</div>`;
  const dayMemo = ev.dayMemos?.[ev.dateKey];
if(dayMemo && hPx>44) inner.innerHTML+=`<div class="ev-memo">🗒 ${esc(dayMemo)}</div>`;
else if(ev.memo && hPx>44) inner.innerHTML+=`<div class="ev-memo">📌 ${esc(ev.memo)}</div>`;
  div.appendChild(inner);
  div.addEventListener('click',e=>{ e.stopPropagation(); openCtx(ev._baseId||ev.id,e.clientX,e.clientY,ev.dateKey); });
div.addEventListener('touchend',e=>{ e.stopPropagation(); e.preventDefault(); const t=e.changedTouches[0]; openCtx(ev._baseId||ev.id,t.clientX,t.clientY,ev.dateKey); },{passive:false});
  col.appendChild(div);
}

function renderNonfocusEv(ev,col){
  const topPx=((ev.start - settings.timeStart*60)/60)*SLOT_H;
  const hPx=Math.max(((ev.end-ev.start)/60)*SLOT_H,16);
  const evId=ev._baseId||ev.id;
  const bar=document.createElement('div'); bar.className='ev-nonfocus-bar'; bar.dataset.evId=evId;
  bar.style.top=topPx+'px'; bar.style.height=hPx+'px'; bar.style.background=ev.color;
  bar.addEventListener('click',e=>{ e.stopPropagation(); openCtx(ev._baseId||ev.id, e.clientX, e.clientY, ev.dateKey); });
  bar.addEventListener('touchend',e=>{ e.stopPropagation(); e.preventDefault(); const t=e.changedTouches[0]; openCtx(ev._baseId||ev.id, t.clientX, t.clientY, ev.dateKey); },{passive:false});
  const lbl=document.createElement('div'); lbl.className='ev-nonfocus-label'; lbl.dataset.evId=evId;
  lbl.style.top=topPx+'px'; lbl.style.height=hPx+'px';
  const txt=document.createElement('div'); txt.className='ev-nonfocus-text'; txt.textContent=ev.title;
  lbl.appendChild(txt);
  lbl.addEventListener('click',e=>{ e.stopPropagation(); openCtx(ev._baseId||ev.id, e.clientX, e.clientY, ev.dateKey); });
  lbl.addEventListener('touchend',e=>{ e.stopPropagation(); e.preventDefault(); const t=e.changedTouches[0]; openCtx(ev._baseId||ev.id, t.clientX, t.clientY, ev.dateKey); },{passive:false});
  col.appendChild(bar); col.appendChild(lbl);
}

// ── ドラッグ ──
function yToMin(y){ return Math.round(((y/SLOT_H)*60 + settings.timeStart*60)/5)*5; }
function onDayMousedown(e){
  if(e.button !== 0) return; // 右クリック除外
  if(e.target.closest('.ev-focus,.ev-nonfocus-bar,.ev-nonfocus-label,.hour-line')) return;
  const col=e.currentTarget;
  startDrag(col, e.clientY-col.getBoundingClientRect().top);
  document.addEventListener('mousemove',onDocMousemove);
  document.addEventListener('mouseup',onDocMouseup);
}
let _ptCol=null, _ptY0=0, _ptTimer=null;
function onDayTouchstart(e){
  if(e.target.closest('.ev-focus,.ev-nonfocus-bar,.ev-nonfocus-label')) return;
  _ptCol=e.currentTarget; _ptY0=e.touches[0].clientY;
  _ptTimer=setTimeout(()=>{
    _ptTimer=null;
    document.removeEventListener('touchmove',_ptMove);
    startDrag(_ptCol, _ptY0-_ptCol.getBoundingClientRect().top);
    document.addEventListener('touchmove',onDocTouchmove,{passive:false});
    document.addEventListener('touchend',onDocTouchend);
  },350);
  document.addEventListener('touchmove',_ptMove,{passive:true});
  document.addEventListener('touchend',_ptEnd,{once:true});
}
function _ptMove(e){
  if(!_ptTimer) return;
  if(Math.abs(e.touches[0].clientY-_ptY0)>10){
    clearTimeout(_ptTimer); _ptTimer=null;
    document.removeEventListener('touchmove',_ptMove);
  }
}
function _ptEnd(){
  if(_ptTimer){ clearTimeout(_ptTimer); _ptTimer=null; }
  document.removeEventListener('touchmove',_ptMove);
}
function startDrag(col,y){
  dragDay=col; dragStartY=Math.max(0,y); isDragging=true;
  dragEl=document.createElement('div'); dragEl.className='drag-sel';
  dragEl.style.top=dragStartY+'px'; dragEl.style.height='2px';
  col.appendChild(dragEl);
}
function moveDrag(cy){
  if(!isDragging||!dragDay) return;
  const y=Math.max(0,cy-dragDay.getBoundingClientRect().top);
  dragEl.style.top=Math.min(dragStartY,y)+'px'; dragEl.style.height=Math.max(2,Math.abs(y-dragStartY))+'px';
}
function endDrag(cy){
  if(!isDragging||!dragDay) return;
  const endY=Math.max(0,cy-dragDay.getBoundingClientRect().top);
  let sMin=yToMin(Math.min(dragStartY,endY)); let eMin=yToMin(Math.max(dragStartY,endY));
  if(eMin<=sMin) eMin=sMin+30;
  dragEl.remove(); dragEl=null; isDragging=false;
  const dKey = dragDay.dataset.dateKey; dragDay = null;
  if(todoSchedulingMode && schedulingTodoId) {
    const todoId = schedulingTodoId;
    cancelTodoScheduling();
    openCreateModalFromTodo(dKey, sMin, eMin, todoId);
  } else {
    openCreateModal(dKey, sMin, eMin);
  }
}

function onDocMousemove(e){ moveDrag(e.clientY); }
function onDocMouseup(e){ endDrag(e.clientY); document.removeEventListener('mousemove',onDocMousemove); document.removeEventListener('mouseup',onDocMouseup); }
function onDocTouchmove(e){ e.preventDefault(); moveDrag(e.touches[0].clientY); }
function onDocTouchend(e){ endDrag(e.changedTouches[0].clientY); document.removeEventListener('touchmove',onDocTouchmove); document.removeEventListener('touchend',onDocTouchend); }

// ── 予定モーダル ──
function openCreateModal(dKey,sMin,eMin){
  modalMode='create'; editId=null; pendingDay=dKey;
  document.getElementById('modalTitle').textContent='NEW EVENT';
  document.getElementById('fTitle').value='';
  document.getElementById('fMemo').value='';
  document.getElementById('fRepeat').value='none';
  selectedWeekdays=[];
  selectedMonthWeeks=[];
document.querySelectorAll('[data-mw]').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.wd-btn').forEach(b=>b.classList.remove('active'));
  updateRepeatSubs();
  // 詳細セクションを閉じる
  const detailSec = document.getElementById('detailSection');
  detailSec.classList.remove('open');
  document.getElementById('detailToggleBtn').textContent = '▶ 詳細設定';

  // 通知タイミングリセット
  document.getElementById('fAlertTiming').value = 'none';
  document.getElementById('alertCustomField').style.display = 'none';
  document.getElementById('fAlertMsg').value = '';
  document.getElementById('fNotifEnabled').checked=false;
  document.getElementById('notifFields').style.display='none';
  // 通知時刻のデフォルト：予定終了時刻付近
  const defH=Math.min(23,Math.floor(eMin/60));
  document.getElementById('fNotifH').value=defH;
  document.getElementById('fNotifM').value=Math.round((eMin%60)/5)*5;
  document.getElementById('fNotifMsg').value='';
  populateLinkedGroup(null);
  document.getElementById('fLinkedGroup').value='';
  setType('focus'); setColor(COLORS[0]);
  setSelTime('fSh','fSm',sMin); setSelTime('fEh','fEm',eMin);
  document.getElementById('fRepeatFrom').value=dKey;
  document.getElementById('fRepeatTo').value=dKey;

  document.getElementById('overlay').classList.add('open');
  setTimeout(()=>document.getElementById('fTitle').focus(),50);
}

function openEditModal(id){
  const ev=events.find(e=>e.id===id); if(!ev) return;
  modalMode='edit'; editId=id; pendingDay=ev.dateKey;
  document.getElementById('modalTitle').textContent='EDIT EVENT';
  document.getElementById('fTitle').value=ev.title;
  document.getElementById('fMemo').value=ev.memo||'';
  setType(ev.type); setColor(ev.color);
  setSelTime('fSh','fSm',ev.start); setSelTime('fEh','fEm',ev.end);
  const rep=ev.repeat||{type:'none'};
  document.getElementById('fRepeat').value=rep.type;
  selectedWeekdays=rep.weekdays?[...rep.weekdays]:[];
  document.querySelectorAll('.wd-btn').forEach(b=>{ b.classList.toggle('active', selectedWeekdays.includes(Number(b.dataset.wd))); });
  if(rep.interval) document.getElementById('fNWeek').value=rep.interval;
  selectedMonthWeeks=rep.monthWeeks?[...rep.monthWeeks]:(rep.monthWeek?[rep.monthWeek]:[]);
document.querySelectorAll('[data-mw]').forEach(b=>{
  b.classList.toggle('active', selectedMonthWeeks.includes(Number(b.dataset.mw)));
});
  if(rep.monthDow!==undefined) document.getElementById('fMonthDow').value=rep.monthDow;
  if(rep.from) document.getElementById('fRepeatFrom').value=rep.from;
  if(rep.to) document.getElementById('fRepeatTo').value=rep.to;
  updateRepeatSubs();
  const notif=ev.notification||{};
  document.getElementById('fNotifEnabled').checked=!!notif.enabled;
  document.getElementById('notifFields').style.display=notif.enabled?'flex':'none';
  // 絶対時刻をセット（旧データのoffsetMin互換）
  if(notif.notifH!=null){
    document.getElementById('fNotifH').value=notif.notifH;
    document.getElementById('fNotifM').value=notif.notifM||0;
  } else {
    // 旧データ(offsetMin)から変換
    const absMin=(ev.end||0)+(notif.offsetMin||60);
    document.getElementById('fNotifH').value=Math.min(23,Math.floor(absMin/60));
    document.getElementById('fNotifM').value=Math.round((absMin%60)/5)*5;
  }
  document.getElementById('fNotifMsg').value=notif.message||'';
  populateLinkedGroup(ev.id);
  document.getElementById('fLinkedGroup').value=ev.linkedGroupId||'';
  // 詳細セクションを開いておく（編集時は全項目見えた方が便利）
  const detailSec = document.getElementById('detailSection');
  detailSec.classList.add('open');
  document.getElementById('detailToggleBtn').textContent = '▼ 詳細設定';
// 通知タイミング復元
  const at = ev.alertTiming || 'none';
document.getElementById('fAlertTiming').value = at;
document.getElementById('alertCustomField').style.display = at === 'custom' ? 'flex' : 'none';
if(at === 'custom'){
  document.getElementById('fAlertH').value = ev.alertH || 0;
  document.getElementById('fAlertM').value = ev.alertM || 0;
}
document.getElementById('fAlertMsg').value = ev.alertMsg || '';
  document.getElementById('overlay').classList.add('open');
  
}

function setColor(c){
  selectedColor=c;
  document.querySelectorAll('#colorRow .color-swatch').forEach(sw=>{
    const bg=sw.style.background; sw.classList.toggle('selected', bg===c||bg===hexToRgbStr(c));
  });
}
function hexToRgbStr(h){ const {r,g,b}=hexToRgb(h); return `rgb(${r}, ${g}, ${b})`; }
function setSelTime(selH,selM,min){
  document.getElementById(selH).value=Math.floor(min/60);
  document.getElementById(selM).value=Math.round((min%60)/5)*5;
  if(selH === 'fEh') syncEndMinuteFor24();
}

function closeModal(){ document.getElementById('overlay').classList.remove('open'); }
document.getElementById('modalClose').addEventListener('click',closeModal);
document.getElementById('modalCancel').addEventListener('click',closeModal);
document.getElementById('overlay').addEventListener('click',e=>{ if(e.target.id==='overlay') closeModal(); });

document.getElementById('modalSave').addEventListener('click',()=>{
  const title=document.getElementById('fTitle').value.trim(); if(!title){ document.getElementById('fTitle').focus(); return; }
  const sMin=Number(document.getElementById('fSh').value)*60+Number(document.getElementById('fSm').value);
  let eMin=Number(document.getElementById('fEh').value)*60+Number(document.getElementById('fEm').value);
  if(eMin<=sMin) eMin=sMin+30;
  const repType = document.getElementById('fRepeat').value;

// weekly / nweekly で曜日未選択のまま保存された場合は、予定日の曜日を自動で入れる
  const fallbackWeekdays = [...selectedWeekdays];

  if ((repType === 'weekly' || repType === 'nweekly') && fallbackWeekdays.length === 0) {
    const baseDate = new Date(pendingDay + 'T00:00:00');
    fallbackWeekdays.push(baseDate.getDay());
  }

  const repeat = repType === 'none' ? { type: 'none' } : {
    type: repType,
    weekdays: fallbackWeekdays,
    interval: Number(document.getElementById('fNWeek').value),
    monthWeeks: [...selectedMonthWeeks],
    monthDow: Number(document.getElementById('fMonthDow').value),
    from: document.getElementById('fRepeatFrom').value,
    to: document.getElementById('fRepeatTo').value,
  };
  const notifEnabled = document.getElementById('fNotifEnabled').checked;
  const existingEvForNotif = modalMode === 'edit' ? events.find(e => e.id === editId) : null;

  const oldNotifSignature = existingEvForNotif
    ? JSON.stringify({
      enabled: !!existingEvForNotif.notification?.enabled,
      notifH: existingEvForNotif.notification?.notifH ?? null,
      notifM: existingEvForNotif.notification?.notifM ?? null,
      message: existingEvForNotif.notification?.message || ''
    })
  : null;

  const newNotifSignature = JSON.stringify({
   enabled: !!notifEnabled,
    notifH: notifEnabled ? Number(document.getElementById('fNotifH').value) : null,
    notifM: notifEnabled ? Number(document.getElementById('fNotifM').value) : null,
    message: document.getElementById('fNotifMsg').value.trim()
  });

  const selfMessageNotificationChanged =
    modalMode === 'edit' &&
    existingEvForNotif &&
    oldNotifSignature !== newNotifSignature;

  const existingSelfMessageStatusByDate = selfMessageNotificationChanged
    ? {}
    : (existingEvForNotif?.notification?.statusByDate || {});

  const obj={
    title, type:selectedType, color:selectedColor, start:sMin, end:eMin,
    memo:document.getElementById('fMemo').value.trim(),
    repeat, dateKey:pendingDay,
    linkedGroupId:document.getElementById('fLinkedGroup').value||null,
    notification:{
      enabled:notifEnabled,
      notifH:notifEnabled?Number(document.getElementById('fNotifH').value):null,
      notifM:notifEnabled?Number(document.getElementById('fNotifM').value):null,
      message:document.getElementById('fNotifMsg').value.trim(),
      statusByDate: existingSelfMessageStatusByDate,
    },
    
    alertTiming: document.getElementById('fAlertTiming').value,
    alertH: document.getElementById('fAlertTiming').value === 'custom' ? Number(document.getElementById('fAlertH').value) : null,
    alertM: document.getElementById('fAlertTiming').value === 'custom' ? Number(document.getElementById('fAlertM').value) : null,
    alertMsg: document.getElementById('fAlertMsg').value.trim(),
    notifOverrides:modalMode==='edit'?(events.find(e=>e.id===editId)?.notifOverrides||{}):{},
  };

  
  // fromTodoIdを付与（TODOから予定化した場合）
  if(pendingFromTodoId !== null) obj.fromTodoId = pendingFromTodoId;
  if(modalMode==='create'){
    obj.id = issueEventId();
    addEventData(obj);
  } else {
    obj.id = editId;
    replaceEventData(editId, obj);
  }

  if(pendingFromTodoId !== null) {
    updateTodoData(pendingFromTodoId, todo => ({
      scheduledEvents: [...(Array.isArray(todo.scheduledEvents)
        ? todo.scheduledEvents
        : (todo.scheduledEventId != null ? [todo.scheduledEventId] : [])),
        obj.id]
    }));
    pendingFromTodoId = null;
    closeModal();
    commitScheduleChange({ notifications: true, todo: true, self: true, banner: true });
  } else {
    closeModal();
    commitScheduleChange({ notifications: true, self: true, banner: true });
  }
});

// ── 通知単体編集モーダル（コンテキストから）──
// overlay を再利用せず、予定編集モーダルをそのまま開く（通知セクションにスクロール）
function openNotifEditFromCtx(evId){
  openEditModal(evId);
  // 少し待ってから通知セクションへスクロール
  setTimeout(()=>{
    const el=document.getElementById('fNotifEnabled');
    if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
  }, 120);
}

// ── コンテキストメニュー ──
function openCtx(id, x, y, dk){
  ctxTargetId = id;
  const ev = events.find(e => e.id === id);
  if(!ev) return;

  // 詳細パネルを開く
  const visEv = allVisibleEvents().find(e => (e._baseId||e.id) === id && e.dateKey === dk) || ev;
  const dayMemo = ev.dayMemos?.[dk] || '';
  const baseMemo = ev.memo || '';
  const memo = [dayMemo, baseMemo].filter(Boolean).join('\n\n');

  document.getElementById('evDetailTitle').textContent = ev.title;
  document.getElementById('evDetailTime').textContent = minToTime(ev.start) + '〜' + minToTime(ev.end);

  const memoEl = document.getElementById('evDetailMemo');
  if(memo){
    memoEl.textContent = memo;
    memoEl.style.display = '';
  } else {
    memoEl.style.display = 'none';
  }

  // TODOボタンの表示制御
  const evEl = document.querySelector(`[data-ev-id="${id}"]`);
  const evDk = dk || evEl?.closest('.day-col')?.dataset.dateKey;
  const todoBtn = document.getElementById('evDetailAddTodo');
  if(evDk){
    const startH = String(Math.floor(ev.start/60)).padStart(2,'0');
    const startM = String(ev.start%60).padStart(2,'0');
    const evStartDt = new Date(`${evDk}T${startH}:${startM}:00`);
    todoBtn.style.display = evStartDt <= new Date() ? '' : 'none';
  } else {
    todoBtn.style.display = 'none';
  }

  document.getElementById('evDetailPanel').classList.add('open');
}

function closeCtx(){ document.getElementById('ctxMenu').classList.remove('open'); }

// 詳細パネルのボタン
document.getElementById('evDetailClose').addEventListener('click', () => {
  document.getElementById('evDetailPanel').classList.remove('open');
});
document.getElementById('evDetailPanel').addEventListener('click', e => {
  if(e.target.id === 'evDetailPanel')
    document.getElementById('evDetailPanel').classList.remove('open');
});
document.getElementById('evDetailEdit').addEventListener('click', () => {
  document.getElementById('evDetailPanel').classList.remove('open');
  openEditModal(ctxTargetId);
});
document.getElementById('evDetailDayMemo').addEventListener('click', () => {
  document.getElementById('evDetailPanel').classList.remove('open');
  const evEl = document.querySelector(`[data-ev-id="${ctxTargetId}"]`);
  const dk = evEl?.closest('.day-col')?.dataset.dateKey;
  dayMemoTargetId = ctxTargetId;
  dayMemoTargetDate = dk;
  const ev = events.find(e => e.id === ctxTargetId);
  document.getElementById('dayMemoTitle').textContent = `この日だけメモ（${dk}）`;
  document.getElementById('fDayMemo').value = ev?.dayMemos?.[dk] || '';
  document.getElementById('dayMemoOverlay').classList.add('open');
});
document.getElementById('evDetailNextOcc').addEventListener('click', () => {
  document.getElementById('evDetailPanel').classList.remove('open');
  const ev = events.find(e => e.id === ctxTargetId); if(!ev) return;
  const gid = ev.linkedGroupId || ev.id;
  const group = allVisibleEvents().filter(e => (e.linkedGroupId||e._baseId||e.id)===gid||(e.linkedGroupId||e.id)===gid);
  const today = todayStr();
  const future = group.filter(e => e.dateKey > today).sort((a,b) => a.dateKey.localeCompare(b.dateKey)||a.start-b.start);
  if(future.length === 0){ alert('この予定の次回はありません。'); }
  else { const n = future[0]; alert(`次回：${n.dateKey}（${DOW[new Date(n.dateKey+'T00:00:00').getDay()]}）${minToTime(n.start)}〜${minToTime(n.end)}`); }
});
document.getElementById('evDetailAddTask').addEventListener('click', () => {
  document.getElementById('evDetailPanel').classList.remove('open');
  openTaskModal(null, ctxTargetId);
});
document.getElementById('evDetailAddTodo').addEventListener('click', () => {
  document.getElementById('evDetailPanel').classList.remove('open');
  const evEl = document.querySelector(`[data-ev-id="${ctxTargetId}"]`);
  const dk = evEl?.closest('.day-col')?.dataset.dateKey;
  openTodoModal(null, ctxTargetId, dk);
});
document.getElementById('evDetailDelete').addEventListener('click', () => {
  document.getElementById('evDetailPanel').classList.remove('open');
  const ev = events.find(e => e.id === ctxTargetId);
  if(!ev || !ev.repeat || ev.repeat.type === 'none'){
    unlinkTodosFromEvent(ctxTargetId);
    removeEventData(ctxTargetId);
    commitScheduleChange();
    return;
  }
  document.getElementById('deleteRepeatOverlay').classList.add('open');
});

document.getElementById('ctxEdit').addEventListener('click',()=>{ closeCtx(); openEditModal(ctxTargetId); });

document.getElementById('ctxNotifEdit').addEventListener('click',()=>{ closeCtx(); openNotifEditFromCtx(ctxTargetId); });

document.getElementById('ctxNextOccurrence').addEventListener('click',()=>{
  closeCtx();
  const ev=events.find(e=>e.id===ctxTargetId); if(!ev) return;
  const gid=ev.linkedGroupId||ev.id;
  const group=allVisibleEvents().filter(e=>(e.linkedGroupId||e._baseId||e.id)===gid||(e.linkedGroupId||e.id)===gid);
  const today=todayStr();
  const future=group.filter(e=>e.dateKey>today).sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||a.start-b.start);
  if(future.length===0){ alert('この予定の次回はありません。'); }
  else { const n=future[0]; alert(`次回：${n.dateKey}（${DOW[new Date(n.dateKey+'T00:00:00').getDay()]}）${minToTime(n.start)}〜${minToTime(n.end)}`); }
});
let dayMemoTargetId = null;
let dayMemoTargetDate = null;

document.getElementById('ctxDayMemo').addEventListener('click',()=>{
  closeCtx();
  const evId = ctxTargetId;
  // クリックされた予定の日付を特定
  const visEv = allVisibleEvents().find(e=>(e._baseId||e.id)===evId && document.querySelector(`.day-col[data-date-key="${e.dateKey}"] [data-ev-id="${evId}"]`));
  // 表示中のイベント要素から日付を取得
  const evEl = document.querySelector(`[data-ev-id="${evId}"]`);
  const dk = evEl?.closest('.day-col')?.dataset.dateKey;
  if(!dk) return;
  dayMemoTargetId = evId;
  dayMemoTargetDate = dk;
  const ev = events.find(e=>e.id===evId);
  const existing = ev?.dayMemos?.[dk] || '';
  document.getElementById('dayMemoTitle').textContent=`この日だけメモ（${dk}）`;
  document.getElementById('fDayMemo').value = existing;
  document.getElementById('dayMemoOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('fDayMemo').focus(),50);
});

function closeDayMemoModal(){ document.getElementById('dayMemoOverlay').classList.remove('open'); }
document.getElementById('dayMemoClose').addEventListener('click', closeDayMemoModal);
document.getElementById('dayMemoCancel').addEventListener('click', closeDayMemoModal);
document.getElementById('dayMemoOverlay').addEventListener('click',e=>{ if(e.target.id==='dayMemoOverlay') closeDayMemoModal(); });

document.getElementById('dayMemoSave').addEventListener('click',()=>{
  const text = document.getElementById('fDayMemo').value.trim();
  const updated = updateEventData(dayMemoTargetId, ev => ({
    dayMemos: {
      ...(ev.dayMemos || {}),
      [dayMemoTargetDate]: text
    }
  }));
  if(!updated) return;
  closeDayMemoModal();
  commitScheduleChange();
});

document.getElementById('dayMemoClear').addEventListener('click',()=>{
  const ev = events.find(e => e.id === dayMemoTargetId);
  if(ev && ev.dayMemos){
    const nextDayMemos = { ...ev.dayMemos };
    delete nextDayMemos[dayMemoTargetDate];
    updateEventData(dayMemoTargetId, { dayMemos: nextDayMemos });
    commitScheduleChange();
  }
  closeDayMemoModal();
});
document.getElementById('ctxAddTask').addEventListener('click',()=>{ closeCtx(); openTaskModal(null,ctxTargetId); });
document.getElementById('ctxDelete').addEventListener('click',()=>{
  closeCtx();
  const ev = events.find(e=>e.id===ctxTargetId);
  if(!ev || !ev.repeat || ev.repeat.type==='none'){
  unlinkTodosFromEvent(ctxTargetId);
  removeEventData(ctxTargetId);
  commitScheduleChange();
  return;
}
  // 繰り返しあり → モーダル表示
  document.getElementById('deleteRepeatOverlay').classList.add('open');
});

function getCtxDateKey(){
  const evEl = document.querySelector(`[data-ev-id="${ctxTargetId}"]`);
  return evEl?.closest('.day-col')?.dataset.dateKey;
}

document.getElementById('deleteRepeatClose').addEventListener('click',()=>{
  document.getElementById('deleteRepeatOverlay').classList.remove('open');
});
document.getElementById('deleteRepeatOverlay').addEventListener('click',e=>{
  if(e.target.id==='deleteRepeatOverlay')
    document.getElementById('deleteRepeatOverlay').classList.remove('open');
});

// この日だけ削除
document.getElementById('deleteRepeatOne').addEventListener('click',()=>{
  const dk = getCtxDateKey();
  if(dk){
    updateEventData(ctxTargetId, ev => ({
      excludeDates: [...(ev.excludeDates || []), dk]
    }));
    commitScheduleChange();
  }
  document.getElementById('deleteRepeatOverlay').classList.remove('open');
});

// この日以降をすべて削除
document.getElementById('deleteRepeatAfter').addEventListener('click',()=>{
  const dk = getCtxDateKey();
  if(dk){
    const ev = events.find(e => e.id === ctxTargetId);
    const prevDay = dateKey(addDays(new Date(dk+'T00:00:00'),-1));
    if(ev && prevDay < ev.repeat.from){
      removeEventData(ctxTargetId);
    } else if(ev) {
      updateEventData(ctxTargetId, {
        repeat: {
          ...ev.repeat,
          to: prevDay
        }
      });
    }
    commitScheduleChange();
  }
  document.getElementById('deleteRepeatOverlay').classList.remove('open');
});

// すべて削除
document.getElementById('deleteRepeatAll').addEventListener('click',()=>{
  removeEventData(ctxTargetId);
  commitScheduleChange();
  document.getElementById('deleteRepeatOverlay').classList.remove('open');
});
document.getElementById('ctxClose').addEventListener('click', e => {
  e.stopPropagation();
  closeCtx();
});
document.addEventListener('click',()=>closeCtx());
document.addEventListener('touchstart', e=>{
  if(!e.target.closest('#ctxMenu')) closeCtx();
},{passive:true});

function openBulkNotifModal(){
  // 日付デフォルトは今日
  document.getElementById('bulkDate').value=todayStr();
  document.getElementById('bulkNotifH').value=21;
  document.getElementById('bulkNotifM').value=0;
  document.getElementById('bulkNotifMsg').value='';
  renderBulkEvList();
  document.getElementById('bulkNotifOverlay').classList.add('open');
}

function renderBulkEvList(){
  const dk=document.getElementById('bulkDate').value;
  const list=document.getElementById('bulkEvList');
  list.innerHTML='';
  const dayEvs = getSelectableEvents().filter(ev => {
  // 通常予定
  if (ev.dateKey === dk) return true;

  // 繰り返し予定の展開
  if (ev.repeat && ev.repeat.type !== 'none') {
    const expanded = expandRepeatingEvent(ev);
    return expanded.some(e => e.dateKey === dk);
  }

  return false;
});

  if(dayEvs.length===0){
    list.innerHTML='<div style="color:var(--text-faint);font-size:12px;padding:8px 0;">この日に予定はありません</div>';
    return;
  }
  dayEvs.forEach(ev=>{
    const row=document.createElement('div'); row.className='ev-check-row';
    const notif=ev.notification||{};
    const hasNotif=notif.enabled;
    const notifStr=hasNotif?`🔔 ${String(notif.notifH??'').padStart(2,'0')}:${String(notif.notifM??0).padStart(2,'0')}`:'通知なし';
    row.innerHTML=`
      <input type="checkbox" id="bev_${ev.id}" data-evid="${ev.id}" ${hasNotif?'checked':''}>
      <label class="ev-check-label" for="bev_${ev.id}">${esc(ev.title)}<br><span class="ev-time-label">${minToTime(ev.start)}〜${minToTime(ev.end)}</span></label>
      <span class="ev-check-time">${notifStr}</span>
    `;
    list.appendChild(row);
  });
}

document.getElementById('bulkDate').addEventListener('change', renderBulkEvList);

function closeBulkNotifModal(){ document.getElementById('bulkNotifOverlay').classList.remove('open'); }
document.getElementById('bulkNotifClose').addEventListener('click',closeBulkNotifModal);
document.getElementById('bulkNotifCancel').addEventListener('click',closeBulkNotifModal);
document.getElementById('bulkNotifOverlay').addEventListener('click',e=>{ if(e.target.id==='bulkNotifOverlay') closeBulkNotifModal(); });
document.getElementById('bulkRepeatOnce').addEventListener('click',()=>{
  document.getElementById('bulkRepeatOnce').classList.add('active');
  document.getElementById('bulkRepeatAlways').classList.remove('active');
});
document.getElementById('bulkRepeatAlways').addEventListener('click',()=>{
  document.getElementById('bulkRepeatAlways').classList.add('active');
  document.getElementById('bulkRepeatOnce').classList.remove('active');
});
document.getElementById('bulkNotifSave').addEventListener('click',()=>{
  const notifH=Number(document.getElementById('bulkNotifH').value);
  const notifM=Number(document.getElementById('bulkNotifM').value);
  const msg=document.getElementById('bulkNotifMsg').value.trim();
  const dk=document.getElementById('bulkDate').value;
  const isOnce = document.getElementById('bulkRepeatOnce').classList.contains('active');
  const checked=document.querySelectorAll('#bulkEvList input[type=checkbox]');
  checked.forEach(cb=>{
  const evId = Number(cb.dataset.evid);
  const idx = events.findIndex(e => e.id === evId);
  if(idx === -1) return;

  const ev = events[idx];

  if(cb.checked){
    if(isOnce){
      // この日だけ → notifOverridesに保存
      if(!ev.notifOverrides) ev.notifOverrides = {};

      ev.notifOverrides[dk] = {
        notifH,
        notifM,
        message: msg || (ev.notification?.message || ''),
        enabled: true,
      };

      // この日だけの通知内容を変えたので、この日の閉じ/完了/再通知状態をリセット
      resetSelfMessageStatusForDate(ev, dk);
    } else {
      // 毎回繰り返し → notificationに保存
      const oldSignature = JSON.stringify({
        enabled: !!ev.notification?.enabled,
        notifH: ev.notification?.notifH ?? null,
        notifM: ev.notification?.notifM ?? null,
        message: ev.notification?.message || ''
      });

      const newSignature = JSON.stringify({
        enabled: true,
        notifH,
        notifM,
        message: msg || (ev.notification?.message || '')
      });

      ev.notification = {
        enabled: true,
        notifH,
        notifM,
        message: msg || (ev.notification?.message || ''),
        statusByDate: ev.notification?.statusByDate || {},
      };

      // 毎回設定が変わった場合は、過去の閉じ/完了/再通知状態をリセット
      if(oldSignature !== newSignature) {
        resetAllSelfMessageStatuses(ev);
      }
    }
  } else {
    if(isOnce){
      if(!ev.notifOverrides) ev.notifOverrides = {};

      ev.notifOverrides[dk] = { skip: true };

      // この日だけ通知OFFにしたので、この日の状態もリセット
      resetSelfMessageStatusForDate(ev, dk);
    } else {
      const wasEnabled = !!ev.notification?.enabled;

      if(ev.notification) ev.notification.enabled = false;

      // 毎回通知OFFにした場合も状態をリセット
      if(wasEnabled) {
        resetAllSelfMessageStatuses(ev);
      }
    }
  }
});
  saveAll(); closeBulkNotifModal(); scheduleAllNotifications();
  renderEvents(); renderSelfMessagePanel(); updateSelfMessageBanner();
});

// ══════════════════════════════════════════
//  自分へのメッセージ 機能
// ══════════════════════════════════════════

function getBaseEventById(evId) {
  return events.find(e => e.id === evId);
}
function getEffectiveSelfMessageNotification(ev, dk) {
  const ov = ev.notifOverrides?.[dk];

  // この日だけスキップ
  if (ov && ov.skip) return null;

  // この日だけ設定
  if (ov && ov.enabled) {
    if (ov.notifH == null) return null;

    return {
      enabled: true,
      notifH: Number(ov.notifH),
      notifM: Number(ov.notifM || 0),
      message: ov.message || ev.notification?.message || ''
    };
  }

  // 通常設定
  const notif = ev.notification || {};
  if (!notif.enabled) return null;
  if (notif.notifH == null) return null;

  return {
    enabled: true,
    notifH: Number(notif.notifH),
    notifM: Number(notif.notifM || 0),
    message: notif.message || ''
  };
}

function resetSelfMessageStatusForDate(ev, dk) {
  if (!ev.notification) ev.notification = {};
  if (!ev.notification.statusByDate) ev.notification.statusByDate = {};

  if (ev.notification.statusByDate[dk]) {
    ev.notification.statusByDate[dk].done = false;
    ev.notification.statusByDate[dk].doneAt = null;
    ev.notification.statusByDate[dk].bannerDismissedAt = null;
    ev.notification.statusByDate[dk].snoozedUntil = null;
  }
}

function resetAllSelfMessageStatuses(ev) {
  if (!ev.notification || !ev.notification.statusByDate) return;

  Object.keys(ev.notification.statusByDate).forEach(dk => {
    ev.notification.statusByDate[dk].done = false;
    ev.notification.statusByDate[dk].doneAt = null;
    ev.notification.statusByDate[dk].bannerDismissedAt = null;
    ev.notification.statusByDate[dk].snoozedUntil = null;
  });
}

function ensureSelfMessageStatus(ev, dk) {
  if (!ev.notification) ev.notification = {};
  if (!ev.notification.statusByDate) ev.notification.statusByDate = {};
  if (!ev.notification.statusByDate[dk]) {
    ev.notification.statusByDate[dk] = {
      done: false,
      doneAt: null,
      bannerDismissedAt: null,
      snoozedUntil: null
    };
  }

  // 既存データ互換
  if (!('snoozedUntil' in ev.notification.statusByDate[dk])) {
    ev.notification.statusByDate[dk].snoozedUntil = null;
  }

  return ev.notification.statusByDate[dk];
}

function getSelfMessageItems() {
  const items = [];
  const todayKey = todayStr();

  allVisibleEvents().forEach(ev => {
    const dk = ev.dateKey;

    // 自分へのメッセージは「その日の振り返り」なので、未来分は一覧にも出さない
    if (dk > todayKey) return;

    const effectiveNotif = getEffectiveSelfMessageNotification(ev, dk);
    if (!effectiveNotif) return;

    const evId = ev._baseId || ev.id;
    const baseEv = getBaseEventById(evId);
    if (!baseEv) return;

    const status = ensureSelfMessageStatus(baseEv, dk);

    items.push({
      evId,
      dateKey: dk,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      notifH: effectiveNotif.notifH,
      notifM: effectiveNotif.notifM || 0,
      message: effectiveNotif.message || `${ev.title}はどうでしたか？`,
      done: !!status.done,
      doneAt: status.doneAt || null,
      bannerDismissedAt: status.bannerDismissedAt || null,
      snoozedUntil: status.snoozedUntil || null
    });
  });

  return items.sort((a, b) => {
    const ad = `${a.dateKey}T${String(a.notifH).padStart(2,'0')}:${String(a.notifM).padStart(2,'0')}:00`;
    const bd = `${b.dateKey}T${String(b.notifH).padStart(2,'0')}:${String(b.notifM).padStart(2,'0')}:00`;
    return new Date(ad) - new Date(bd);
  });
}

function formatSelfMessageDateTime(item) {
  const d = new Date(item.dateKey + 'T00:00:00');
  return `${d.getMonth()+1}/${d.getDate()} ${String(item.notifH).padStart(2,'0')}:${String(item.notifM).padStart(2,'0')}`;
}

function renderSelfMessagePanel() {
  const list = document.getElementById('selfMessageList');
  if (!list) return;

  list.innerHTML = '';

  const items = getSelfMessageItems();
  const active = items.filter(item => !item.done);
  const done = items.filter(item => item.done).sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0));

  if (active.length === 0 && done.length === 0) {
    list.innerHTML = '<div style="color:var(--text-faint);font-size:12px;text-align:center;padding:24px 0;">自分へのメッセージはありません</div>';
    return;
  }

  active.forEach(item => {
    list.appendChild(makeSelfMessageCard(item, false));
  });

  if (done.length > 0) {
    let doneOpen = false;

    const toggle = document.createElement('button');
    toggle.className = 'self-message-done-toggle';
    toggle.textContent = `▶ 完了済み（${done.length}件）`;
    list.appendChild(toggle);

    const doneList = document.createElement('div');
    doneList.className = 'self-message-done-list';
    doneList.style.display = 'none';

    done.forEach(item => {
      doneList.appendChild(makeSelfMessageCard(item, true));
    });

    list.appendChild(doneList);

    toggle.addEventListener('click', () => {
      doneOpen = !doneOpen;
      doneList.style.display = doneOpen ? 'flex' : 'none';
      doneList.style.flexDirection = 'column';
      toggle.textContent = `${doneOpen ? '▼' : '▶'} 完了済み（${done.length}件）`;
    });
  }
}

function makeSelfMessageCard(item, isDone) {
  const card = document.createElement('div');
  card.className = 'self-message-card' + (isDone ? ' done' : '');

  card.innerHTML = `
    <div class="self-message-card-top">
      <button class="self-message-check-btn${isDone ? ' checked' : ''}" title="${isDone ? '未完了に戻す' : '完了にする'}"></button>
      <div class="self-message-body">
        <div class="self-message-text">${esc(item.message)}</div>
        <div class="self-message-event"><span class="meta-label">予定</span>${esc(item.title)}</div>
        <div class="self-message-time"><span class="meta-label">通知</span>${formatSelfMessageDateTime(item)}</div>
      </div>
    </div>
  `;

  card.querySelector('.self-message-check-btn').addEventListener('click', () => {
    if (isDone) {
      markSelfMessageUndone(item.evId, item.dateKey);
    } else {
      markSelfMessageDone(item.evId, item.dateKey);
    }
  });

  return card;
}

function markSelfMessageDone(evId, dk) {
  const ev = getBaseEventById(evId);
  if (!ev) return;

  const status = ensureSelfMessageStatus(ev, dk);
  status.done = true;
  status.doneAt = new Date().toISOString();
  status.bannerDismissedAt = new Date().toISOString();
  status.snoozedUntil = null;

  saveAll();
  renderSelfMessagePanel();
  updateSelfMessageBanner();
  scheduleAllNotifications();
}

function markSelfMessageUndone(evId, dk) {
  const ev = getBaseEventById(evId);
  if (!ev) return;

  const status = ensureSelfMessageStatus(ev, dk);
  status.done = false;
  status.doneAt = null;
  status.bannerDismissedAt = null;
  status.snoozedUntil = null;

  saveAll();
  renderSelfMessagePanel();
  updateSelfMessageBanner();
  scheduleAllNotifications();
}

function openSelfMessagePanel() {
  const panel = document.getElementById('selfMessagePanel');
  if (!panel) return;
  panel.classList.add('open');
  renderSelfMessagePanel();
}

function closeSelfMessagePanel() {
  const panel = document.getElementById('selfMessagePanel');
  if (!panel) return;
  panel.classList.remove('open');
}

function getDueSelfMessageItems() {
  const now = new Date();
  const todayKey = todayStr();
  const dueToday = [];
  const overdue = [];

  getSelfMessageItems().forEach(item => {
    if (item.done) return;
    if (item.bannerDismissedAt) return;

    if (item.snoozedUntil && new Date(item.snoozedUntil) > now) return;

    if (item.dateKey < todayKey) {
      overdue.push(item);
      return;
    }

    if (item.dateKey !== todayKey) return;

    const notifyDt = new Date(
      `${item.dateKey}T${String(item.notifH).padStart(2,'0')}:${String(item.notifM).padStart(2,'0')}:00`
    );

    if (item.snoozedUntil || notifyDt <= now) {
      dueToday.push(item);
    }
  });

  if (dueToday.length > 0) return dueToday;

  if (overdue.length > 0) {
    return [{
      type: 'summary',
      items: overdue,
      message: '\u672a\u51e6\u7406\u30e1\u30c3\u30bb\u30fc\u30b8\u304c' + overdue.length + '\u4ef6\u3042\u308a\u307e\u3059',
      title: '\u81ea\u5206\u3078\u306e\u30e1\u30c3\u30bb\u30fc\u30b8',
      dateKey: overdue[0].dateKey,
      notifH: overdue[0].notifH,
      notifM: overdue[0].notifM
    }];
  }

  return [];
}
function updateSelfMessageBanner() {
  const banner = document.getElementById('selfMessageBanner');
  if (!banner) return;

  const dueItems = getDueSelfMessageItems();

  if (dueItems.length === 0) {
    banner.classList.remove('active');
    currentSelfMessageBannerItem = null;
    return;
  }

  const item = dueItems[0];
  currentSelfMessageBannerItem = item;

  const snoozeBtn = document.getElementById('selfMessageBannerSnooze');
  const doneBtn = document.getElementById('selfMessageBannerDone');

  if (item.type === 'summary') {
    document.getElementById('selfMessageBannerText').textContent = item.message;
    document.getElementById('selfMessageBannerMeta').textContent = '\u958b\u3044\u3066\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044';
    if (snoozeBtn) snoozeBtn.textContent = '\u5f8c\u3067';
    if (doneBtn) doneBtn.textContent = '\u958b\u304f';
  } else {
    document.getElementById('selfMessageBannerText').textContent = item.message;
    document.getElementById('selfMessageBannerMeta').textContent = `${item.title} / ${formatSelfMessageDateTime(item)}`;
    if (snoozeBtn) snoozeBtn.textContent = '\u518d\u901a\u77e5';
    if (doneBtn) doneBtn.textContent = '\u5b8c\u4e86';
  }

  banner.classList.add('active');
}

function dismissSelfMessageBanner() {
  if (!currentSelfMessageBannerItem) return;

  const item = currentSelfMessageBannerItem;
  const dismissedAt = new Date().toISOString();

  if (item.type === 'summary') {
    item.items.forEach(summaryItem => {
      const ev = getBaseEventById(summaryItem.evId);
      if (!ev) return;
      const status = ensureSelfMessageStatus(ev, summaryItem.dateKey);
      status.bannerDismissedAt = dismissedAt;
    });
  } else {
    const ev = getBaseEventById(item.evId);
    if (!ev) return;
    const status = ensureSelfMessageStatus(ev, item.dateKey);
    status.bannerDismissedAt = dismissedAt;
  }

  saveAll();
  updateSelfMessageBanner();
}

function completeCurrentSelfMessageBanner() {
  if (!currentSelfMessageBannerItem) return;

  if (currentSelfMessageBannerItem.type === 'summary') {
    openSelfMessagePanel();
    document.getElementById('selfMessageBanner')?.classList.remove('active');
    return;
  }

  markSelfMessageDone(
    currentSelfMessageBannerItem.evId,
    currentSelfMessageBannerItem.dateKey
  );
}

function openSelfMessageSnoozeModal() {
  if (!currentSelfMessageBannerItem) return;

  restoreSelfMessageSnoozeDefault();

  const tomorrow = addDays(new Date(), 1);
  document.getElementById('selfSnoozeCustomDate').value = dateKey(tomorrow);
  document.getElementById('selfSnoozeCustomH').value = 9;
  document.getElementById('selfSnoozeCustomM').value = 0;

  updateSelfSnoozeFields();

  document.getElementById('selfSnoozeOverlay').classList.add('open');
}

function closeSelfMessageSnoozeModal() {
  document.getElementById('selfSnoozeOverlay').classList.remove('open');
}

function updateSelfSnoozeFields() {
  const type = document.getElementById('selfSnoozeType').value;

  document.getElementById('selfSnoozeHoursField').style.display =
    type === 'hours' ? 'flex' : 'none';

  document.getElementById('selfSnoozeCustomField').style.display =
    type === 'custom' ? 'flex' : 'none';
}

function restoreSelfMessageSnoozeDefault() {
  const def = settings.selfMessageSnoozeDefault || { type: 'day', hours: 3 };

  document.getElementById('selfSnoozeType').value = def.type || 'day';

  if (def.hours) {
    document.getElementById('selfSnoozeHours').value = def.hours;
  }
}

function saveSelfMessageSnoozeDefault(type, hours) {
  settings.selfMessageSnoozeDefault = {
    type,
    hours: hours || 3
  };
  saveSettings();
}

function calcSelfMessageSnoozeUntil() {
  const type = document.getElementById('selfSnoozeType').value;
  const now = new Date();

  if (type === 'day') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }

  if (type === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }

  if (type === 'hours') {
    const hours = Math.max(1, Number(document.getElementById('selfSnoozeHours').value) || 1);
    const d = new Date(now);
    d.setHours(d.getHours() + hours);
    return d;
  }

  if (type === 'custom') {
    const dateStr = document.getElementById('selfSnoozeCustomDate').value;
    const h = Number(document.getElementById('selfSnoozeCustomH').value);
    const m = Number(document.getElementById('selfSnoozeCustomM').value);

    if (!dateStr) return null;

    return new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  }

  return null;
}

function applySelfMessageSnooze() {
  if (!currentSelfMessageBannerItem) return;

  const item = currentSelfMessageBannerItem;
  const until = calcSelfMessageSnoozeUntil();
  if (!until || Number.isNaN(until.getTime())) {
    alert('再通知日時が正しくありません。');
    return;
  }

  if (until <= new Date()) {
    alert('現在より後の日時を指定してください。');
    return;
  }

  const targets = item.type === 'summary' ? item.items : [item];
  targets.forEach(target => {
    const ev = getBaseEventById(target.evId);
    if (!ev) return;
    const status = ensureSelfMessageStatus(ev, target.dateKey);
    status.done = false;
    status.doneAt = null;
    status.bannerDismissedAt = null;
    status.snoozedUntil = until.toISOString();
  });

  const type = document.getElementById('selfSnoozeType').value;
  const hours = Math.max(1, Number(document.getElementById('selfSnoozeHours').value) || 3);
  saveSelfMessageSnoozeDefault(type, hours);

  saveAll();
  closeSelfMessageSnoozeModal();
  renderSelfMessagePanel();
  updateSelfMessageBanner();
  scheduleAllNotifications();
}

function scheduleSelfMessageSnoozeNotification(item) {
  if (!item.snoozedUntil) return;
  if (!canUseWebNotification()) return;

  const notifyDt = new Date(item.snoozedUntil);
  const delay = notifyDt - Date.now();

  if (delay < 0) return;

  requestWebNotificationPermission().then(perm => {
    if (perm !== 'granted') return;

    const timerId = setTimeout(() => {
      const ev = getBaseEventById(item.evId);
      if (!ev) return;

      const status = ensureSelfMessageStatus(ev, item.dateKey);
      if (status.done) return;
      if (status.bannerDismissedAt) return;

      showWebNotification(item.message, {
        body: `📅 ${item.title}`
      });

      updateSelfMessageBanner();
    }, delay);

    selfMessageSnoozeTimeouts.push(timerId);
  });
}

function scheduleSelfMessageSnoozeNotifications() {
  selfMessageSnoozeTimeouts.forEach(timerId => clearTimeout(timerId));
  selfMessageSnoozeTimeouts = [];

  getSelfMessageItems().forEach(item => {
    if (item.done) return;
    if (item.bannerDismissedAt) return;
    if (!item.snoozedUntil) return;

    scheduleSelfMessageSnoozeNotification(item);
  });
}

// ══════════════════════════════════════════
//  TODO 機能
// ══════════════════════════════════════════

// TODOパネルの一覧を描画
function renderTodoList(){
  // 7日以上経過した完了済みを自動削除
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if(cleanupExpiredCompletedTodos(cutoff)) saveAll();

  const list = document.getElementById('todoList');
  list.innerHTML = '';

  const active = todos.filter(t => !t.done).sort((a, b) => {
    const aHas = !!a.deadline, bHas = !!b.deadline;
    if (aHas && bHas) return new Date(a.deadline) - new Date(b.deadline);
    if (aHas) return -1;
    if (bHas) return 1;
    return (a.id || 0) - (b.id || 0); // 期限なし同士は追加順（IDが小さい＝先に追加）
  });
  const done   = todos.filter(t =>  t.done).sort((a, b) => new Date(b.doneAt)   - new Date(a.doneAt));

  if(active.length === 0 && done.length === 0){
    list.innerHTML = '<div style="color:var(--text-faint);font-size:12px;text-align:center;padding:24px 0;">TODOはありません</div>';
    return;
  }

  // ── 未完了カード ──
  active.forEach(t => list.appendChild(makeTodoCard(t, false)));

  // ── 完了済みセクション ──
  if(done.length > 0){
    let doneOpen = false;

    const toggle = document.createElement('button');
    toggle.className = 'todo-done-toggle';
    toggle.textContent = `▶ 完了済み（${done.length}件）`;
    list.appendChild(toggle);

    const doneList = document.createElement('div');
    doneList.className = 'todo-done-list';
    doneList.style.display = 'none';

    const clearBtn = document.createElement('button');
    clearBtn.className = 'todo-done-clear';
    clearBtn.textContent = '完了済みをすべて削除';
    clearBtn.addEventListener('click', () => {
      removeCompletedTodoData();
      saveAll(); renderTodoList();
    });
    doneList.appendChild(clearBtn);

    done.forEach(t => doneList.appendChild(makeTodoCard(t, true)));
    list.appendChild(doneList);

    toggle.addEventListener('click', () => {
      doneOpen = !doneOpen;
      doneList.style.display = doneOpen ? 'flex' : 'none';
      doneList.style.flexDirection = 'column';
      toggle.textContent = `${doneOpen ? '▼' : '▶'} 完了済み（${done.length}件）`;
    });
  }
}

function makeTodoCard(t, isDone){
  const card = document.createElement('div');
  card.className = 'todo-card' + (isDone ? ' done' : '');
  const originEv = getTodoOriginEvent(t);
  const originDateLabel = t.originEventDateKey ? formatOriginDateLabel(t.originEventDateKey) + ' ' : '';

  // 期限表示（nullの場合は「期限なし」）
  let dlStr = '期限なし';
  if (t.deadline) {
    const dl = new Date(t.deadline);
    dlStr = `${dl.getMonth()+1}/${dl.getDate()} ${String(dl.getHours()).padStart(2,'0')}:${String(dl.getMinutes()).padStart(2,'0')}`;
  }

  // 予定追加回数（scheduledEvents配列 or 旧scheduledEventIdに対応）
  const scheduledEvents = Array.isArray(t.scheduledEvents)
    ? t.scheduledEvents
    : (t.scheduledEventId != null ? [t.scheduledEventId] : []);
  const schedCount = scheduledEvents.length;

  // 進捗
  const progress = typeof t.progress === 'number' ? t.progress : 0;

  card.innerHTML = `
    <div class="todo-card-top">
      <button class="todo-check-btn${isDone ? ' checked' : ''}" title="${isDone ? '未完了に戻す' : '完了にする'}" data-tid="${t.id}"></button>
      <div class="todo-card-body">
        <div class="todo-card-text">${esc(t.text)}</div>
        ${originEv ? `<div class="todo-card-origin"><span class="meta-label">予定</span>${originDateLabel}${esc(originEv.title)}</div>` : ''}
        ${t.deadline ? `<div class="todo-card-deadline"><span class="meta-label">期限</span>${dlStr}</div>` : `<div class="todo-card-deadline" style="color:var(--text-faint);"><span class="meta-label">期限</span>なし</div>`}
        ${!isDone ? `
          <div class="todo-progress-wrap">
            <div class="todo-progress-bar-bg">
              <div class="todo-progress-bar-fill" style="width:${progress}%"></div>
            </div>
            <div class="todo-progress-row">
              <span class="todo-progress-label">${progress}%</span>
              <input type="range" class="todo-progress-slider" min="0" max="100" step="5" value="${progress}" data-tid="${t.id}">
            </div>
          </div>
          <div class="todo-card-status"><span class="meta-label">状態</span>${schedCount > 0 ? `予定済み（${schedCount}回）` : '未定'}</div>
          <button class="todo-schedule-btn" data-tid="${t.id}">＋ 予定に追加</button>
        ` : ''}
      </div>
      ${!isDone ? `<button class="todo-edit-btn" data-tid="${t.id}">✏ 編集</button>` : ''}
      <button class="todo-card-del" data-tid="${t.id}">✕</button>
    </div>
  `;

  // チェックボタン
  card.querySelector('.todo-check-btn').addEventListener('click', () => {
    if(isDone){
      updateTodoData(t.id, { done: false, doneAt: null });
    } else {
      updateTodoData(t.id, { done: true, doneAt: new Date().toISOString() });
    }
    saveAll(); renderTodoList();
  });

  // 削除ボタン
  card.querySelector('.todo-card-del').addEventListener('click', () => {
    removeTodoData(t.id);
    saveAll(); renderTodoList();
  });

if(!isDone){
  card.querySelector('.todo-edit-btn').addEventListener('click', () => {
    openTodoModal(t.id, null, null);
  });
}

  // 進捗スライダー
  if(!isDone){
    card.querySelector('.todo-progress-slider').addEventListener('input', function() {
      const val = Number(this.value);
      // ラベルをリアルタイム更新
      this.closest('.todo-progress-row').querySelector('.todo-progress-label').textContent = val + '%';
      this.closest('.todo-progress-wrap').querySelector('.todo-progress-bar-fill').style.width = val + '%';
    });
    card.querySelector('.todo-progress-slider').addEventListener('change', function() {
      updateTodoData(t.id, { progress: Number(this.value) });
      saveAll();
    });

    // 予定に追加ボタン（常に表示）
    card.querySelector('.todo-schedule-btn').addEventListener('click', () => {
      startTodoScheduling(t.id);
    });
  }

  return card;
}

// 発生元予定のセレクトを初期化
function formatOriginDateLabel(dateKeyValue){
  if(!dateKeyValue) return '';
  const d = new Date(dateKeyValue + 'T00:00:00');
  if(Number.isNaN(d.getTime())) return dateKeyValue;
  return `${d.getMonth()+1}/${d.getDate()}`;
}

function getEventsForOriginDate(originDateKey){
  if(!originDateKey) return [];
  const seen = new Set();
  return allVisibleEvents()
    .filter(ev => ev.dateKey === originDateKey && !isInvalidRepeatEvent(ev))
    .filter(ev => {
      const id = ev._baseId || ev.id;
      if(seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => (a.start || 0) - (b.start || 0));
}

function getTodoOriginEvent(todo){
  if(!todo?.originEventId) return null;
  if(todo.originEventDateKey){
    return allVisibleEvents().find(ev =>
      (ev._baseId || ev.id) === todo.originEventId && ev.dateKey === todo.originEventDateKey
    ) || events.find(ev => ev.id === todo.originEventId) || null;
  }
  return events.find(ev => ev.id === todo.originEventId) || null;
}

function populateTodoOriginEv(originDateKey, preselect){
  const sel = document.getElementById('tdOriginEv');
  sel.innerHTML = '<option value="">-- 選択しない --</option>';

  if(!originDateKey){
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  getEventsForOriginDate(originDateKey).forEach(ev => {
    const id = ev._baseId || ev.id;
    const o = document.createElement('option');
    o.value = id;
    const time = ev.start != null ? `${minToTime(ev.start)} ` : '';
    o.textContent = `${time}${ev.title}`;
    sel.appendChild(o);
  });

  if(preselect) sel.value = String(preselect);
}

// TODOモーダルを開く
function openTodoModal(todoId, originEvId, originEvDateKey){
  todoModalMode = todoId ? 'edit' : 'create';
  editTodoId = todoId;
  pendingTodoOriginDateKey = originEvDateKey || null;
  document.getElementById('todoModalTitle').textContent = todoId ? 'EDIT TODO' : 'NEW TODO';
  const now = new Date();
  if(todoId){
    const t = todos.find(tk => tk.id === todoId); if(!t) return;
    document.getElementById('tdText').value = t.text;
    const dl = new Date(t.deadline);
    document.getElementById('tdDate').value = dateKey(dl);
    document.getElementById('tdHour').value = dl.getHours();
    document.getElementById('tdMin').value = Math.round(dl.getMinutes() / 5) * 5;
    const originDate = t.originEventDateKey || (t.originEventId ? events.find(ev => ev.id === t.originEventId)?.dateKey : '') || '';
    document.getElementById('tdOriginDate').value = originDate;
    populateTodoOriginEv(originDate, t.originEventId || '');
  } else {
    document.getElementById('tdText').value = '';
    document.getElementById('tdDate').value = dateKey(now);
    document.getElementById('tdHour').value = now.getHours();
    document.getElementById('tdMin').value = 0;
    const originDate = originEvDateKey || '';
    document.getElementById('tdOriginDate').value = originDate;
    populateTodoOriginEv(originDate, originEvId || '');
  }
  document.getElementById('todoOverlay').classList.add('open');
  setTimeout(() => document.getElementById('tdText').focus(), 50);
}
function closeTodoModal(){ document.getElementById('todoOverlay').classList.remove('open'); }

// TODOの「予定に追加」フローを開始
function startTodoScheduling(todoId){
  todoSchedulingMode = true;
  schedulingTodoId = todoId;
  document.getElementById('todoPanel').classList.remove('open');
  document.getElementById('schedulingBanner').classList.add('active');
}

function cancelTodoScheduling(){
  todoSchedulingMode = false;
  schedulingTodoId = null;
  document.getElementById('schedulingBanner').classList.remove('active');
}

// TODOから予定作成モーダルを開く（タイトル・メモ自動入力）
function openCreateModalFromTodo(dKey, sMin, eMin, todoId){
  const todo = todos.find(t => t.id === todoId);
  if(!todo){ openCreateModal(dKey, sMin, eMin); return; }
  pendingFromTodoId = todoId;
  openCreateModal(dKey, sMin, eMin);
  // モーダルが開いた後にフィールドを上書き
  document.getElementById('fTitle').value = todo.text;
  const originEv = todo.originEventId ? events.find(e => e.id === todo.originEventId) : null;
  if(originEv){
    const detailSec = document.getElementById('detailSection');
    detailSec.classList.add('open');
    document.getElementById('detailToggleBtn').textContent = '▼ 詳細設定';
    document.getElementById('fMemo').value = `${originEv.title}から発生したタスク`;
  }
}

// ── TODOモーダル イベントリスナー ──
document.getElementById('todoModalClose').addEventListener('click', closeTodoModal);
document.getElementById('todoModalCancel').addEventListener('click', closeTodoModal);
document.getElementById('todoOverlay').addEventListener('click', e => { if(e.target.id === 'todoOverlay') closeTodoModal(); });


document.getElementById('tdOriginDate').addEventListener('change', function() {
  pendingTodoOriginDateKey = this.value || null;
  populateTodoOriginEv(pendingTodoOriginDateKey, '');
});

document.getElementById('todoModalSave').addEventListener('click', () => {
  const text = document.getElementById('tdText').value.trim();
  if(!text){ document.getElementById('tdText').focus(); return; }
  const dateStr = document.getElementById('tdDate').value;
  const h = Number(document.getElementById('tdHour').value);
  const m = Number(document.getElementById('tdMin').value);
  const dl = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  const originDateKey = document.getElementById('tdOriginDate').value || null;
  const originEvId = document.getElementById('tdOriginEv').value;
  const obj = {
    text,
    deadline: dl.toISOString(),
    originEventId: originEvId ? Number(originEvId) : null,
    originEventDateKey: originEvId ? originDateKey : null,
    scheduledEventId: todoModalMode === 'edit' ? (todos.find(t => t.id === editTodoId)?.scheduledEventId ?? null) : null,
  };
  if(todoModalMode === 'create'){
    obj.id = issueTodoId();
    addTodoData(obj);
  } else {
    obj.id = editTodoId;
    replaceTodoData(editTodoId, obj);
  }
  pendingTodoOriginDateKey = null;
  saveAll(); closeTodoModal(); renderTodoList();
});

// ── TODOパネル イベントリスナー ──
document.getElementById('todoPanelClose').addEventListener('click', () => {
  document.getElementById('todoPanel').classList.remove('open');
});
document.getElementById('todoAddBtn').addEventListener('click', () => openTodoModal(null, null, null));

// ── ドロワーのTODOボタン ──
document.getElementById('drawerTodo').addEventListener('click', () => {
  closeDrawer();
  document.getElementById('todoPanel').classList.toggle('open');
  renderTodoList();
});

// ── コンテキストメニューのTODO項目 ──
document.getElementById('ctxAddTodo').addEventListener('click', () => {
  closeCtx();
  const evEl = document.querySelector(`[data-ev-id="${ctxTargetId}"]`);
  const dk = evEl?.closest('.day-col')?.dataset.dateKey;
  openTodoModal(null, ctxTargetId, dk);
});

// ── スケジューリングバナーのキャンセル ──
document.getElementById('schedulingCancel').addEventListener('click', cancelTodoScheduling);
// ── タスクパネル ──
document.getElementById('taskPanelClose').addEventListener('click',()=>{ document.getElementById('taskPanel').classList.remove('open'); });
document.getElementById('taskAddBtn').addEventListener('click',()=>openTaskModal(null,null));

document.getElementById('reminderSnoozeClose').addEventListener('click', closeReminderSnoozeModal);
document.getElementById('reminderSnoozeCancel').addEventListener('click', closeReminderSnoozeModal);
document.getElementById('reminderSnoozeSave').addEventListener('click', applyReminderSnooze);

document.getElementById('reminderSnoozeType').addEventListener('change', updateReminderSnoozeFields);

document.getElementById('reminderSnoozeOverlay').addEventListener('click', e => {
  if (e.target.id === 'reminderSnoozeOverlay') closeReminderSnoozeModal();
});

function renderTaskList(){
  const list = document.getElementById('taskList');
  list.innerHTML = '';

  const active = tasks
    .filter(t => !t.done)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const done = tasks
    .filter(t => t.done)
    .sort((a, b) => new Date(b.doneAt || 0) - new Date(a.doneAt || 0));

  if(active.length === 0 && done.length === 0){
    list.innerHTML = '<div style="color:var(--text-faint);font-size:12px;text-align:center;padding:24px 0;">リマインダーはありません</div>';
    return;
  }

  active.forEach(t => {
    list.appendChild(makeTaskCard(t, false));
  });

  if(done.length > 0){
    let doneOpen = false;

    const toggle = document.createElement('button');
    toggle.className = 'task-done-toggle';
    toggle.textContent = `▶ 完了済み（${done.length}件）`;
    list.appendChild(toggle);

    const doneList = document.createElement('div');
    doneList.className = 'task-done-list';
    doneList.style.display = 'none';

    done.forEach(t => {
      doneList.appendChild(makeTaskCard(t, true));
    });

    list.appendChild(doneList);

    toggle.addEventListener('click', () => {
      doneOpen = !doneOpen;
      doneList.style.display = doneOpen ? 'flex' : 'none';
      doneList.style.flexDirection = 'column';
      toggle.textContent = `${doneOpen ? '▼' : '▶'} 完了済み（${done.length}件）`;
    });
  }
}

function getTaskNotifyDateTime(t) {
  return t.snoozedUntil || t.datetime;
}

function makeTaskCard(t, isDone){
  const card = document.createElement('div');
  card.className = 'task-card' + (isDone ? ' done' : '');

  const ev = t.evId ? events.find(e => e.id === t.evId) : null;
  const notifyDt = new Date(getTaskNotifyDateTime(t));
  const dtStr = `${notifyDt.getMonth()+1}/${notifyDt.getDate()} ${String(notifyDt.getHours()).padStart(2,'0')}:${String(notifyDt.getMinutes()).padStart(2,'0')}`;
  const isSnoozed = !!t.snoozedUntil && !isDone;

  card.innerHTML = `
    <div class="task-card-top">
      <button class="task-check-btn${isDone ? ' checked' : ''}" title="${isDone ? '未完了に戻す' : '完了にする'}" data-tid="${t.id}"></button>

      <div class="task-card-body">
        <div class="task-card-text">${esc(t.text)}</div>
        <div class="task-card-meta"><span class="meta-label">通知</span>${dtStr}</div>
        ${isSnoozed ? `<div class="task-card-snoozed">↻ 再通知設定中</div>` : ''}
        ${t.note ? `<div class="task-card-ev">${esc(t.note)}</div>` : ''}
        ${ev ? `<div class="task-card-ev"><span class="meta-label">予定</span>${esc(ev.title)}</div>` : ''}
        ${!isDone ? `<button class="task-snooze-btn" data-tid="${t.id}">再通知</button>` : ''}
      </div>

      <button class="task-del-btn" data-tid="${t.id}">✕</button>
    </div>
  `;

  card.querySelector('.task-check-btn').addEventListener('click', () => {
    const idx = tasks.findIndex(tk => tk.id === t.id);
    if(idx === -1) return;

    if(isDone){
      updateReminderData(t.id, { done: false, doneAt: null });
    } else {
      updateReminderData(t.id, {
        done: true,
        doneAt: new Date().toISOString(),
        snoozedUntil: null
      });
    }

    saveAll();
    renderTaskList();
    scheduleAllNotifications();
  });

  card.querySelector('.task-del-btn').addEventListener('click', () => {
    removeReminderData(t.id);
    saveAll();
    renderTaskList();
    scheduleAllNotifications();
  });

  const snoozeBtn = card.querySelector('.task-snooze-btn');
  if(snoozeBtn){
    snoozeBtn.addEventListener('click', () => {
      openReminderSnoozeModal(t.id);
    });
  }

  return card;
}

let taskModalMode='create'; let editTaskId=null;

function openReminderSnoozeModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || task.done) return;

  reminderSnoozeTargetId = taskId;

  restoreReminderSnoozeDefault();

  const tomorrow = addDays(new Date(), 1);
  document.getElementById('reminderSnoozeCustomDate').value = dateKey(tomorrow);
  document.getElementById('reminderSnoozeCustomH').value = 9;
  document.getElementById('reminderSnoozeCustomM').value = 0;

  updateReminderSnoozeFields();

  document.getElementById('reminderSnoozeOverlay').classList.add('open');
}

function closeReminderSnoozeModal() {
  document.getElementById('reminderSnoozeOverlay').classList.remove('open');
  reminderSnoozeTargetId = null;
}

function updateReminderSnoozeFields() {
  const type = document.getElementById('reminderSnoozeType').value;

  document.getElementById('reminderSnoozeHoursField').style.display =
    type === 'hours' ? 'flex' : 'none';

  document.getElementById('reminderSnoozeCustomField').style.display =
    type === 'custom' ? 'flex' : 'none';
}

function restoreReminderSnoozeDefault() {
  const def = settings.reminderSnoozeDefault || { type: 'day', hours: 3 };

  document.getElementById('reminderSnoozeType').value = def.type || 'day';

  if (def.hours) {
    document.getElementById('reminderSnoozeHours').value = def.hours;
  }
}

function saveReminderSnoozeDefault(type, hours) {
  settings.reminderSnoozeDefault = {
    type,
    hours: hours || 3
  };
  saveSettings();
}

function calcReminderSnoozeUntil() {
  const type = document.getElementById('reminderSnoozeType').value;
  const now = new Date();

  if (type === 'day') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }

  if (type === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }

  if (type === 'hours') {
    const hours = Math.max(1, Number(document.getElementById('reminderSnoozeHours').value) || 1);
    const d = new Date(now);
    d.setHours(d.getHours() + hours);
    return d;
  }

  if (type === 'custom') {
    const dateStr = document.getElementById('reminderSnoozeCustomDate').value;
    const h = Number(document.getElementById('reminderSnoozeCustomH').value);
    const m = Number(document.getElementById('reminderSnoozeCustomM').value);

    if (!dateStr) return null;

    return new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  }

  return null;
}

function applyReminderSnooze() {
  if (reminderSnoozeTargetId == null) return;

  const idx = tasks.findIndex(t => t.id === reminderSnoozeTargetId);
  if (idx === -1) return;

  const until = calcReminderSnoozeUntil();

  if (!until || Number.isNaN(until.getTime())) {
    alert('再通知日時が正しくありません。');
    return;
  }

  if (until <= new Date()) {
    alert('現在より後の日時を指定してください。');
    return;
  }

  updateReminderData(reminderSnoozeTargetId, {
    done: false,
    doneAt: null,
    snoozedUntil: until.toISOString()
  });

  const type = document.getElementById('reminderSnoozeType').value;
  const hours = Math.max(1, Number(document.getElementById('reminderSnoozeHours').value) || 3);
  saveReminderSnoozeDefault(type, hours);

  saveAll();
  closeReminderSnoozeModal();
  renderTaskList();
  scheduleAllNotifications();
}

function scheduleReminderNotifications() {
  reminderNotificationTimeouts.forEach(timerId => clearTimeout(timerId));
  reminderNotificationTimeouts = [];

  if (!canUseWebNotification()) return;

  tasks.forEach(task => {
    if (task.done) return;

    const notifyAt = getTaskNotifyDateTime(task);
    if (!notifyAt) return;

    const notifyDt = new Date(notifyAt);
    const delay = notifyDt - Date.now();

    if (delay < 0) return;

    requestWebNotificationPermission().then(perm => {
      if (perm !== 'granted') return;

      const timerId = setTimeout(() => {
        const latestTask = tasks.find(t => t.id === task.id);
        if (!latestTask) return;
        if (latestTask.done) return;

        const latestNotifyAt = getTaskNotifyDateTime(latestTask);
        if (latestNotifyAt !== notifyAt) return;

        const ev = latestTask.evId ? events.find(e => e.id === latestTask.evId) : null;

        showWebNotification(latestTask.note || latestTask.text, {
          body: ev ? `📅 ${ev.title}` : 'リマインダー'
        });

        renderTaskList();
      }, delay);

      reminderNotificationTimeouts.push(timerId);
    });
  });
}

function openTaskModal(taskId, linkedEvId){
  taskModalMode=taskId?'edit':'create'; editTaskId=taskId;
  document.getElementById('taskModalTitle').textContent=taskId?'EDIT REMINDER':'NEW REMINDER';
  const now=new Date();
  if(taskId){
    const t=tasks.find(tk=>tk.id===taskId); if(!t) return;
    document.getElementById('tText').value=t.text;
    const dt=new Date(t.datetime);
    document.getElementById('tDate').value=dateKey(dt);
    document.getElementById('tHour').value=dt.getHours();
    document.getElementById('tMin').value=Math.round(dt.getMinutes()/5)*5;
    document.getElementById('tNote').value=t.note||'';
    populateEvLink(t.evId||'');
    document.getElementById('tEvLink').value=t.evId||'';
  } else {
    document.getElementById('tText').value='';
    document.getElementById('tDate').value=dateKey(now);
    document.getElementById('tHour').value=now.getHours();
    document.getElementById('tMin').value=0;
    document.getElementById('tNote').value='';
    populateEvLink(linkedEvId||'');
    if(linkedEvId) document.getElementById('tEvLink').value=linkedEvId;
  }
  document.getElementById('taskOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('tText').focus(),50);
}

function populateEvLink(preselect){
  const sel = document.getElementById('tEvLink');
  sel.innerHTML = '<option value="">-- 選択しない --</option>';

  getSelectableEvents().forEach(ev => {
    const o = document.createElement('option');
    o.value = ev.id;
    o.textContent = ev.title + (ev.dateKey ? ' (' + ev.dateKey + ')' : '');
    sel.appendChild(o);
  });

  if(preselect) sel.value = preselect;
}

function closeTaskModal(){ document.getElementById('taskOverlay').classList.remove('open'); }
document.getElementById('taskModalClose').addEventListener('click',closeTaskModal);
document.getElementById('taskModalCancel').addEventListener('click',closeTaskModal);
document.getElementById('taskOverlay').addEventListener('click',e=>{ if(e.target.id==='taskOverlay') closeTaskModal(); });
document.getElementById('taskModalSave').addEventListener('click',()=>{
  const text=document.getElementById('tText').value.trim(); if(!text){ document.getElementById('tText').focus(); return; }
  const dateStr=document.getElementById('tDate').value;
  const h=Number(document.getElementById('tHour').value); const m=Number(document.getElementById('tMin').value);
  const dt=new Date(dateStr+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00');
  const evIdVal=document.getElementById('tEvLink').value;
  const existingTask = taskModalMode === 'edit'
  ? tasks.find(t => t.id === editTaskId)
  : null;

const newDatetime = dt.toISOString();
const oldDatetime = existingTask ? existingTask.datetime : null;

const obj = {
  text,
  datetime: newDatetime,
  note: document.getElementById('tNote').value.trim(),
  evId: evIdVal ? Number(evIdVal) : null,
  done: existingTask ? !!existingTask.done : false,
  doneAt: existingTask ? (existingTask.doneAt || null) : null,

  // 通知日時を編集した場合は、古い再通知状態を解除する
  snoozedUntil: existingTask && oldDatetime === newDatetime
    ? (existingTask.snoozedUntil || null)
    : null,
};
    if(taskModalMode==='create'){
      obj.id = issueReminderId();
      addReminderData(obj);
    } else {
      obj.id = editTaskId;
      replaceReminderData(editTaskId, obj);
    }
    saveAll();
    closeTaskModal();
    renderTaskList();
    scheduleAllNotifications();
  });

// ── 通知スケジューリング（絶対時刻版）──
function scheduleEvNotification(ev, dk){
  const effectiveNotif = getEffectiveSelfMessageNotification(ev, dk);
  if (!effectiveNotif) return;

  // 自分へのメッセージ通知は「その日分だけ」予約する
  // 繰り返し予定の未来分を一気に通知予約しないための制限
  if(dk !== todayStr()) return;

  const evId = ev._baseId || ev.id;
  const baseEv = getBaseEventById(evId);
  if(!baseEv) return;

  const status = ensureSelfMessageStatus(baseEv, dk);
  if(status.done) return;
  if(status.bannerDismissedAt) return;

  const notifyDt = new Date(
    dk + 'T' +
    String(effectiveNotif.notifH).padStart(2,'0') + ':' +
    String(effectiveNotif.notifM || 0).padStart(2,'0') +
    ':00'
  );

  const delay = notifyDt - Date.now();
  if(delay < 0) return;

  requestWebNotificationPermission().then(perm => {
    if(perm === 'granted'){
      scheduleNotificationTimer(() => {
        const latestBaseEv = getBaseEventById(evId);
        if(!latestBaseEv) return;

        const latestStatus = ensureSelfMessageStatus(latestBaseEv, dk);
        if(latestStatus.done) return;
        if(latestStatus.bannerDismissedAt) return;

        showWebNotification(effectiveNotif.message || `${ev.title}はどうでしたか？`, {
          body: `📅 ${minToTime(ev.start)}〜${minToTime(ev.end)}`
        });

        updateSelfMessageBanner();
      }, delay);
    }
  });
}


function scheduleAlertTiming(ev, dk){
  const timing = ev.alertTiming || 'none';
  if(timing === 'none') return;

  // 予定の開始時刻（分）
  const startMin = ev.start;
  let notifyMin = null;

  if(timing === 'morning'){
    // 当日8:00
    notifyMin = 8 * 60;
  } else if(timing === '15min'){
    notifyMin = startMin - 15;
  } else if(timing === '30min'){
    notifyMin = startMin - 30;
  } else if(timing === '1h'){
    notifyMin = startMin - 60;
  } else if(timing === 'custom'){
    if(ev.alertH == null) return;
    notifyMin = ev.alertH * 60 + (ev.alertM || 0);
  }

  if(notifyMin == null || notifyMin < 0) return;

  const notifyH = Math.floor(notifyMin / 60);
  const notifyM = notifyMin % 60;
  if(notifyH > 23) return;

  const notifyDt = new Date(dk + 'T' + String(notifyH).padStart(2,'0') + ':' + String(notifyM).padStart(2,'0') + ':00');
  const delay = notifyDt - Date.now();
  if(delay < 0) return;

  requestWebNotificationPermission().then(perm=>{
    if(perm === 'granted'){
      setTimeout(()=>{
        showWebNotification(ev.alertMsg || `もうすぐ${ev.title}があります`, {
          body: `📅 ${minToTime(ev.start)}〜${minToTime(ev.end)}`
        });
      }, delay);
    }
  });
}

function scheduleAllNotifications(){
  if(!canUseWebNotification()) return;

  const todayKey = todayStr();
  const scheduled = new Set();

  allVisibleEvents().forEach(ev => {
    // 自分へのメッセージ通知は今日の予定分だけ予約する
    if(ev.dateKey !== todayKey) return;

    const key = `${ev._baseId || ev.id}::${ev.dateKey}`;
    if(scheduled.has(key)) return;
    scheduled.add(key);

    scheduleEvNotification(ev, ev.dateKey);
    scheduleAlertTiming(ev, ev.dateKey);
  });

  scheduleSelfMessageSnoozeNotifications();
  scheduleReminderNotifications();
  scheduleMorningNotification();
}

function scheduleMorningNotification(){
  if(!settings.morningNotif) return;
  const h = settings.morningNotifH || 8;
  const m = settings.morningNotifM || 0;

  [0, 1].forEach(offset => {
    const target = addDays(new Date(), offset);
    const dk = dateKey(target);
    const notifyDt = new Date(`${dk}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
    const delay = notifyDt - Date.now();
    if(delay < 0) return; // 既に時刻を過ぎていたらスキップ

    const dayEvents = allVisibleEvents()
      .filter(ev => ev.dateKey === dk)
      .sort((a, b) => a.start - b.start);
    if(dayEvents.length === 0) return;

    const label = offset === 0 ? '今日の予定' : '明日の予定';
    const body = dayEvents.map(ev => `・${minToTime(ev.start)} ${ev.title}`).join('\n');

    requestWebNotificationPermission().then(perm => {
      if(perm === 'granted'){
        setTimeout(() => {
          showWebNotification(label, { body });
        }, delay);
      }
    });
  });
}

// ── エクスポート / インポート ──
function exportData(){
  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),

    // 予定
    events,

    // リマインダー
    tasks,
    nextEvId,
    nextTId,

    // TODO
    todos,
    nextTodoId,

    // 設定
    settings
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');

  a.href = URL.createObjectURL(blob);
  a.download = `rounday-backup-${dateKey(new Date())}.json`;
  a.click();

  URL.revokeObjectURL(a.href);
}

function importData(file){
  if(!file) return;

  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);

      // 最低限のバリデーション
      if(!Array.isArray(data.events)) throw new Error('invalid events');
      if(!Array.isArray(data.tasks)) throw new Error('invalid tasks');

      const importedTodos = Array.isArray(data.todos) ? data.todos : [];
      const importedSettings = data.settings && typeof data.settings === 'object'
        ? data.settings
        : settings;

      const ok = confirm(
        `バックアップを復元します。\n\n` +
        `予定：${data.events.length}件\n` +
        `リマインダー：${data.tasks.length}件\n` +
        `TODO：${importedTodos.length}件\n\n` +
        `現在のデータは上書きされます。よろしいですか？`
      );

      if(!ok) return;

      // 予定
      events = data.events;
      nextEvId = data.nextEvId || 1;

      // リマインダー
      tasks = data.tasks;
      nextTId = data.nextTId || 1;

      // TODO
      todos = importedTodos;
      nextTodoId = data.nextTodoId || 1;

      // 設定
      settings = {
        weekStart: 0,
        timeStart: 0,
        timeEnd: 24,
        theme: 'ios-light',
        accent: 'blue',
        morningNotif: false,
        morningNotifH: 8,
        morningNotifM: 0,
        selfMessageSnoozeDefault: {
          type: 'day',
          hours: 3
        },
        reminderSnoozeDefault: {
          type: 'day',
          hours: 3
        },
        ...importedSettings
      };

      // 念のため、古いバックアップにない設定を補完
      if(!settings.selfMessageSnoozeDefault){
        settings.selfMessageSnoozeDefault = {
          type: 'day',
          hours: 3
        };
      }

      if(!settings.reminderSnoozeDefault){
        settings.reminderSnoozeDefault = {
          type: 'day',
          hours: 3
        };
      }

      saveAll();
      saveSettings();
      applyTheme(settings.theme || 'ios-light');
      applyAccent(settings.accent || 'blue');
      buildGrid();
      syncToolbarGutter();
      renderTaskList();
      renderTodoList();
      renderSelfMessagePanel();
      updateSelfMessageBanner();
      scheduleAllNotifications();

      alert('✅ 復元しました');
    } catch(err) {
      alert('❌ ファイルが正しくありません。Roundayのバックアップファイルを選択してください。');
    }
  };

  reader.readAsText(file);
}

scheduleAllNotifications();

// ── ナビゲーション ──
document.getElementById('prevBtn').addEventListener('click',()=>{
  anchorDate=addDays(anchorDate,-numDays);
  if(numDays===7) anchorDate=getWeekStart(anchorDate);
  buildGrid();
});
document.getElementById('nextBtn').addEventListener('click',()=>{
  anchorDate=addDays(anchorDate,numDays);
  if(numDays===7) anchorDate=getWeekStart(anchorDate);
  buildGrid();
});
document.getElementById('dayRange').addEventListener('input',function(){
  numDays=Number(this.value);
  document.getElementById('dayCountLabel').textContent=numDays;
  if(numDays===7) anchorDate=getWeekStart(anchorDate);
  buildGrid();
});

function scrollToNow(){ document.getElementById('scroll-area').scrollTop=Math.max(0,(new Date().getHours()-1-settings.timeStart))*SLOT_H; }
document.getElementById('dayRange').value = numDays;
document.getElementById('dayCountLabel').textContent = numDays;
// ── 左右スワイプで日付移動 ──
(function(){
  const el = document.getElementById('scroll-area');
  let sx = 0, sy = 0, tracking = false;
  el.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      e.preventDefault();
    }
  }, { passive: false });
  el.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      anchorDate = addDays(anchorDate, dx < 0 ? numDays : -numDays);
      buildGrid();
    }
  }, { passive: true });
})();

// ── カレンダーピッカー ──
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-indexed

function updateCalOpenBtn() {
  const m = String(calMonth + 1).padStart(2, '0');
  document.getElementById('calOpenBtn').textContent = `${calYear}/${m}`;
}

function renderCalPicker() {
  // 年セレクト（前後3年）
  const ySel = document.getElementById('calYear');
  const curY = new Date().getFullYear();
  ySel.innerHTML = '';
  for (let y = curY - 3; y <= curY + 3; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y + '年';
    if (y === calYear) o.selected = true;
    ySel.appendChild(o);
  }
  // 月セレクト
  const mSel = document.getElementById('calMonth');
  mSel.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const o = document.createElement('option');
    o.value = m; o.textContent = (m + 1) + '月';
    if (m === calMonth) o.selected = true;
    mSel.appendChild(o);
  }
  renderCalGrid();
}

function renderCalGrid() {
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';
  const dows = ['日','月','火','水','木','金','土'];
  dows.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow'; el.textContent = d;
    grid.appendChild(el);
  });
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayKey = dateKey(new Date());
  const anchorKey = dateKey(anchorDate);
  for (let i = 0; i < firstDow; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day';
    el.textContent = d;
    const dk = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (dk === todayKey) el.classList.add('is-today');
    if (dk === anchorKey) el.classList.add('is-anchor');
    el.addEventListener('click', () => {
      anchorDate = new Date(calYear, calMonth, d);
      buildGrid();
      updateCalOpenBtn();
      document.getElementById('calPickerOverlay').classList.remove('open');
    });
    grid.appendChild(el);
  }
}

document.getElementById('calOpenBtn').addEventListener('click', () => {
  // 現在表示中の年月をピッカーの初期値にする
  calYear = anchorDate.getFullYear();
  calMonth = anchorDate.getMonth();
  renderCalPicker();
  document.getElementById('calPickerOverlay').classList.add('open');
});
document.getElementById('calPickerClose').addEventListener('click', () => {
  document.getElementById('calPickerOverlay').classList.remove('open');
});
document.getElementById('calPickerOverlay').addEventListener('click', e => {
  if (e.target.id === 'calPickerOverlay')
    document.getElementById('calPickerOverlay').classList.remove('open');
});
document.getElementById('calYear').addEventListener('change', function() {
  calYear = Number(this.value); renderCalGrid();
});
document.getElementById('calMonth').addEventListener('change', function() {
  calMonth = Number(this.value); renderCalGrid();
});

// ── ドロワー ──
function openDrawer(){ document.getElementById('drawer').classList.add('open'); document.getElementById('drawerOverlay').classList.add('open'); }
function closeDrawer(){ document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerOverlay').classList.remove('open'); }
document.getElementById('menuBtn').addEventListener('click', openDrawer);
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
document.getElementById('drawerOverlay').addEventListener('click', closeDrawer);

document.getElementById('drawerSettings').addEventListener('click',()=>{ closeDrawer(); openSettingsModal(); });
document.getElementById('drawerReminder').addEventListener('click',()=>{ closeDrawer(); document.getElementById('taskPanel').classList.toggle('open'); renderTaskList(); });
document.getElementById('drawerBulkNotif').addEventListener('click',()=>{ closeDrawer(); openBulkNotifModal(); });
document.getElementById('drawerSelfMessage').addEventListener('click', () => {
  closeDrawer();
  openSelfMessagePanel();
});

document.getElementById('selfMessagePanelClose').addEventListener('click', closeSelfMessagePanel);

document.getElementById('selfMessageBannerClose').addEventListener('click', dismissSelfMessageBanner);

document.getElementById('selfMessageBannerDone').addEventListener('click', completeCurrentSelfMessageBanner);

document.getElementById('selfMessageBannerSnooze').addEventListener('click', openSelfMessageSnoozeModal);

document.getElementById('selfSnoozeClose').addEventListener('click', closeSelfMessageSnoozeModal);
document.getElementById('selfSnoozeCancel').addEventListener('click', closeSelfMessageSnoozeModal);
document.getElementById('selfSnoozeSave').addEventListener('click', applySelfMessageSnooze);

document.getElementById('selfSnoozeType').addEventListener('change', updateSelfSnoozeFields);

document.getElementById('selfSnoozeOverlay').addEventListener('click', e => {
  if (e.target.id === 'selfSnoozeOverlay') closeSelfMessageSnoozeModal();
});

// ── 設定モーダル ──
function populateSettingsTimeSelects() {
  const startSel = document.getElementById('settingsTimeStart');
  const endSel = document.getElementById('settingsTimeEnd');
  startSel.innerHTML = '';
  endSel.innerHTML = '';
  for (let h = 0; h <= 23; h++) {
    const o = document.createElement('option');
    o.value = h; o.textContent = String(h).padStart(2,'0') + ':00';
    startSel.appendChild(o);
  }
  for (let h = 1; h <= 24; h++) {
    const o = document.createElement('option');
    o.value = h; o.textContent = String(h).padStart(2,'0') + ':00';
    endSel.appendChild(o);
  }
}
populateSettingsTimeSelects();
populateNotifTimeSelects('morningNotifH', 'morningNotifM');

document.getElementById('morningNotifEnabled').addEventListener('change', function() {
  document.getElementById('morningNotifFields').style.display = this.checked ? 'flex' : 'none';
  settings.morningNotif = this.checked;
  saveSettings();
  scheduleAllNotifications();
});
document.getElementById('morningNotifH').addEventListener('change', function() {
  settings.morningNotifH = Number(this.value);
  saveSettings();
  scheduleAllNotifications();
});
document.getElementById('morningNotifM').addEventListener('change', function() {
  settings.morningNotifM = Number(this.value);
  saveSettings();
  scheduleAllNotifications();
});


function openSettingsModal() {
  // 週の開始曜日
  document.querySelectorAll('[data-ws]').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.ws) === settings.weekStart);
  });
  // 時間軸
  document.getElementById('settingsTimeStart').value = settings.timeStart;
  document.getElementById('settingsTimeEnd').value = settings.timeEnd;
  // 朝の通知
  document.getElementById('morningNotifEnabled').checked = settings.morningNotif || false;
  document.getElementById('morningNotifFields').style.display = settings.morningNotif ? 'flex' : 'none';
  document.getElementById('morningNotifH').value = settings.morningNotifH || 8;
  document.getElementById('morningNotifM').value = settings.morningNotifM || 0;
  // テーマボタンの状態を反映
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === (settings.theme || 'ios-light'));
  });
  document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accent === (settings.accent || 'blue'));
  });
  document.getElementById('settingsOverlay').classList.add('open');
}

document.querySelectorAll('[data-ws]').forEach(btn => {
  btn.addEventListener('click', () => {
    settings.weekStart = Number(btn.dataset.ws);
    document.querySelectorAll('[data-ws]').forEach(b => b.classList.toggle('active', Number(b.dataset.ws) === settings.weekStart));
    saveSettings();
    if(numDays===7) anchorDate=getWeekStart(anchorDate);
    buildGrid();
  });
});

document.getElementById('settingsTimeStart').addEventListener('change', function() {
  const v = Number(this.value);
  if (v >= settings.timeEnd) { this.value = settings.timeStart; return; }
  settings.timeStart = v; saveSettings(); buildGrid();
});
document.getElementById('settingsTimeEnd').addEventListener('change', function() {
  const v = Number(this.value);
  if (v <= settings.timeStart) { this.value = settings.timeEnd; return; }
  settings.timeEnd = v; saveSettings(); buildGrid();
});

document.getElementById('settingsExport').addEventListener('click', () => exportData());
document.getElementById('settingsImportFile').addEventListener('change', function() { importData(this.files[0]); this.value=''; });

document.getElementById('settingsClose').addEventListener('click',()=>{ document.getElementById('settingsOverlay').classList.remove('open'); });
document.getElementById('settingsDone').addEventListener('click',()=>{ document.getElementById('settingsOverlay').classList.remove('open'); });
document.getElementById('settingsOverlay').addEventListener('click',e=>{ if(e.target.id==='settingsOverlay') document.getElementById('settingsOverlay').classList.remove('open'); });
// ── テーマ適用 ──
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  settings.theme = theme;
  saveSettings();
}
function applyAccent(accent) {
  const allowed = ['blue', 'indigo', 'purple', 'pink', 'orange', 'green', 'teal', 'graphite'];
  const nextAccent = allowed.includes(accent) ? accent : 'blue';
  document.documentElement.setAttribute('data-accent', nextAccent);
  document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.accent === nextAccent);
  });
  settings.accent = nextAccent;
  saveSettings();
}

// テーマボタンのイベント
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

document.querySelectorAll('.accent-btn').forEach(btn => {
  btn.addEventListener('click', () => applyAccent(btn.dataset.accent));
});

// ページロード時にテーマを復元
function syncToolbarGutter() {
  const scroller = document.getElementById('scroll-area');
  if (!scroller) return;
  const gutter = Math.max(0, scroller.offsetWidth - scroller.clientWidth);
  document.documentElement.style.setProperty('--scrollbar-w', gutter + 'px');
}
window.addEventListener('resize', syncToolbarGutter);
applyTheme(settings.theme || 'ios-light');
applyAccent(settings.accent || 'blue');
buildGrid();
syncToolbarGutter();
scrollToNow();
renderSelfMessagePanel();
updateSelfMessageBanner();
setInterval(updateSelfMessageBanner, 60000);
