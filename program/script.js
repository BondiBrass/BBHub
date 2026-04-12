
function editFromFinal(){
  // Bring user back to the Run Sheet and focus first editable item
  const list = document.getElementById('list');
  if (list) {
    list.scrollIntoView({behavior:'smooth', block:'start'});
  }
  // open first item if none open
  if (typeof openIndex !== 'undefined') {
    if (openIndex === null || openIndex < 0) openIndex = 0;
    if (typeof render === 'function') render();
  }
}



function updatePasteLabel(){
  const el = document.querySelector('.panel textarea')?.previousElementSibling;
  if(!el) return;

  const total = items.reduce((s,i)=>s + (Number(i.duration)||0),0);
  const max = parseInt(document.getElementById('maxTimeInput')?.value||'0',10)||0;
  const pct = max ? Math.round((total/max)*100) : 0;

  const text = max
    ? `Paste / edit [${items.length} | ${total}m/${max}m | ${pct}%]`
    : `Paste / edit [${items.length} | ${total}m]`;

  el.textContent = text;
}

const MUSIC_SAMPLE = `music|Scipio|3|
music|Prelude to a Solemn Occasion|4|
music|Ashokan Farewell|4|
spoken|Welcome to country|4|
music|(Sacred Masterpieces). |10|2-3 x each|Watch for hymn number and cues
music|Last Post|2|
spoken|ODE- Lest we Forget|4|
music|Reveille|2|
music|New Zealand National Anthem|2|Intro last 4 bars. 2-beat pauses. |2 verses
music|Australian National Anthem|2|No rall until end 2nd verse.
spoken|Catafalque|8|
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
const ROCK_SAMPLE = `music|Intro Jam|2|
music|Are You Gonna Be My Girl|3|
music|Mr Brightside|4|
music|Sex on Fire|4|
spoken|Band intro / crowd hype|2|
music|Summer of 69|4|
music|Sweet Child O Mine|5|
music|Living on a Prayer|5|
break|Quick tune / sip break|2|
music|Wonderwall|4|
music|Uptown Funk|4|
music|Don't Stop Believin|5|
music|Finale Jam / Crowd singalong|4|`;


let dragIndex = null;

function moveItemTo(from, to) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
  const moved = items.splice(from, 1)[0];
  items.splice(to, 0, moved);
  if (liveIndex === from) liveIndex = to;
  else if (from < liveIndex && to >= liveIndex) liveIndex -= 1;
  else if (from > liveIndex && to <= liveIndex) liveIndex += 1;
  if (openIndex === from) openIndex = to;
  else if (from < openIndex && to >= openIndex) openIndex -= 1;
  else if (from > openIndex && to <= openIndex) openIndex += 1;
  render();
}

function bindDragReorder() {
  const rows = document.querySelectorAll('.compact-item-shell');
  rows.forEach(row => {
    const idx = Number(row.dataset.index);

    row.addEventListener('dragstart', (e) => {
      dragIndex = idx;
      row.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) {}
      }
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('is-dragging');
      document.querySelectorAll('.compact-item-shell').forEach(r => r.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      if (dragIndex === null) return;
      moveItemTo(dragIndex, idx);
      dragIndex = null;
    });

    // touch fallback: tap drag handle cycles item up/down isn't implemented; keep buttons as backup
  });
}

let items = [];
let liveIndex = 0;
let openIndex = null;

function getSampleText() {
  const v = document.getElementById('sampleSelect').value;
  if (v === 'business') return BUSINESS_SAMPLE;
  if (v === 'presentation') return PRESENTATION_SAMPLE;
  if (v === 'rock') return ROCK_SAMPLE;
  return MUSIC_SAMPLE;
}


function cleanPipeLine(line){
  if(!line) return '';
  // split, trim, remove empty trailing fields
  let parts = line.split('|').map(p=>p.trim());
  // remove trailing empty parts
  while(parts.length && parts[parts.length-1]==='') parts.pop();
  return parts.join('|');
}
function parseLine(line) {
  const p = line.split('|');
  while (p.length < 7) p.push('');
  let duration = parseInt(String(p[2] || '').match(/\d+/)?.[0] || '', 10);
  let usedDefault = false;
  if (Number.isNaN(duration)) {
    duration = 2;
    usedDefault = true;
  }
  return {
    type: (p[0] || 'music').trim(),
    name: (p[1] || '').trim(),
    duration,
    usedDefault,
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


let __rawLiveTimer = null;

function liveBuildFromRaw() {
  const raw = document.getElementById('rawInput');
  if (!raw) return;
  clearTimeout(__rawLiveTimer);
  __rawLiveTimer = setTimeout(() => {
    try {
      build();
    } catch (e) {
      console.warn('Live parse skipped while typing', e);
    }
  }, 220);
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

function render(){

  syncRaw();
  renderSummary(); updatePasteLabel();
  renderList();
  bindDragReorder();
  renderLive();
  renderFinal();
  items.forEach(item => item.usedDefault = false);
}

function syncRaw() {
  document.getElementById('rawInput').value = items.map(serialise).map(cleanPipeLine).join('\n');
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
  const pct = max ? Math.round((total / max) * 100) : 0;
  document.getElementById('totalTimeBox').textContent = max ? `${total} mins (${pct}%)` : `${total} mins`;

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
    const typeClass = `compact-type-pill--${escapeClass(item.type || 'other')}`;
    const dur = Number(item.duration) || 0;
    const cum = running;
    return `
      <div class="compact-item ${over ? 'compact-item--over' : ''} ${open ? 'compact-item--open' : ''}">
        <div class="compact-item-shell" draggable="true" data-index="${i}">
        <div class="compact-row">
          <div class="compact-drag" title="Drag to reorder">≡</div>
          <div class="compact-moves">
            <button class="compact-pill compact-pill--up" onclick="moveItem(${i}, -1); event.stopPropagation()">↑</button>
            <button class="compact-pill compact-pill--down" onclick="moveItem(${i}, 1); event.stopPropagation()">↓</button>
          </div>
          <div class="compact-id">${String(i + 1).padStart(2, '0')}</div>
          <div class="compact-type"><span class="compact-type-pill ${typeClass}">${escapeHtml(item.type || 'other')}</span></div>
          <div class="compact-time"><span class="compact-time-item">${dur}m</span>/<span class="compact-time-cum">${cum}m</span></div>
          <div class="compact-title">${escapeHtml(item.name || '(untitled)')}</div>
          <div class="compact-edit-wrap">
            <button class="editor-open-btn" type="button" onclick="toggleOpen(${i}); event.stopPropagation()">${open ? 'Done' : 'Edit+'}</button>
          </div>
        </div>

        ${open ? `
          <div class="compact-edit-panel">
            <div class="editor-grid-two">
              <label class="editor-field">
                <span>Title</span>
                <input value="${escapeAttr(item.name)}" placeholder="Title" onchange="editItem(${i}, 'name', this.value)">
              </label>
              <label class="editor-field">
                <span>Duration</span>
                <input class="${item.usedDefault ? 'auto-duration' : ''}" value="${escapeAttr(item.duration)}" placeholder="Duration" onchange="editItem(${i}, 'duration', this.value)">
              </label>
            </div>

            <div class="editor-grid-two">
              <label class="editor-field">
                <span>Style</span>
                <input value="${escapeAttr(item.type)}" placeholder="Style" onchange="editItem(${i}, 'type', this.value)">
              </label>
              <label class="editor-field">
                <span>Composer</span>
                <input value="${escapeAttr(item.composer)}" placeholder="Composer" onchange="editItem(${i}, 'composer', this.value)">
              </label>
            </div>

            <div class="editor-grid-two">
              <label class="editor-field">
                <span>Arranger</span>
                <input value="${escapeAttr(item.arranger)}" placeholder="Arranger" onchange="editItem(${i}, 'arranger', this.value)">
              </label>
              <label class="editor-field">
                <span>Note 1</span>
                <input value="${escapeAttr(item.note1)}" placeholder="Note 1" onchange="editItem(${i}, 'note1', this.value)">
              </label>
            </div>

            <label class="editor-field">
              <span>Note 2</span>
              <input value="${escapeAttr(item.note2)}" placeholder="Note 2" onchange="editItem(${i}, 'note2', this.value)">
            </label>

            <div class="compact-edit-actions">
              <button class="btn btn--tiny-plus" onclick="insertBelow(${i}); event.stopPropagation()">＋ Below</button>
              <button class="btn btn--tiny-delete" onclick="deleteItem(${i}); event.stopPropagation()">Remove</button>
            </div>
          </div>
        ` : ''}
      </div>
      </div>
    `;
  }).join('') || '<div class="item item--editor"><div class="item__title">No items yet</div><div class="item__meta">Paste, type, or load a sample to get started.</div></div>';
}
function renderFinal() {
  const total = totalMinutes();
  const label = document.getElementById('programLabelInput')?.value?.trim() || 'BBHub Mobile Run Sheet';
  const rawDate = document.getElementById('programDateInput')?.value || '';
  const prettyDate = formatProgramDate(rawDate);
  document.getElementById('finalTitle').textContent = label;
  document.getElementById('finalSub').textContent = `${prettyDate ? prettyDate + ' · ' : ''}Total ${total} mins · ${items.length} items`;

  const totalProgramMinutes = total || 0;
  let cumulative = 0;
  const target = document.getElementById('finalList');
  target.innerHTML = items.map((item, i) => {
    const dur = Number(item.duration) || 0;
    cumulative += dur;
    const notes = [item.composer, item.arranger, item.note1, item.note2].filter(Boolean);
    return `
      <div class="final-row">
        <div class="final-num">${String(i + 1).padStart(2, '0')}</div>
        <div class="final-main">
          <div class="final-type">${escapeHtml(item.type || 'item')}</div>
          <div class="final-title">${escapeHtml(item.name || '(untitled)')}</div>
          ${notes.length ? `<div class="final-notes">${notes.map(n => escapeHtml(n)).join('<br>')}</div>` : ''}
        </div>
        <div class="final-duration">${dur}m / ${cumulative}m / ${totalProgramMinutes > 0 ? Math.round((cumulative / totalProgramMinutes) * 100) : 0}%</div>
      </div>
    `;
  }).join('');
}

function toggleOpen(i) {
  openIndex = openIndex === i ? null : i;
  renderList();
}

function editItem(i, field, value) {
  if (field === 'duration') {
    const parsed = parseInt(String(value).match(/\d+/)?.[0] || 0, 10) || 0;
    items[i][field] = parsed;
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
    usedDefault: false,
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

function prettyText() {
  return [
    'BBHub Mobile Run Sheet',
    `Total: ${totalMinutes()} mins`,
    '',
    ...items.map((item, i) => {
      const notes = [item.composer, item.arranger, item.note1, item.note2].filter(Boolean);
      return `${i + 1}. ${item.name} — ${item.duration}m${notes.length ? '\n   ' + notes.join('\n   ') : ''}`;
    })
  ].map(cleanPipeLine).join('\n');
}

async function copyPretty() {
  try {
    await navigator.clipboard.writeText(prettyText());
    flashStatus('Copied final list to clipboard');
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

function printFinal() {
  const panel = document.getElementById('finalPanel');
  if (panel.classList.contains('hidden')) panel.classList.remove('hidden');
  renderFinal();
  window.print();
}



function formatProgramDate(raw) {
  if (!raw) return '';
  const d = new Date(raw + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return raw;
  const day = d.getDate();
  const suffix = (n => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  })(day);
  const weekday = d.toLocaleDateString('en-AU', { weekday: 'short' });
  const month = d.toLocaleDateString('en-AU', { month: 'long' });
  const year = d.getFullYear();
  return `${weekday} ${day}${suffix} ${month} ${year}`;
}

function escapeClass(v) {
  return String(v || 'other').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
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
document.getElementById('copyBtn').addEventListener('click', copyEditable);
document.getElementById('shareBtn').addEventListener('click', shareList);
document.getElementById('copyPrettyBtn').addEventListener('click', copyPretty);
document.getElementById('printBtn').addEventListener('click', printFinal);
document.getElementById('themeBtn').addEventListener('click', toggleTheme);
document.getElementById('liveToggleBtn').addEventListener('click', toggleLive);
document.getElementById('editFromFinalBtn').addEventListener('click', editFromFinal);
document.getElementById('nextBtn').addEventListener('click', nextLive);
document.getElementById('prevBtn').addEventListener('click', prevLive);
document.getElementById('addQuickLineBtn').addEventListener('click', addQuickLine);
document.getElementById('maxTimeInput').addEventListener('input', render);
document.getElementById('programLabelInput').addEventListener('input', renderFinal);
document.getElementById('programDateInput').addEventListener('input', renderFinal);

document.querySelectorAll('[data-quick-type]').forEach(btn => {
  btn.addEventListener('click', () => quickAdd(btn.dataset.quickType));
});

document.getElementById('quickLine').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addQuickLine();
  }
});


document.getElementById('rawInput').addEventListener('input', liveBuildFromRaw);

build();
