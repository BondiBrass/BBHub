import { loadData } from './sheets.js';

const svg = d3.select('#editorSvg');
const zoomLayer = svg.append('g').attr('class', 'zoomLayer');
const gridLayer = zoomLayer.append('g').attr('class', 'gridLayer');
const backdropLayer = zoomLayer.append('g').attr('class', 'backdropLayer');
const chairsLayer = zoomLayer.append('g').attr('class', 'chairsLayer');

const els = {
  bandTypeSelect: document.getElementById('bandTypeSelect'),
  sectionFilter: document.getElementById('sectionFilter'),
  zoomRange: document.getElementById('zoomRange'),
  fitBtn: document.getElementById('fitBtn'),
  resetBandBtn: document.getElementById('resetBandBtn'),
  resetChairBtn: document.getElementById('resetChairBtn'),
  labelsToggle: document.getElementById('labelsToggle'),
  codeToggle: document.getElementById('codeToggle'),
  gridToggle: document.getElementById('gridToggle'),
  downloadBtn: document.getElementById('downloadBtn'),
  copyBtn: document.getElementById('copyBtn'),
  status: document.getElementById('status'),
  psvOutput: document.getElementById('psvOutput'),
  selectedTitle: document.getElementById('selectedTitle'),
  selectedMeta: document.getElementById('selectedMeta'),
  xInput: document.getElementById('xInput'),
  yInput: document.getElementById('yInput'),
  applyCoordsBtn: document.getElementById('applyCoordsBtn'),
  canvasTitle: document.getElementById('canvasTitle'),
  legend: document.getElementById('legend')
};

const state = {
  allBandChairs: [],
  bands: [],
  sectionFilter: '',
  bandType: '',
  selectedKey: '',
  visible: [],
  zoomScale: 1,
  originals: new Map()
};

const sectionColors = [
  '#f59e0b','#0ea5e9','#22c55e','#ef4444','#8b5cf6','#14b8a6','#ec4899','#94a3b8'
];

const sectionColorMap = new Map();
function getSectionColor(section){
  if(!sectionColorMap.has(section)) sectionColorMap.set(section, sectionColors[sectionColorMap.size % sectionColors.length]);
  return sectionColorMap.get(section);
}

const zoom = d3.zoom()
  .scaleExtent([0.45, 2.8])
  .on('zoom', (event) => {
    zoomLayer.attr('transform', event.transform);
    state.zoomScale = event.transform.k;
    els.zoomRange.value = String(event.transform.k.toFixed(2));
  });
svg.call(zoom);

function keyFor(row){ return `${row.band_type}||${row.chair_code}`; }
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

function normaliseChair(row){
  const clean = {
    ...row,
    band_type: String(row.band_type ?? '').trim(),
    chair_code: String(row.chair_code ?? '').trim(),
    instrument: String(row.instrument ?? '').trim(),
    section: String(row.section ?? '').trim(),
    default_x: num(row.default_x),
    default_y: num(row.default_y),
    order: num(row.order)
  };
  state.originals.set(keyFor(clean), { x: clean.default_x, y: clean.default_y });
  return clean;
}

function drawGrid(){
  gridLayer.selectAll('*').remove();
  if(!els.gridToggle.checked) return;
  const w = 1200, h = 820, step = 50;
  for(let x=0; x<=w; x+=step){
    gridLayer.append('line').attr('x1', x).attr('y1', 0).attr('x2', x).attr('y2', h)
      .attr('stroke', x % 100 === 0 ? '#d7deea' : '#edf2f7').attr('stroke-width', 1);
  }
  for(let y=0; y<=h; y+=step){
    gridLayer.append('line').attr('x1', 0).attr('y1', y).attr('x2', w).attr('y2', y)
      .attr('stroke', y % 100 === 0 ? '#d7deea' : '#edf2f7').attr('stroke-width', 1);
  }
}

function drawBackdrop(){
  backdropLayer.selectAll('*').remove();
  backdropLayer.append('rect')
    .attr('x', 0).attr('y', 0).attr('width', 1200).attr('height', 820)
    .attr('fill', '#fbfdff');
  backdropLayer.append('path')
    .attr('d', 'M120,690 Q600,190 1080,690')
    .attr('fill', 'none')
    .attr('stroke', '#d0d7e2')
    .attr('stroke-width', 4)
    .attr('stroke-dasharray', '8 10');
  backdropLayer.append('text')
    .attr('x', 600).attr('y', 742).attr('text-anchor', 'middle')
    .attr('font-size', 18).attr('fill', '#8a94a6')
    .text('Audience / front of stage');
}

