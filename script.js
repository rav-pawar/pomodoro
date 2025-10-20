const POMODORO_MINUTES = 25;
const POMODORO_SECONDS = POMODORO_MINUTES * 60;
const STORAGE_KEY = 'pomodoro-sessions-by-day-v1';
const START_HOUR = 8;
const END_HOUR = 12; // exclusive

const state = {
  remainingSeconds: POMODORO_SECONDS,
  timerId: null,
  isRunning: false,
  lastTick: null,
};

const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const resetButton = document.getElementById('reset');
const sessionsCountEl = document.getElementById('sessions-count');
const calendarRowsEl = document.getElementById('calendar-rows');
const rowTemplate = document.getElementById('calendar-row-template');

initCalendar();
restoreState();
updateTimerDisplay(state.remainingSeconds);

startButton.addEventListener('click', handleStart);
pauseButton.addEventListener('click', handlePauseToggle);
resetButton.addEventListener('click', handleReset);

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
  tick();
}

function handlePauseToggle() {
  if (!state.isRunning) {
    // resume
    state.isRunning = true;
    pauseButton.textContent = 'Pause';
    startButton.disabled = true;
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
  state.remainingSeconds = POMODORO_SECONDS;
  state.lastTick = null;
  startButton.disabled = false;
  pauseButton.disabled = true;
  pauseButton.textContent = 'Pause';
  updateTimerDisplay(state.remainingSeconds);
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
    completeSession();
    return;
  }

  state.timerId = window.setTimeout(tick, 250);
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

function completeSession() {
  window.clearTimeout(state.timerId);
  state.timerId = null;
  state.isRunning = false;
  state.remainingSeconds = POMODORO_SECONDS;
  state.lastTick = null;
  startButton.disabled = false;
  pauseButton.disabled = true;
  pauseButton.textContent = 'Pause';
  updateTimerDisplay(state.remainingSeconds);

  recordCompletedSession();
}

function initCalendar() {
  calendarRowsEl.innerHTML = '';

  for (let hour = START_HOUR; hour < END_HOUR; hour += 1) {
    const clone = rowTemplate.content.cloneNode(true);
    const row = clone.querySelector('.calendar-row');
    const timeCell = clone.querySelector('.time-cell');
    const sessionCell = clone.querySelector('.session-cell');
    const countSpan = clone.querySelector('.session-count');

    const label = formatHourLabel(hour);
    row.dataset.hour = hour;
    timeCell.textContent = label;
    sessionCell.dataset.progress = '0';
    sessionCell.style.setProperty('--progress', 0);
    countSpan.textContent = '0';
    calendarRowsEl.appendChild(clone);
  }
}

function restoreState() {
  const sessionsByDay = loadSessions();
  const todayKey = currentDateKey();
  const data = sessionsByDay[todayKey] ?? createEmptySlots();

  updateCalendar(data);
  sessionsCountEl.textContent = Object.values(data).reduce(
    (sum, count) => sum + count,
    0,
  );
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
    announceSessionCompletion(slotHour);
  } else {
    alert(
      'Session completed outside of 8 AM – 12 PM. It will not appear in the morning calendar.',
    );
  }

  updateCalendar(sessionsByDay[key]);
  sessionsCountEl.textContent = Object.values(sessionsByDay[key]).reduce(
    (sum, count) => sum + count,
    0,
  );
}

function updateCalendar(data) {
  const rows = calendarRowsEl.querySelectorAll('.calendar-row');
  rows.forEach((row) => {
    const hour = Number(row.dataset.hour);
    const count = data[hour] ?? 0;
    const cell = row.querySelector('.session-cell');
    const countEl = row.querySelector('.session-count');

    const progress = Math.min(count / 4, 1); // assume 4 pomodoros max visual fill
    cell.dataset.progress = progress.toFixed(2);
    cell.style.setProperty('--progress', progress.toFixed(2));
    countEl.textContent = count.toString();
  });
}

function announceSessionCompletion(hour) {
  const label = formatHourLabel(hour);
  const message = `Great job! Pomodoro completed and logged for ${label}.`;
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
