const STORAGE_KEY = 'fitlog.v1';
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const ICONS = { 가슴: '✳', 등: '↗', 어깨: '◉', 하체: '▰', 팔: '✦', 복근: '⌁', 유산소: '↝', 기타: '＋' };

const blankData = () => ({ profile: { weight: '', height: '', age: '' }, entries: [] });
let appData = loadData();
let toastTimer;
let editingEntryId = null;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      return {
        profile: { ...blankData().profile, ...(saved.profile || {}) },
        entries: Array.isArray(saved.entries) ? saved.entries.map((entry) => {
          if (Array.isArray(entry.sets)) return entry;
          const count = Math.max(1, Number(entry.sets) || 1);
          return {
            ...entry,
            sets: Array.from({ length: count }, () => ({ weight: entry.weight || '', reps: Number(entry.reps) || 10 })),
          };
        }) : [],
      };
    }
  } catch (error) {
    console.warn('저장된 기록을 불러오지 못했습니다.', error);
  }
  return blankData();
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); }
  catch (error) { showToast('저장 공간이 부족해요.'); console.warn(error); }
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateLabel(value, options = { month: 'long', day: 'numeric', weekday: 'short' }) {
  return new Intl.DateTimeFormat('ko-KR', options).format(parseLocalDate(value));
}