function refreshSectionFilter(){
  const sections = Array.from(new Set(state.allBandChairs
    .filter(r => r.band_type === state.bandType)
    .map(r => r.section)
    .filter(Boolean)))
    .sort((a,b) => a.localeCompare(b));
  const keep = els.sectionFilter.value;
  els.sectionFilter.innerHTML = '<option value="">All sections</option>' + sections.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  els.sectionFilter.value = sections.includes(keep) ? keep : '';
  state.sectionFilter = els.sectionFilter.value;
}

function getVisible(){
  return state.allBandChairs
    .filter(r => r.band_type === state.bandType)
    .filter(r => !state.sectionFilter || r.section === state.sectionFilter)
    .sort((a,b) => (a.order - b.order) || a.chair_code.localeCompare(b.chair_code));
}

function renderLegend(rows){
  const sections = Array.from(new Set(rows.map(r => r.section).filter(Boolean)));
  els.legend.innerHTML = sections.map(section => `<span class="legendItem"><span class="legendSwatch" style="background:${getSectionColor(section)}"></span>${escapeHtml(section)}</span>`).join('');
}

function selectChair(row){
  if(!row){
    state.selectedKey = '';
    els.selectedTitle.textContent = 'Nothing selected';
    els.selectedMeta.textContent = 'Click or drag a chair.';
    els.xInput.value = '';
    els.yInput.value = '';
    chairsLayer.selectAll('.chair').classed('chair--selected', false);
    return;
  }
  state.selectedKey = keyFor(row);
  chairsLayer.selectAll('.chair').classed('chair--selected', d => keyFor(d) === state.selectedKey);
  els.selectedTitle.textContent = `${row.chair_code} · ${row.instrument || 'Chair'}`;
  els.selectedMeta.textContent = `${row.band_type} · ${row.section || 'No section'} · order ${row.order}`;
  els.xInput.value = String(Math.round(row.default_x));
  els.yInput.value = String(Math.round(row.default_y));
}

function renderChairs(){
  state.visible = getVisible();
  els.canvasTitle.textContent = `Band chairs · ${state.bandType || '—'}`;
  renderLegend(state.visible);
  drawGrid();
  drawBackdrop();

  const drag = d3.drag()
    .on('start', function(event, d){
      selectChair(d);
      d3.select(this).raise().classed('chair--dragging', true);
    })
    .on('drag', function(event, d){
      d.default_x = Math.round(event.x);
      d.default_y = Math.round(event.y);
      d3.select(this).attr('transform', `translate(${d.default_x},${d.default_y})`);
      if(state.selectedKey === keyFor(d)){
        els.xInput.value = String(d.default_x);
        els.yInput.value = String(d.default_y);
      }
      updatePsv();
    })
    .on('end', function(){
      d3.select(this).classed('chair--dragging', false);
    });

  const chairs = chairsLayer.selectAll('.chair').data(state.visible, d => keyFor(d));
  chairs.exit().remove();

  const enter = chairs.enter().append('g')
    .attr('class', 'chair')
    .style('cursor', 'grab')
    .on('click', (_, d) => selectChair(d))
    .call(drag);

  enter.append('circle').attr('r', 23).attr('class', 'chairDot');
  enter.append('text').attr('class', 'chairCode').attr('text-anchor', 'middle').attr('y', -2);
  enter.append('text').attr('class', 'chairLabel').attr('text-anchor', 'middle').attr('y', 15);

  const merged = enter.merge(chairs);
  merged
    .attr('transform', d => `translate(${d.default_x},${d.default_y})`)
    .attr('data-key', d => keyFor(d));

  merged.select('.chairDot')
    .attr('fill', d => getSectionColor(d.section || 'Other'))
    .attr('stroke', d => state.selectedKey === keyFor(d) ? '#111827' : '#ffffff')
    .attr('stroke-width', d => state.selectedKey === keyFor(d) ? 4 : 2.5);

  merged.select('.chairCode')
    .text(d => els.codeToggle.checked ? d.chair_code : '')
    .attr('font-size', 12)
    .attr('font-weight', 800)
    .attr('fill', '#111827')
    .style('paint-order', 'stroke')
    .style('stroke', 'rgba(255,255,255,.85)')
    .style('stroke-width', 3);

  merged.select('.chairLabel')
    .text(d => els.labelsToggle.checked ? (d.section || d.instrument || '') : '')
    .attr('font-size', 10)
    .attr('fill', '#334155')
    .style('paint-order', 'stroke')
    .style('stroke', 'rgba(255,255,255,.8)')
    .style('stroke-width', 3);

  chairsLayer.selectAll('.chair').classed('chair--selected', d => keyFor(d) === state.selectedKey);
  updatePsv();
}

