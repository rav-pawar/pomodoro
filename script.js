const STORAGE_KEY = 'pomodoro-sessions-by-day-v1';
const SETTINGS_KEY = 'pomodoro-settings-v1';
const START_HOUR = 8;
const END_HOUR = 12; // exclusive
const LONG_BREAK_INTERVAL = 4;

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
};

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
const settingsForm = document.getElementById('settings-form');
const focusInput = document.getElementById('focus-duration');
const shortBreakInput = document.getElementById('short-break-duration');
const longBreakInput = document.getElementById('long-break-duration');

initSettings();
initCalendar();
restoreState();
updateTimerDisplay(state.remainingSeconds);
updatePhaseDisplay();
updateCalendarDate();

startButton.addEventListener('click', handleStart);
pauseButton.addEventListener('click', handlePauseToggle);
resetButton.addEventListener('click', handleReset);
settingsForm.addEventListener('input', handleSettingsChange);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.isRunning) {
    state.lastTick = Date.now();
  }
});

function handleStart() {
  if (state.isRunning) return;

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
    state.focusSessionsToday = recordCompletedSession();
    sessionsCountEl.textContent = state.focusSessionsToday.toString();
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

function restoreState() {
  const sessionsByDay = loadSessions();
  const todayKey = currentDateKey();
  const data = sessionsByDay[todayKey] ?? createEmptySlots();

  updateCalendar(data);
  state.focusSessionsToday = Object.values(data).reduce(
    (sum, count) => sum + count,
    0,
  );
  sessionsCountEl.textContent = state.focusSessionsToday.toString();
}

function recordCompletedSession() {
  const sessionsByDay = loadSessions();
  const key = currentDateKey();

  if (!sessionsByDay[key]) {
    sessionsByDay[key] = createEmptySlots();
  }

  const now = new Date();
  const slotHour = now.getHours();

  if (slotHour >= START_HOUR && slotHour < END_HOUR) {
    sessionsByDay[key][slotHour] += 1;
    saveSessions(sessionsByDay);
    updateCalendar(sessionsByDay[key]);
    announceSessionCompletion(slotHour);
    return Object.values(sessionsByDay[key]).reduce((sum, count) => sum + count, 0);
  }

  alert(
    'Session completed outside of 8 AM – 12 PM. It will not appear in the morning timeline.',
  );
  return Object.values(sessionsByDay[key]).reduce((sum, count) => sum + count, 0);
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
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  calendarDateEl.textContent = formatter.format(new Date());
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
