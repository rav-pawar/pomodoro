const STORAGE_KEY = 'pomodoro-sessions-by-day-v1';
const SETTINGS_KEY = 'pomodoro-settings-v1';
const START_HOUR = 0;
const END_HOUR = 24; // exclusive
const LONG_BREAK_INTERVAL = 4;
const DAY_ROLLOVER_INTERVAL_MS = 60_000;

const DEFAULT_SETTINGS = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

const state = {
  remainingSeconds: 0,
  timerId: null,
  isRunning: false,
  lastTick: null,
  phase: 'focus',
  focusSessionsToday: 0,
  focusSessionsInCycle: 0,
  durations: { ...DEFAULT_SETTINGS },
  dateKey: currentDateKey(),
  viewDateKey: currentDateKey(),
};

let statusTimeoutId = null;

const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const phaseLabelEl = document.getElementById('phase-label');
const upcomingLabelEl = document.getElementById('upcoming-label');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const resetButton = document.getElementById('reset');
const sessionsCountEl = document.getElementById('sessions-count');
const calendarRowsEl = document.getElementById('calendar-rows');
const rowTemplate = document.getElementById('hour-row-template');
const calendarDateEl = document.getElementById('calendar-date');
const prevDayButton = document.getElementById('prev-day');
const nextDayButton = document.getElementById('next-day');
const todayButton = document.getElementById('today-button');
const settingsForm = document.getElementById('settings-form');
const focusInput = document.getElementById('focus-duration');
const shortBreakInput = document.getElementById('short-break-duration');
const longBreakInput = document.getElementById('long-break-duration');
const statusBanner = document.getElementById('status-banner');

initSettings();
initCalendar();
loadDayState(state.viewDateKey);
updateTimerDisplay(state.remainingSeconds);
updatePhaseDisplay();
updateCalendarDate();
updateNavigationState();
scheduleDayRolloverCheck();
showStatus('');

startButton.addEventListener('click', handleStart);
pauseButton.addEventListener('click', handlePauseToggle);
resetButton.addEventListener('click', handleReset);
settingsForm.addEventListener('input', handleSettingsChange);
if (prevDayButton) {
  prevDayButton.addEventListener('click', () => shiftViewByDays(-1));
}
if (nextDayButton) {
  nextDayButton.addEventListener('click', () => shiftViewByDays(1));
}
if (todayButton) {
  todayButton.addEventListener('click', () => setViewDate(state.dateKey));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.isRunning) {
    state.lastTick = Date.now();
  }

  if (!document.hidden) {
    ensureTodayState({ announce: true });
  }
});

function handleStart() {
  if (state.isRunning) return;

  if (state.remainingSeconds <= 0) {
    state.remainingSeconds = durationFor(state.phase);
    updateTimerDisplay(state.remainingSeconds);
  }

  state.isRunning = true;
  startButton.disabled = true;
  pauseButton.disabled = false;
  pauseButton.textContent = 'Pause';
  state.lastTick = null;
  tick();
}

function handlePauseToggle() {
  if (!state.isRunning) {
    // resume current phase
    state.isRunning = true;
    startButton.disabled = true;
    pauseButton.disabled = false;
    pauseButton.textContent = 'Pause';
    state.lastTick = null;
    tick();
    return;
  }

  window.clearTimeout(state.timerId);
  state.timerId = null;
  state.isRunning = false;
  state.lastTick = null;
  pauseButton.textContent = 'Resume';
  startButton.disabled = false;
  pauseButton.disabled = false;
  updatePhaseDisplay();
}

function handleReset() {
  window.clearTimeout(state.timerId);
  state.timerId = null;
  state.isRunning = false;
  state.lastTick = null;
  state.phase = 'focus';
  state.focusSessionsInCycle = 0;
  state.remainingSeconds = durationFor('focus');
  startButton.disabled = false;
  pauseButton.disabled = true;
  pauseButton.textContent = 'Pause';
  updateTimerDisplay(state.remainingSeconds);
  updatePhaseDisplay();
  showStatus('');
}