function updatePsv(){
  const rows = state.allBandChairs
    .filter(r => r.band_type === state.bandType)
    .sort((a,b) => (a.order - b.order) || a.chair_code.localeCompare(b.chair_code));
  const header = ['band_type','chair_code','instrument','section','default_x','default_y','order'];
  const body = rows.map(r => [r.band_type, r.chair_code, r.instrument, r.section, Math.round(r.default_x), Math.round(r.default_y), r.order].map(psvCell).join('|'));
  els.psvOutput.value = [header.join('|'), ...body].join('\n');
  els.status.textContent = `${rows.length} chairs loaded for ${state.bandType}. Drag to reposition, then download PSV.`;
}

function psvCell(v){
  return String(v ?? '').replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function downloadPsv(){
  const band = state.bandType || 'band';
  const blob = new Blob([els.psvOutput.value], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `BandChairs_${band}.psv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function copyPsv(){
  try {
    await navigator.clipboard.writeText(els.psvOutput.value);
    els.status.textContent = 'PSV copied to clipboard.';
  } catch {
    els.status.textContent = 'Clipboard copy failed. Use Download PSV instead.';
  }
}

function fitToVisible(){
  const rows = state.visible;
  if(!rows.length) return;
  const pad = 80;
  const minX = d3.min(rows, d => d.default_x) - pad;
  const maxX = d3.max(rows, d => d.default_x) + pad;
  const minY = d3.min(rows, d => d.default_y) - pad;
  const maxY = d3.max(rows, d => d.default_y) + pad;
  const width = maxX - minX;
  const height = maxY - minY;
  const svgNode = svg.node();
  const rect = svgNode.getBoundingClientRect();
  const scale = Math.max(0.45, Math.min(2.5, Math.min(rect.width / width, rect.height / height)));
  const tx = (rect.width - width * scale) / 2 - minX * scale;
  const ty = (rect.height - height * scale) / 2 - minY * scale;
  const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
  svg.transition().duration(250).call(zoom.transform, t);
}

function resetBand(){
  state.allBandChairs.forEach(row => {
    if(row.band_type !== state.bandType) return;
    const orig = state.originals.get(keyFor(row));
    if(!orig) return;
    row.default_x = orig.x;
    row.default_y = orig.y;
  });
  renderChairs();
  fitToVisible();
}

function resetSelectedChair(){
  const row = state.allBandChairs.find(r => keyFor(r) === state.selectedKey);
  if(!row) return;
  const orig = state.originals.get(keyFor(row));
  if(!orig) return;
  row.default_x = orig.x;
  row.default_y = orig.y;
  renderChairs();
  selectChair(row);
}

function applyManualCoords(){
  const row = state.allBandChairs.find(r => keyFor(r) === state.selectedKey);
  if(!row) return;
  row.default_x = Math.round(num(els.xInput.value));
  row.default_y = Math.round(num(els.yInput.value));
  renderChairs();
  selectChair(row);
}

function bind(){
  els.bandTypeSelect.addEventListener('change', () => {
    state.bandType = els.bandTypeSelect.value;
    refreshSectionFilter();
    renderChairs();
    fitToVisible();
    selectChair(state.visible[0] || null);
  });
  els.sectionFilter.addEventListener('change', () => {
    state.sectionFilter = els.sectionFilter.value;
    renderChairs();
    fitToVisible();
  });
  els.labelsToggle.addEventListener('change', renderChairs);
  els.codeToggle.addEventListener('change', renderChairs);
  els.gridToggle.addEventListener('change', renderChairs);
  els.zoomRange.addEventListener('input', () => {
    const k = Number(els.zoomRange.value) || 1;
    const box = svg.node().getBoundingClientRect();
    svg.call(zoom.transform, d3.zoomIdentity.translate(box.width * 0.08, box.height * 0.06).scale(k));
  });
  els.fitBtn.addEventListener('click', fitToVisible);
  els.resetBandBtn.addEventListener('click', resetBand);
  els.resetChairBtn.addEventListener('click', resetSelectedChair);
  els.applyCoordsBtn.addEventListener('click', applyManualCoords);
  els.downloadBtn.addEventListener('click', downloadPsv);
  els.copyBtn.addEventListener('click', copyPsv);
}

async function init(){
  bind();
  try {
    const data = await loadData();
    state.allBandChairs = (data.bandChairs || []).map(normaliseChair);
    state.bands = (data.bands || []).slice();
    const bandTypes = Array.from(new Set(state.allBandChairs.map(r => r.band_type).filter(Boolean)));
    els.bandTypeSelect.innerHTML = bandTypes.map(bt => `<option value="${escapeHtml(bt)}">${escapeHtml(bt)}</option>`).join('');
    state.bandType = bandTypes[0] || '';
    els.bandTypeSelect.value = state.bandType;
    refreshSectionFilter();
    renderChairs();
    fitToVisible();
    selectChair(state.visible[0] || null);
  } catch (err) {
    console.error(err);
    els.status.textContent = `Unable to load BandChairs: ${err.message}`;
    els.psvOutput.value = 'Unable to load BandChairs.';
  }
}

init();