function weekStart(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start;
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function sortedEntries(entries = appData.entries) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function weekEntries() {
  const start = weekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return appData.entries.filter((entry) => {
    const date = parseLocalDate(entry.date);
    return date >= start && date < end;
  });
}

function setCount(entry) {
  return Array.isArray(entry.sets) ? entry.sets.length : Number(entry.sets || 0);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderHeader() {
  const today = new Date();
  setText('today-label', new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(today));
  const start = weekStart(today);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  setText('week-range', `${start.getMonth() + 1}.${start.getDate()} — ${end.getMonth() + 1}.${end.getDate()}`);
}

function renderProfileSummary() {
  const { weight, height, age } = appData.profile;
  setText('home-weight', weight ? Number(weight).toFixed(Number(weight) % 1 ? 1 : 0) : '--');
  setText('home-height', height ? Number(height).toLocaleString('ko-KR') : '--');
  setText('home-age', age ? Number(age).toLocaleString('ko-KR') : '--');
  const bmi = Number(weight) > 0 && Number(height) > 0 ? Number(weight) / ((Number(height) / 100) ** 2) : null;
  setText('home-bmi', bmi ? bmi.toFixed(1) : '--');
  document.getElementById('profile-weight').value = weight;
  document.getElementById('profile-height').value = height;
  document.getElementById('profile-age').value = age;
}

function renderNutritionGuide() {
  const container = document.getElementById('nutrition-targets');
  const weight = Number(appData.profile.weight);
  const age = Number(appData.profile.age);
  if (!weight || !age) {
    container.innerHTML = '<div class="nutrition-empty">몸무게와 나이를 저장하면 성인 운동 기준의 하루 섭취 참고량을 계산해 드려요.</div>';
    return;
  }
  if (age < 18) {
    container.innerHTML = '<div class="nutrition-empty">섭취 기준은 성장기와 성인에서 달라요. 현재 계산은 만 18세 이상 운동하는 성인을 대상으로 표시합니다.</div>';
    return;
  }
  const proteinLow = Math.round(weight * 1.4);
  const proteinHigh = Math.round(weight * 2.0);
  const waterLow = (weight * 0.03).toFixed(1);
  const waterHigh = (weight * 0.035).toFixed(1);
  const carbLow = Math.round(weight * 3);
  const carbHigh = Math.round(weight * 5);
  container.innerHTML = `<div class="nutrition-list">
    <div class="nutrition-card"><span class="nutrition-mark" aria-hidden="true">P</span><span class="nutrition-name"><strong>단백질</strong><small>1.4–2.0 g / 체중 kg</small></span><strong class="nutrition-value">${proteinLow.toLocaleString('ko-KR')}–${proteinHigh.toLocaleString('ko-KR')}<small>g / 하루</small></strong></div>
    <div class="nutrition-card"><span class="nutrition-mark" aria-hidden="true">H₂O</span><span class="nutrition-name"><strong>수분</strong><small>30–35 mL / 체중 kg</small></span><strong class="nutrition-value">${waterLow}–${waterHigh}<small>L / 하루</small></strong></div>
    <div class="nutrition-card"><span class="nutrition-mark" aria-hidden="true">C</span><span class="nutrition-name"><strong>탄수화물</strong><small>3–5 g / 체중 kg · 낮은 운동량 기준</small></span><strong class="nutrition-value">${carbLow.toLocaleString('ko-KR')}–${carbHigh.toLocaleString('ko-KR')}<small>g / 하루</small></strong></div>
  </div>`;
}

function renderWeek() {
  const entries = weekEntries();
  const dates = new Set(entries.map((entry) => entry.date));
  const totalSets = entries.reduce((sum, entry) => sum + setCount(entry), 0);
  setText('week-workout-count', dates.size);
  setText('week-sessions', dates.size);
  setText('week-sets', totalSets);
  setText('week-exercises', entries.length);
  const monday = weekStart();
  const today = localDate();
  document.getElementById('week-bars').innerHTML = DAY_LABELS.map((label, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    const key = localDate(date);
    const count = entries.filter((entry) => entry.date === key).length;
    const height = count ? Math.min(27, 9 + count * 6) : 4;
    return `<div class="day-bar ${count ? 'active' : ''} ${key === today ? 'today' : ''}" aria-label="${label}요일 ${count ? `${count}개 운동 기록` : '기록 없음'}"><i style="height:${height}px"></i><span>${label}</span></div>`;
  }).join('');
}

function emptyState(title, description, action = '') {
  return `<div class="empty-state"><span class="empty-illustration" aria-hidden="true">＋</span><strong>${title}</strong><p>${description}</p>${action ? `<button data-open-workout>${action}</button>` : ''}</div>`;
}

function entryCard(entry, deletable = false) {
  const setDetails = (entry.sets || []).map((set, index) => {
    const weight = set.weight ? `${escapeHTML(set.weight)}kg × ` : '';
    return `${index + 1}세트 ${weight}${escapeHTML(set.reps)}회`;
  }).join(' · ');
  const note = entry.note ? `<span class="entry-note">${escapeHTML(entry.note)}</span>` : '';
  return `<article class="entry-card"><button class="entry-open" type="button" data-edit-entry="${escapeHTML(entry.id)}" aria-label="${escapeHTML(entry.name)} 운동 기록 수정"><span class="entry-glyph" aria-hidden="true">${ICONS[entry.category] || '✳'}</span><span class="entry-content"><span class="entry-title-row"><span class="entry-title">${escapeHTML(entry.name)}</span><span class="entry-category">${escapeHTML(entry.category || '기타')}</span></span><span class="entry-detail">${setDetails}</span>${note}</span><span class="entry-edit-hint" aria-hidden="true">수정</span></button><div class="entry-actions">${deletable ? `<button class="delete-entry" data-delete-entry="${escapeHTML(entry.id)}" aria-label="${escapeHTML(entry.name)} 기록 삭제">×</button>` : ''}</div></article>`;
}

function renderHomeEntries() {
  const today = localDate();
  const todays = sortedEntries().filter((entry) => entry.date === today);
  const recent = sortedEntries().filter((entry) => entry.date !== today).slice(0, 3);
  document.getElementById('today-entries').innerHTML = todays.length
    ? todays.map((entry) => entryCard(entry, true)).join('')
    : emptyState('오늘의 첫 운동을 기록해 보세요', '종목과 세트 수를 남기면 오늘의 기록이 완성돼요.', '＋ 운동 기록하기');
  document.getElementById('recent-entries').innerHTML = recent.length
    ? recent.map((entry) => entryCard(entry)).join('')
    : `<div class="empty-state recent-empty"><strong>아직 기록이 없어요</strong><p>작은 기록부터 시작해 보세요.</p></div>`;
}

function renderLogs() {
  const entries = sortedEntries();
  const totalSets = entries.reduce((sum, entry) => sum + setCount(entry), 0);
  const days = new Set(entries.map((entry) => entry.date));
  document.getElementById('journal-summary').innerHTML = `<div><strong>${days.size}</strong><span>운동한 날</span></div><div><strong>${entries.length}</strong><span>운동 종목</span></div><div><strong>${totalSets}</strong><span>누적 세트</span></div>`;
  if (!entries.length) {
    document.getElementById('all-entries').innerHTML = emptyState('첫 운동을 기록해 보세요', '운동이 끝난 뒤 종목과 횟수를 추가하면 여기에 차곡차곡 모여요.', '＋ 운동 기록 추가');
    return;
  }
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.date)) groups.set(entry.date, []);
    groups.get(entry.date).push(entry);
  }
  document.getElementById('all-entries').innerHTML = [...groups.entries()].map(([date, items]) => {
    const sets = items.reduce((sum, item) => sum + setCount(item), 0);
    return `<section class="date-group"><div class="date-group-heading"><h3>${dateLabel(date)}</h3><span>${items.length}종목 · ${sets}세트</span></div><div class="entry-list">${items.map((entry) => entryCard(entry, true)).join('')}</div></section>`;
  }).join('');
}

function renderAll() {
  renderHeader();
  renderProfileSummary();
  renderNutritionGuide();
  renderWeek();
  renderHomeEntries();
  renderLogs();
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2300);
}