function handleSettingsChange(event) {
  if (!(event.target instanceof HTMLInputElement)) return;

  const updated = {
    focus: normalizeMinutes(focusInput.value, DEFAULT_SETTINGS.focus),
    shortBreak: normalizeMinutes(
      shortBreakInput.value,
      DEFAULT_SETTINGS.shortBreak,
    ),
    longBreak: normalizeMinutes(longBreakInput.value, DEFAULT_SETTINGS.longBreak),
  };

  state.durations = updated;
  focusInput.value = state.durations.focus.toString();
  shortBreakInput.value = state.durations.shortBreak.toString();
  longBreakInput.value = state.durations.longBreak.toString();
  saveSettings(updated);
  const currentDuration = durationFor(state.phase);

  if (state.isRunning) {
    state.remainingSeconds = Math.min(state.remainingSeconds, currentDuration);
  } else {
    state.remainingSeconds = currentDuration;
  }

  updateTimerDisplay(state.remainingSeconds);
  updatePhaseDisplay();
}

function tick() {
  const now = Date.now();

  if (!state.lastTick) {
    state.lastTick = now;
  }

  const elapsed = Math.floor((now - state.lastTick) / 1000);

  if (elapsed >= 1) {
    state.remainingSeconds = Math.max(0, state.remainingSeconds - elapsed);
    state.lastTick = now;
    updateTimerDisplay(state.remainingSeconds);
  }

  if (state.remainingSeconds <= 0) {
    completePhase();
    return;
  }

  state.timerId = window.setTimeout(tick, 250);
}

function completePhase() {
  window.clearTimeout(state.timerId);
  state.timerId = null;
  state.isRunning = false;
  state.lastTick = null;

  if (state.phase === 'focus') {
    recordCompletedSession();
    state.focusSessionsInCycle += 1;
    const useLongBreak = state.focusSessionsInCycle >= LONG_BREAK_INTERVAL;
    if (useLongBreak) {
      state.focusSessionsInCycle = 0;
    }
    const nextPhase = useLongBreak ? 'longBreak' : 'shortBreak';
    transitionToPhase(nextPhase, true);
  } else {
    transitionToPhase('focus', true);
  }
}

function transitionToPhase(nextPhase, autoStart) {
  state.phase = nextPhase;
  state.remainingSeconds = durationFor(nextPhase);
  state.lastTick = null;
  updateTimerDisplay(state.remainingSeconds);
  updatePhaseDisplay();

  if (autoStart) {
    state.isRunning = true;
    startButton.disabled = true;
    pauseButton.disabled = false;
    pauseButton.textContent = 'Pause';
    tick();
  } else {
    state.isRunning = false;
    startButton.disabled = false;
    pauseButton.disabled = true;
    pauseButton.textContent = 'Pause';
  }
}

function updateTimerDisplay(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');

  minutesEl.textContent = minutes;
  secondsEl.textContent = seconds;
}

function updatePhaseDisplay() {
  const labelMap = {
    focus: 'Focus Session',
    shortBreak: 'Short Break',
    longBreak: 'Long Break',
  };

  phaseLabelEl.textContent = labelMap[state.phase];
  phaseLabelEl.dataset.phase = state.phase;

  const nextPhase = computeNextPhase();
  if (nextPhase) {
    const nextLabel = labelMap[nextPhase];
    const durationMinutes = durationFor(nextPhase) / 60;
    upcomingLabelEl.textContent = `Next: ${nextLabel} · ${durationMinutes} min`;
  } else {
    upcomingLabelEl.textContent = '';
  }

  if (!state.isRunning) {
    const label = state.phase === 'focus' ? 'Start Focus' : 'Start Break';
    startButton.textContent = label;
  }
}

function computeNextPhase() {
  if (state.phase === 'focus') {
    const willTriggerLongBreak =
      state.focusSessionsInCycle >= LONG_BREAK_INTERVAL - 1;
    return willTriggerLongBreak ? 'longBreak' : 'shortBreak';
  }

  return 'focus';
}

function durationFor(phase) {
  switch (phase) {
    case 'shortBreak':
      return state.durations.shortBreak * 60;
    case 'longBreak':
      return state.durations.longBreak * 60;
    default:
      return state.durations.focus * 60;
  }
}

