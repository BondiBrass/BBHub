
const MUSIC_SAMPLE = `music|Scipio|3|
music|Prelude to a Solemn Occasion|4|
music|Ashokan Farewell|4|
spoken|Welcome to country|4|
music|(Sacred Masterpieces). |10|2-3 x each|Watch for hymn number and cues
music|Last Post|2|
spoken|Lest we Forget    xxsxxx|4|
music|Reveille|2|
music|New Zealand National Anthem|2|Intro last 4 bars. 2-beat pauses. |2 verses
music|Australian National Anthem|2|No rall until end 2nd verse.
spoken|Catafolk|8|
music|1914 March|4|4
music|I Still Call Australia Home|4|`;
const BUSINESS_SAMPLE = `intro|Welcome and housekeeping|3|
presentation|Quarterly business update|12|CEO leads|Keep to highlights
demo|Product roadmap demo|10||
discussion|Sales pipeline review|8|Top 5 accounts|Watch time
break|Coffee break|10||
presentation|Operations update|8||
qna|Questions and answers|10||
close|Wrap up and actions|4|Confirm owners|`;
const PRESENTATION_SAMPLE = `intro|Opening remarks|3|
speaker|Keynote presentation|20|Main presenter|
video|Promo video|4|Check audio first|
speaker|Guest presentation|15|Needs clicker|
panel|Panel discussion|18|4 speakers on stage|
qna|Audience questions|10||
close|Closing thanks|3||`;

let items = [];
let liveIndex = 0;
let openIndex = null;

function getSampleText() {
  const v = document.getElementById('sampleSelect').value;
  if (v === 'business') return BUSINESS_SAMPLE;
  if (v === 'presentation') return PRESENTATION_SAMPLE;
  return MUSIC_SAMPLE;
}

function parseLine(line) {
  const p = line.split('|');
  return {
    type: (p[0] || 'music').trim(),
    name: (p[1] || '').trim(),
    duration: parseInt(String(p[2] || '').match(/\d+/)?.[0] || 0, 10) || 0,
    composer: (p[3] || '').trim(),
    arranger: (p[4] || '').trim(),
    note1: (p[5] || '').trim(),
    note2: (p[6] || '').trim()
  };
}

function serialise(item) {
  return [
    item.type || '',
    item.name || '',
    item.duration || 0,
    item.composer || '',
    item.arranger || '',
    item.note1 || '',
    item.note2 || ''
  ].join('|');
}

function build() {
  items = document.getElementById('rawInput').value
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)
    .map(parseLine);
  if (liveIndex >= items.length) liveIndex = Math.max(0, items.length - 1);
  openIndex = null;
  render();
}

function render() {
  syncRaw();
  renderSummary();
  renderList();
  renderLive();
}

function syncRaw() {
  document.getElementById('rawInput').value = items.map(serialise).join('\n');
}

function totalMinutes() {
  return items.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
}

function renderSummary() {
  const total = totalMinutes();
  const max = parseInt(document.getElementById('maxTimeInput').value || '0', 10) || 0;
  document.getElementById('totalTimeHero').textContent = `${total}m`;
  document.getElementById('itemCountHero').textContent = String(items.length);
  document.getElementById('maxTimeHero').textContent = `${max}m`;
  document.getElementById('totalTimeBox').textContent = `${total} mins`;

  const stateEl = document.getElementById('programState');
  if (!max || total < max) {
    stateEl.textContent = 'Within limit';
    stateEl.className = 'summary-tile__value status-good';
  } else if (total === max) {
    stateEl.textContent = 'Right on limit';
    stateEl.className = 'summary-tile__value status-warn';
  } else {
    stateEl.textContent = `${total - max} mins over`;
    stateEl.className = 'summary-tile__value status-danger';
  }
}

function renderList() {
  const list = document.getElementById('list');
  const max = parseInt(document.getElementById('maxTimeInput').value || '0', 10) || 0;
  let running = 0;

  list.innerHTML = items.map((item, i) => {
    running += Number(item.duration) || 0;
    const over = max && running > max;
    const open = openIndex === i;
    const meta = [item.type, item.composer, item.arranger].filter(Boolean).join(' · ');
    return `
      <div class="item ${over ? 'is-over' : ''}">
        <div class="item__header" onclick="toggleOpen(${i})">
          <div>
            <div class="item__title">${i + 1}. ${escapeHtml(item.name || '(untitled)')} (${Number(item.duration) || 0}m)</div>
            <div class="item__meta">${escapeHtml(meta || 'Tap to edit details')}</div>
          </div>
          <div class="item__caret">${open ? '▾' : '▸'}</div>
        </div>

        ${open ? `
          <div class="item__edit">
            <div class="item__edit-grid">
              <input value="${escapeAttr(item.name)}" placeholder="Title" onchange="editItem(${i}, 'name', this.value)">
              <input value="${escapeAttr(item.duration)}" placeholder="Duration" onchange="editItem(${i}, 'duration', this.value)">
            </div>
            <div class="item__edit-grid">
              <input value="${escapeAttr(item.type)}" placeholder="Type" onchange="editItem(${i}, 'type', this.value)">
              <input value="${escapeAttr(item.composer)}" placeholder="Composer / info" onchange="editItem(${i}, 'composer', this.value)">
            </div>
            <div class="item__edit-grid">
              <input value="${escapeAttr(item.arranger)}" placeholder="Arranger / info" onchange="editItem(${i}, 'arranger', this.value)">
              <input value="${escapeAttr(item.note1)}" placeholder="Note 1" onchange="editItem(${i}, 'note1', this.value)">
            </div>
            <input value="${escapeAttr(item.note2)}" placeholder="Note 2" onchange="editItem(${i}, 'note2', this.value)">
          </div>
        ` : ''}

        <div class="item__actions">
          <button class="btn btn--tiny-plus" onclick="insertBelow(${i}); event.stopPropagation()">＋ Below</button>
          <button class="btn btn--tiny-up" onclick="moveItem(${i}, -1); event.stopPropagation()">↑</button>
          <button class="btn btn--tiny-down" onclick="moveItem(${i}, 1); event.stopPropagation()">↓</button>
          <button class="btn btn--tiny-delete" onclick="deleteItem(${i}); event.stopPropagation()">✕</button>
        </div>
      </div>
    `;
  }).join('') || '<div class="item"><div class="item__title">No items yet</div><div class="item__meta">Paste, type, or load a sample to get started.</div></div>';
}