function switchScreen(name) {
  document.querySelectorAll('.screen').forEach((screen) => {
    const active = screen.id === `screen-${name}`;
    screen.hidden = !active;
    screen.classList.toggle('active', active);
  });
  document.querySelectorAll('.nav-item').forEach((button) => {
    const active = button.dataset.screen === name;
    button.classList.toggle('selected', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openWorkoutDialog(entryId = null) {
  editingEntryId = null;
  const form = document.getElementById('workout-form');
  form.reset();
  form.elements.date.value = localDate();
  document.getElementById('set-rows').replaceChildren();
  const entry = entryId ? appData.entries.find((item) => String(item.id) === String(entryId)) : null;
  if (entry) {
    editingEntryId = entry.id;
    document.getElementById('workout-dialog-kicker').textContent = 'EDIT ENTRY';
    document.getElementById('workout-dialog-title').textContent = '운동 기록 수정';
    document.getElementById('workout-submit-label').textContent = '수정 내용 저장';
    form.elements.name.value = entry.name || '';
    form.elements.category.value = entry.category || '기타';
    form.elements.date.value = entry.date || localDate();
    form.elements.note.value = entry.note || '';
    (entry.sets || []).forEach((set) => addSetRow(set));
  } else {
    document.getElementById('workout-dialog-kicker').textContent = 'NEW ENTRY';
    document.getElementById('workout-dialog-title').textContent = '운동 기록 추가';
    document.getElementById('workout-submit-label').textContent = '기록 저장';
    addSetRow();
  }
  document.getElementById('workout-dialog').showModal();
  window.setTimeout(() => document.getElementById('exercise-name').focus(), 80);
}

function addSetRow(set = {}) {
  const rows = document.getElementById('set-rows');
  const index = rows.children.length + 1;
  const row = document.createElement('div');
  row.className = 'set-row';
  row.dataset.setRow = '';
  row.innerHTML = `<span class="set-number">${index}</span><label class="set-input-wrap"><span class="sr-only">${index}세트 중량(kg)</span><input data-set-weight type="number" min="0" max="999" step="0.5" inputmode="decimal" placeholder="없음" value="${escapeHTML(set.weight || '')}" /></label><label class="set-input-wrap"><span class="sr-only">${index}세트 반복 횟수</span><input data-set-reps type="number" min="1" max="999" step="1" inputmode="numeric" placeholder="회" value="${escapeHTML(set.reps ?? '')}" required /></label><button class="remove-set-button" type="button" aria-label="${index}세트 삭제">×</button>`;
  rows.append(row);
  updateSetRows();
}

function updateSetRows() {
  const rows = [...document.querySelectorAll('#set-rows [data-set-row]')];
  rows.forEach((row, index) => {
    const number = index + 1;
    row.querySelector('.set-number').textContent = number;
    row.querySelectorAll('.sr-only').forEach((label, inputIndex) => {
      label.textContent = `${number}세트 ${inputIndex === 0 ? '중량(kg)' : '반복 횟수'}`;
    });
    const remove = row.querySelector('.remove-set-button');
    remove.setAttribute('aria-label', `${number}세트 삭제`);
    remove.disabled = rows.length === 1;
  });
}

document.addEventListener('click', (event) => {
  const screenButton = event.target.closest('[data-screen]');
  if (screenButton) switchScreen(screenButton.dataset.screen);
  const editButton = event.target.closest('[data-edit-entry]');
  if (editButton) openWorkoutDialog(editButton.dataset.editEntry);
  if (event.target.closest('[data-open-workout]')) openWorkoutDialog();
  if (event.target.closest('[data-close-dialog]')) document.getElementById('workout-dialog').close();
  if (event.target.closest('#add-set-row')) addSetRow();
  const removeSetButton = event.target.closest('.remove-set-button');
  if (removeSetButton && !removeSetButton.disabled) {
    removeSetButton.closest('[data-set-row]').remove();
    updateSetRows();
  }
  const deleteButton = event.target.closest('[data-delete-entry]');
  if (deleteButton) {
    appData.entries = appData.entries.filter((entry) => String(entry.id) !== deleteButton.dataset.deleteEntry);
    persist();
    renderAll();
    showToast('운동 기록을 삭제했어요.');
  }
});

document.getElementById('workout-dialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.getElementById('workout-dialog').addEventListener('close', () => { editingEntryId = null; });

document.getElementById('profile-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  appData.profile = { weight: values.get('weight') || '', height: values.get('height') || '', age: values.get('age') || '' };
  persist();
  renderAll();
  showToast('프로필과 섭취 참고량을 업데이트했어요.');
});

document.getElementById('workout-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  const sets = [...document.querySelectorAll('#set-rows [data-set-row]')].map((row) => ({
    weight: row.querySelector('[data-set-weight]').value,
    reps: Number(row.querySelector('[data-set-reps]').value),
  }));
  const entry = {
    id: editingEntryId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: String(values.get('name') || '').trim(),
    category: values.get('category'),
    date: values.get('date'),
    sets,
    note: String(values.get('note') || '').trim(),
    createdAt: new Date().toISOString(),
  };
  if (!entry.name || !entry.date || !entry.sets.length || entry.sets.some((set) => set.reps < 1)) return;
  if (editingEntryId) {
    const index = appData.entries.findIndex((item) => String(item.id) === String(editingEntryId));
    if (index !== -1) appData.entries[index] = { ...appData.entries[index], ...entry };
  } else {
    appData.entries.push(entry);
  }
  const wasEditing = Boolean(editingEntryId);
  editingEntryId = null;
  persist();
  document.getElementById('workout-dialog').close();
  renderAll();
  showToast(wasEditing ? '운동 기록을 수정했어요.' : '운동 기록을 추가했어요.');
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('오프라인 저장을 사용할 수 없습니다.', error)));
}

renderAll();