function initSettings() {
  const saved = loadSettings();
  state.durations = { ...DEFAULT_SETTINGS, ...saved };

  focusInput.value = state.durations.focus.toString();
  shortBreakInput.value = state.durations.shortBreak.toString();
  longBreakInput.value = state.durations.longBreak.toString();

  state.remainingSeconds = durationFor('focus');
}

function initCalendar() {
  calendarRowsEl.innerHTML = '';

  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    const fragment = rowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.hour-row');
    const label = fragment.querySelector('.hour-label');
    const chips = fragment.querySelector('.session-chips');
    const count = fragment.querySelector('.hour-count');

    row.dataset.hour = hour.toString();
    label.textContent = formatHourLabel(hour);
    chips.innerHTML = '';
    count.textContent = '0';
    calendarRowsEl.appendChild(fragment);
  }
}

function loadDayState(key) {
  const sessionsByDay = loadSessions();
  const data = normalizeSlots(sessionsByDay[key]);

  if (key === state.viewDateKey) {
    updateCalendar(data);
  }

  const totalForDay = countSessions(data);
  refreshFocusCount(totalForDay, key);
}

function recordCompletedSession() {
  ensureTodayState();
  const sessionsByDay = loadSessions();
  const key = state.dateKey;
  const now = new Date();
  const slotHour = now.getHours();

  const dayData = normalizeSlots(sessionsByDay[key]);
  dayData[slotHour] = (dayData[slotHour] ?? 0) + 1;
  sessionsByDay[key] = dayData;
  saveSessions(sessionsByDay);

  if (state.viewDateKey === key) {
    updateCalendar(dayData);
  }

  const total = countSessions(dayData);
  refreshFocusCount(total, key);
  showStatus(`Focus session logged for ${formatHourLabel(slotHour)}.`, 'success');
  announceSessionCompletion(slotHour);
  return total;
}

function updateCalendar(data) {
  const rows = calendarRowsEl.querySelectorAll('.hour-row');
  rows.forEach((row) => {
    const hour = Number(row.dataset.hour);
    const count = data[hour] ?? 0;
    const chipsContainer = row.querySelector('.session-chips');
    const countEl = row.querySelector('.hour-count');

    chipsContainer.innerHTML = '';

    for (let index = 0; index < count; index += 1) {
      const chip = document.createElement('span');
      chip.className = 'session-chip';
      chip.setAttribute(
        'aria-label',
        `Focus session ${index + 1} completed during this hour`,
      );
      chip.setAttribute('role', 'listitem');
      chip.textContent = `${index + 1}`;
      chipsContainer.appendChild(chip);
    }

    countEl.textContent = count.toString();
  });
}

function refreshFocusCount(total, key) {
  if (key === state.viewDateKey) {
    sessionsCountEl.textContent = total.toString();
  }

  if (key === state.dateKey) {
    state.focusSessionsToday = total;
  }
}

function countSessions(slots) {
  return Object.values(slots).reduce((sum, count) => sum + count, 0);
}

function shiftViewByDays(days) {
  if (!Number.isFinite(days) || days === 0) {
    return;
  }

  const targetDate = dateFromKey(state.viewDateKey);
  targetDate.setDate(targetDate.getDate() + days);
  const nextKey = keyFromDate(targetDate);

  if (compareDateKeys(nextKey, state.dateKey) > 0) {
    return;
  }

  setViewDate(nextKey);
}

function setViewDate(key) {
  if (!key) {
    key = state.dateKey;
  }

  if (compareDateKeys(key, state.dateKey) > 0) {
    key = state.dateKey;
  }

  if (state.viewDateKey === key) {
    loadDayState(key);
    updateCalendarDate();
    updateNavigationState();
    return;
  }

  state.viewDateKey = key;
  loadDayState(key);
  updateCalendarDate();
  updateNavigationState();
}

function updateNavigationState() {
  if (nextDayButton) {
    nextDayButton.disabled = compareDateKeys(state.viewDateKey, state.dateKey) >= 0;
  }

  if (todayButton) {
    todayButton.disabled = state.viewDateKey === state.dateKey;
  }
}

