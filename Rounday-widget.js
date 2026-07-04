// Rounday widget for Scriptable.
// Put rounday-widget.json in iCloud Drive/Scriptable, then run this script as a widget.

const DATA_FILE = 'rounday-widget.json';
const ROUNDAY_URL = 'https://yu-fukushima1211.github.io/Rounday/';
const fm = FileManager.iCloud();
const data = await readRoundayData();
const today = new Date();
const todayKey = dateKey(today);
const widget = await createWidget(data);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}

Script.complete();

async function readRoundayData() {
  const paths = [
    fm.joinPath(fm.documentsDirectory(), DATA_FILE),
    fm.joinPath(fm.joinPath(fm.documentsDirectory(), 'Rounday'), DATA_FILE),
  ];

  for (const path of paths) {
    if (!fm.fileExists(path)) continue;
    if (!fm.isFileDownloaded(path)) await fm.downloadFileFromiCloud(path);
    return JSON.parse(fm.readString(path));
  }

  return null;
}

async function createWidget(rounday) {
  const w = new ListWidget();
  w.url = ROUNDAY_URL;
  w.backgroundColor = new Color('#f9f9f7');
  w.setPadding(14, 14, 14, 14);

  if (!rounday) {
    addTitle(w, 'Rounday');
    addMuted(w, 'rounday-widget.json がありません');
    addMuted(w, 'Scriptable フォルダに保存してください');
    return w;
  }

  const events = eventsForDate(rounday.events || [], todayKey)
    .sort((a, b) => (a.start || 0) - (b.start || 0));
  const reminders = activeReminders(rounday.tasks || []);
  const todos = activeTodos(rounday.todos || []);

  addHeader(w, rounday.exportedAt);
  w.addSpacer(8);

  const maxEvents = config.widgetFamily === 'large' ? 7 : config.widgetFamily === 'medium' ? 4 : 2;
  const maxReminders = config.widgetFamily === 'large' ? 4 : 2;
  const maxTodos = config.widgetFamily === 'large' ? 4 : config.widgetFamily === 'medium' ? 2 : 0;

  addSection(w, '今日の予定', events, maxEvents, eventLine, '予定なし');

  if (config.widgetFamily !== 'small') {
    w.addSpacer(8);
    addSection(w, 'リマインダー', reminders, maxReminders, reminderLine, '未完了なし');
  }

  if (maxTodos > 0) {
    w.addSpacer(8);
    addSection(w, 'TODO', todos, maxTodos, todoLine, '未完了なし');
  }

  return w;
}

function addHeader(w, exportedAt) {
  const row = w.addStack();
  row.centerAlignContent();

  const title = row.addText('Rounday');
  title.font = Font.semiboldSystemFont(15);
  title.textColor = new Color('#111110');

  row.addSpacer();

  const date = row.addText(formatDay(new Date()));
  date.font = Font.mediumSystemFont(12);
  date.textColor = new Color('#888884');

  if (exportedAt && config.widgetFamily !== 'small') {
    w.addSpacer(2);
    addMuted(w, `更新 ${formatShortTime(new Date(exportedAt))}`);
  }
}

function addTitle(w, text) {
  const t = w.addText(text);
  t.font = Font.semiboldSystemFont(15);
  t.textColor = new Color('#111110');
}

function addMuted(w, text) {
  const t = w.addText(text);
  t.font = Font.systemFont(11);
  t.textColor = new Color('#888884');
  t.lineLimit = 1;
}

function addSection(w, title, items, max, renderLine, emptyText) {
  const heading = w.addText(title);
  heading.font = Font.mediumSystemFont(10);
  heading.textColor = new Color('#888884');

  if (items.length === 0) {
    addMuted(w, emptyText);
    return;
  }

  items.slice(0, max).forEach(item => renderLine(w, item));

  if (items.length > max) {
    addMuted(w, `+${items.length - max}`);
  }
}