function toggleOpen(i) {
  openIndex = openIndex === i ? null : i;
  renderList();
}

function editItem(i, field, value) {
  if (field === 'duration') {
    items[i][field] = parseInt(String(value).match(/\d+/)?.[0] || 0, 10) || 0;
  } else {
    items[i][field] = value;
  }
  render();
}

function insertBelow(i) {
  items.splice(i + 1, 0, {
    type: 'music',
    name: 'New Item',
    duration: 3,
    composer: '',
    arranger: '',
    note1: '',
    note2: ''
  });
  openIndex = i + 1;
  if (liveIndex > i) liveIndex += 1;
  render();
}

function moveItem(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  if (liveIndex === i) liveIndex = j;
  else if (liveIndex === j) liveIndex = i;
  if (openIndex === i) openIndex = j;
  else if (openIndex === j) openIndex = i;
  render();
}

function deleteItem(i) {
  items.splice(i, 1);
  if (liveIndex >= items.length) liveIndex = Math.max(0, items.length - 1);
  if (openIndex === i) openIndex = null;
  render();
}

function addQuickLine() {
  const input = document.getElementById('quickLine');
  const val = input.value.trim();
  if (!val) return;
  items.push(parseLine(val));
  input.value = '';
  openIndex = items.length - 1;
  render();
}

function quickAdd(type) {
  const presets = {
    music: 'music|New Music|3|',
    spoken: 'spoken|New Speech|2|',
    break: 'break|Break|10|',
    march: 'march|New March|4|',
    other: 'other|New Item|3|'
  };
  items.push(parseLine(presets[type] || 'other|New Item|3|'));
  openIndex = items.length - 1;
  render();
}

function clearRaw() {
  document.getElementById('rawInput').value = '';
  items = [];
  liveIndex = 0;
  openIndex = null;
  render();
}

function loadSelectedSample() {
  document.getElementById('rawInput').value = getSampleText();
  build();
}

async function copyEditable() {
  const text = document.getElementById('rawInput').value;
  try {
    await navigator.clipboard.writeText(text);
    flashStatus('Copied editable list to clipboard');
  } catch (e) {
    flashStatus('Clipboard copy failed on this browser');
  }
}

async function shareList() {
  const text = document.getElementById('rawInput').value;
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Mobile Run Sheet',
        text
      });
      flashStatus('Share opened');
    } else {
      await navigator.clipboard.writeText(text);
      flashStatus('Share not available here, copied instead');
    }
  } catch (e) {
    // user cancelled or share not available
  }
}

function flashStatus(msg) {
  const el = document.getElementById('copyStatus');
  el.textContent = msg;
  clearTimeout(window.__copyTimer);
  window.__copyTimer = setTimeout(() => el.textContent = '', 1800);
}

function toggleLive() {
  document.getElementById('livePanel').classList.toggle('hidden');
  renderLive();
}

function renderLive() {
  const now = items[liveIndex];
  const next = items[liveIndex + 1];
  document.getElementById('liveNow').textContent = now ? now.name || '-' : '-';
  document.getElementById('liveNowMeta').textContent = now ? `${now.type || ''} · ${Number(now.duration) || 0}m`.replace(/^\s*·\s*/, '') : '';
  document.getElementById('liveNext').textContent = next ? next.name || '-' : '-';
}

function nextLive() {
  if (liveIndex < items.length - 1) liveIndex += 1;
  renderLive();
}
function prevLive() {
  if (liveIndex > 0) liveIndex -= 1;
  renderLive();
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  document.body.classList.toggle('light');
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeAttr(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.getElementById('buildBtn').addEventListener('click', build);
document.getElementById('clearBtn').addEventListener('click', clearRaw);
document.getElementById('loadSampleBtn').addEventListener('click', loadSelectedSample);
document.getElementById('copyBtn').addEventListener('click', copyEditable);
document.getElementById('shareBtn').addEventListener('click', shareList);
document.getElementById('themeBtn').addEventListener('click', toggleTheme);
document.getElementById('liveToggleBtn').addEventListener('click', toggleLive);
document.getElementById('nextBtn').addEventListener('click', nextLive);
document.getElementById('prevBtn').addEventListener('click', prevLive);
document.getElementById('addQuickLineBtn').addEventListener('click', addQuickLine);
document.getElementById('maxTimeInput').addEventListener('input', renderSummary);

document.querySelectorAll('[data-quick-type]').forEach(btn => {
  btn.addEventListener('click', () => quickAdd(btn.dataset.quickType));
});

document.getElementById('quickLine').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addQuickLine();
  }
});

build();