function showStatus(message, tone = 'info') {
  if (!statusBanner) return;

  window.clearTimeout(statusTimeoutId);

  if (!message) {
    statusBanner.textContent = '';
    statusBanner.dataset.tone = '';
    statusBanner.classList.remove('is-visible', 'status-info', 'status-success', 'status-warning');
    statusBanner.hidden = true;
    statusTimeoutId = null;
    return;
  }

  statusBanner.hidden = false;
  statusBanner.textContent = message;
  statusBanner.dataset.tone = tone;
  statusBanner.classList.remove('status-info', 'status-success', 'status-warning');
  statusBanner.classList.add('is-visible', `status-${tone}`);
  statusTimeoutId = window.setTimeout(() => {
    showStatus('');
  }, 12000);
}

function announceSessionCompletion(hour) {
  const label = formatHourLabel(hour);
  const message = `Great job! Focus session logged for ${label}.`;
  window.requestAnimationFrame(() => {
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.className = 'sr-only';
    liveRegion.textContent = message;
    document.body.appendChild(liveRegion);
    window.setTimeout(() => {
      liveRegion.remove();
    }, 1000);
  });
}

function updateCalendarDate() {
  const viewDate = dateFromKey(state.viewDateKey);
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const formatted = formatter.format(viewDate);
  const suffix = state.viewDateKey === state.dateKey ? ' · Today' : '';
  calendarDateEl.textContent = `${formatted}${suffix}`;
}

function scheduleDayRolloverCheck() {
  window.setInterval(() => {
    ensureTodayState({ announce: true });
  }, DAY_ROLLOVER_INTERVAL_MS);
}

function ensureTodayState({ announce = false } = {}) {
  const todayKey = currentDateKey();

  if (todayKey === state.dateKey) {
    return false;
  }

  const previousToday = state.dateKey;
  state.dateKey = todayKey;
  state.focusSessionsInCycle = 0;
  const sessionsByDay = loadSessions();
  const todaysData = normalizeSlots(sessionsByDay[todayKey]);

  if (state.viewDateKey === previousToday) {
    state.viewDateKey = todayKey;
  }

  refreshFocusCount(countSessions(todaysData), todayKey);

  if (state.viewDateKey === todayKey) {
    updateCalendar(todaysData);
  } else {
    loadDayState(state.viewDateKey);
  }

  updateCalendarDate();
  updateNavigationState();

  if (announce) {
    const message =
      state.viewDateKey === state.dateKey
        ? 'A new day has started. The timeline has been reset for today.'
        : 'A new day has started. Jump to today to review your latest sessions.';
    showStatus(message, 'info');
  }

  return true;
}

function loadSessions() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to load stored sessions', error);
    return {};
  }
}

function saveSessions(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save sessions', error);
  }
}

function createEmptySlots() {
  const slots = {};
  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    slots[hour] = 0;
  }
  return slots;
}

function normalizeSlots(rawSlots = {}) {
  const slots = createEmptySlots();

  if (!rawSlots || typeof rawSlots !== 'object') {
    return slots;
  }

  Object.entries(rawSlots).forEach(([hour, value]) => {
    const numericHour = Number(hour);
    if (Number.isFinite(numericHour) && numericHour >= START_HOUR && numericHour < END_HOUR) {
      const numericValue = Number(value);
      slots[numericHour] = Number.isFinite(numericValue) ? numericValue : 0;
    }
  });

  return slots;
}

function formatHourLabel(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function currentDateKey() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
}

function dateFromKey(key) {
  const [year, month, day] = key.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date();
  date.setFullYear(year, (month ?? 1) - 1, day ?? 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function keyFromDate(date) {
  const normalized = new Date(date.getTime());
  normalized.setHours(0, 0, 0, 0);
  return [normalized.getFullYear(), normalized.getMonth() + 1, normalized.getDate()].join('-');
}

function compareDateKeys(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const dateA = dateFromKey(a).getTime();
  const dateB = dateFromKey(b).getTime();
  if (dateA === dateB) return 0;
  return dateA > dateB ? 1 : -1;
}

function loadSettings() {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to load settings', error);
    return {};
  }
}

function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings', error);
  }
}

function normalizeMinutes(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}