function eventLine(w, ev) {
  const row = w.addStack();
  row.centerAlignContent();

  const dot = row.addText('●');
  dot.font = Font.systemFont(8);
  dot.textColor = new Color(validColor(ev.color, '#111110'));

  row.addSpacer(5);

  const time = row.addText(`${minToTime(ev.start)} `);
  time.font = Font.mediumSystemFont(11);
  time.textColor = new Color('#888884');

  const title = row.addText(ev.title || 'Untitled');
  title.font = Font.systemFont(12);
  title.textColor = new Color('#111110');
  title.lineLimit = 1;
}

function reminderLine(w, task) {
  const row = w.addStack();
  row.centerAlignContent();

  const when = new Date(task.snoozedUntil || task.datetime);
  const time = row.addText(`${formatTaskTime(when)} `);
  time.font = Font.mediumSystemFont(11);
  time.textColor = new Color('#888884');

  const text = row.addText(task.text || 'Reminder');
  text.font = Font.systemFont(12);
  text.textColor = new Color('#111110');
  text.lineLimit = 1;
}

function todoLine(w, todo) {
  const row = w.addStack();
  row.centerAlignContent();

  const mark = row.addText('□');
  mark.font = Font.systemFont(11);
  mark.textColor = new Color('#888884');

  row.addSpacer(5);

  const text = row.addText(todo.text || 'TODO');
  text.font = Font.systemFont(12);
  text.textColor = new Color('#111110');
  text.lineLimit = 1;
}

function eventsForDate(events, dk) {
  const result = [];
  for (const ev of events) {
    if (ev.repeat && ev.repeat.type && ev.repeat.type !== 'none') {
      const expanded = expandRepeatingEvent(ev, dk);
      if (expanded) result.push(expanded);
    } else if (ev.dateKey === dk) {
      result.push(ev);
    }
  }
  return result;
}

function expandRepeatingEvent(ev, dk) {
  const repeat = ev.repeat || {};
  if ((ev.excludeDates || []).includes(dk)) return null;
  if (!repeat.from || !repeat.to || dk < repeat.from || dk > repeat.to) return null;

  const cur = new Date(`${dk}T00:00:00`);
  const from = new Date(`${repeat.from}T00:00:00`);
  const dow = cur.getDay();
  let match = false;

  if (repeat.type === 'weekly') {
    match = (repeat.weekdays || []).includes(dow);
  } else if (repeat.type === 'nweekly') {
    const diffDays = Math.round((cur - from) / 86400000);
    const weekNum = Math.floor(diffDays / 7);
    match = weekNum % Math.max(1, Number(repeat.interval) || 1) === 0
      && (repeat.weekdays || []).includes(dow);
  } else if (repeat.type === 'monthly_dow' && dow === repeat.monthDow) {
    const weekOfMonth = Math.ceil(cur.getDate() / 7);
    const weeks = repeat.monthWeeks && repeat.monthWeeks.length > 0
      ? repeat.monthWeeks
      : repeat.monthWeek ? [repeat.monthWeek] : [];
    match = weeks.includes(weekOfMonth);
  }

  return match ? { ...ev, dateKey: dk } : null;
}

function activeReminders(tasks) {
  const now = new Date();
  return tasks
    .filter(task => !task.done)
    .filter(task => task.datetime || task.snoozedUntil)
    .sort((a, b) => new Date(a.snoozedUntil || a.datetime) - new Date(b.snoozedUntil || b.datetime))
    .filter(task => new Date(task.snoozedUntil || task.datetime) >= new Date(now.getTime() - 86400000));
}

function activeTodos(todos) {
  return todos
    .filter(todo => !todo.done)
    .sort((a, b) => {
      if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return (a.id || 0) - (b.id || 0);
    });
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function minToTime(m) {
  const n = Number(m) || 0;
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

function formatDay(d) {
  const dows = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()} ${dows[d.getDay()]}`;
}

function formatShortTime(d) {
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTaskTime(d) {
  if (Number.isNaN(d.getTime())) return '--:--';
  if (dateKey(d) === todayKey) return formatShortTime(d);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function validColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}
