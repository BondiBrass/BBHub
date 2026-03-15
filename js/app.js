import * as Auth from "./auth.js";
import { DEBUG, findNext, normalizeEvent, renderDebugPanel } from "./debug.js";
import { loadData, saveRsvpResponse } from "./sheets.js";
import { compactFromNowLabel, escapeHtml, formatEventDateParts } from "./utils.js";

const state = {
  source:"unknown", members:[], rawEvents:[], events:[], program:[], pieces:[],
  rsvp:[], bandChairs:[], assignments:[], session:null,
  selectedEventId:"", savingRsvp:false, stageMode:"swimlane", stageViewBox:{x:0,y:0,w:1000,h:760},
  ignoreRehearsals: localStorage.getItem("bbhub.ignoreRehearsals") === "1"
};

function $(id){ return document.getElementById(id); }
function setStatus(msg){ $("statusLine").textContent = msg; }
function updateSummary(){ $("summaryLine").textContent = `${state.members.length} members · ${state.events.length} events · ${state.pieces.length} pieces`; }
function openMenu(){ $("sidePanel").classList.remove("hidden"); $("sidePanel").classList.add("open"); $("scrim").classList.remove("hidden"); }
function closeMenu(){ $("sidePanel").classList.add("hidden"); $("sidePanel").classList.remove("open"); $("scrim").classList.add("hidden"); }
function nowHeaderText(){
  const d = new Date();
  const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  return time;
}
function updateGreeting(){
  const hi = state.session ? `Hi ${state.session.first_name || state.session.display_name || "Member"}` : "Welcome Guest";
  $("greetingPill").textContent = state.session ? `${nowHeaderText()} · ${hi}` : hi;
  $("loginBtn").classList.toggle("hidden", !!state.session);
  $("logoutBtn").classList.toggle("hidden", !state.session);
}

function switchView(view){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".navBtn").forEach(v => v.classList.remove("active"));
  $("view-" + view).classList.add("active");
  document.querySelector(`.navBtn[data-view="${view}"]`)?.classList.add("active");
  closeMenu();
  if(view === "stage") renderStage();
  if(view === "library") renderLibrary();
  if(view === "planner") renderPlanner();
  if(view === "debug" && DEBUG) renderDebugPanel(state);
}

function labelForStatus(status){
  const s = String(status || "").toUpperCase();
  if(s === "Y") return "available";
  if(s === "M") return "maybe";
  if(s === "N") return "not available";
  return "unknown";
}
function statusClass(status){ return String(status || "").toUpperCase().toLowerCase() || "none"; }
function rsvpFor(eventId, memberId){ return (state.rsvp || []).find(r => String(r.event_id) === String(eventId) && String(r.member_id) === String(memberId)) || null; }
function memberById(id){ return (state.members || []).find(m => String(m.member_id) === String(id)) || null; }
function normalizeChair(ch){
  return {
    ...ch,
    chair_code: ch.chair_code || ch.chair_id || ch.code || "",
    chair_label: ch.chair_label || ch.instrument || ch.chair_code || "Chair",
    display_short: ch.display_short || ch.chair_code || ch.chair_id || "",
    section: ch.section || "Other",
    lane: ch.lane || ch.section || "Other",
    order: Number(ch.order || ch.sort_order || 999),
    default_x: Number(ch.default_x ?? ch.x ?? 0),
    default_y: Number(ch.default_y ?? ch.y ?? 0),
    is_optional: String(ch.is_optional || "").toLowerCase() === "true" || ch.is_optional === true
  };
}
function normalizeAssignment(a){
  return {
    ...a,
    chair_code: a.chair_code || a.chair_id || "",
    event_id: a.event_id || a.id || "",
    member_id: a.member_id || ""
  };
}
function getEventProgramRows(event){
  if(!event) return [];
  const progId = event.program_id || event.event_id || "";
  return (state.program || []).filter(r => String(r.program_id || r.event_id || "") === String(progId)).sort((a,b)=>Number(a.piece_order||999)-Number(b.piece_order||999));
}
function getUpcomingEvents(){
  return (state.events || [])
    .map(normalizeEvent)
    .filter(e => e.parsed instanceof Date && !Number.isNaN(+e.parsed))
    .filter(e => e.parsed >= new Date())
    .sort((a,b) => a.parsed - b.parsed);
}
function getFilteredUpcomingEvents(){
  const all = getUpcomingEvents();
  return state.ignoreRehearsals ? all.filter(e => e.type !== "rehearsal") : all;
}

function parseResponseDate(resp){
  const raw = resp?.updated_at || resp?.timestamp || resp?.created_at || resp?.saved_at || resp?.datetime || resp?.date_time || "";
  if(!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(+d) ? null : d;
}
function timeAgoShort(d){
  if(!d) return "";
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if(mins < 1) return "just now";
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if(hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if(days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
function renderSavedResponseMeta(resp){
  if(!resp) return "";
  const when = timeAgoShort(parseResponseDate(resp));
  return `<div class="responseSavedMeta"><span class="material-symbols-outlined">verified</span><span>${escapeHtml(labelForStatus(resp.status))}${when ? ` · saved ${escapeHtml(when)}` : ""}</span></div>`;
}
function renderEventCard(host, label, event, emptyText){
  if(!event){ host.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`; return; }

  const theme = event.type === "rehearsal" ? "rehearsal" : event.type === "gig" ? "gig" : "other";
  const when = formatEventDateParts(event.date, event.start_time, event.end_time, event.end_date);
  const venue = event.map_url
    ? `<a href="${escapeHtml(event.map_url)}" target="_blank" rel="noopener">${escapeHtml(event.venue || "n/a")}</a>`
    : escapeHtml(event.venue || "n/a");
  const response = state.session ? rsvpFor(event.event_id, state.session.member_id) : null;
  const status = state.session ? (response?.status || "") : "";
  const note = state.session ? (response?.comment || "") : "";
  const detailRows = getEventProgramRows(event);
  const detailTitle = event.type === "gig" ? "Program" : "Focus";
  const attireText = event.uniform || (event.type === "rehearsal" ? "Bring music / casual" : "TBC");

  host.innerHTML = `
    <div class="compactCard eventCard eventCard--${theme}" data-event-id="${escapeHtml(event.event_id)}">
      <div class="compactCard__row">
        <div class="compactCard__left">
          <span class="material-symbols-outlined compactCard__icon">${event.type === "rehearsal" ? "music_note" : "celebration"}</span>
          <span class="compactCard__title">${escapeHtml(event.title)}</span>
        </div>
        ${state.session ? renderResponseMatrix(event.event_id, status, response) : `<button class="pillBtn loginPromptBtn" data-open-login="1">Login</button>`}
      </div>
      <div class="compactCard__row">
        <div class="compactCard__left">
          <span class="material-symbols-outlined compactCard__icon">schedule</span>
          <span class="compactCard__metaText">${escapeHtml(when.dayLabel)} ${escapeHtml(when.dateLabel)} · ${escapeHtml(when.timeLabel || "")}</span>
        </div>
        <div class="compactCard__countdown"><span class="material-symbols-outlined">timer</span><span>${escapeHtml(compactFromNowLabel(event.parsed))}</span></div>
      </div>
      <div class="compactCard__row">
        <div class="compactCard__left">
          <span class="material-symbols-outlined compactCard__icon">location_on</span>
          <span class="compactCard__metaText">${venue}</span>
        </div>
      </div>
      <div class="compactCard__row">
        <div class="compactCard__left">
          <span class="material-symbols-outlined compactCard__icon">checkroom</span>
          <span class="compactCard__metaText">${escapeHtml(attireText)}</span>
        </div>
        <span class="themePill">${escapeHtml(label)}</span>
      </div>
      <details class="cardDetails">
        <summary><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle">expand_more</span> Details</summary>
        <div class="cardDetails__grid">
          <div>
            <div class="label">${detailTitle}</div>
            <div class="progList">
              ${detailRows.length ? detailRows.map(r => `<div class="progItem"><div class="progTitle">${escapeHtml(r.piece_order)}. ${escapeHtml(r.piece_name || r.title || "")}</div><div class="progMeta">${escapeHtml([r.composer, r.arranger, r.notes].filter(Boolean).join(" — "))}</div></div>`).join("") : `<div class="progItem"><div class="progTitle">${event.notes ? escapeHtml(event.notes) : `No ${detailTitle.toLowerCase()} loaded.`}</div></div>`}
            </div>
          </div>
          <div>
            <div class="label">Stage layout</div>
            <div class="inlineStageToolbar">
              <button class="pillBtn openStageBtn" data-open-stage="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">stadia_controller</span><span>Open full layout</span></button>
              <span class="inlineStageHint">Swimlane preview</span>
            </div>
            <div class="inlineStageBox" id="stage-preview-${escapeHtml(event.event_id)}"></div>
          </div>
          ${state.session ? `
            <div>
              <label class="field">
                <span>My note</span>
                <textarea rows="3" data-note-for="${escapeHtml(event.event_id)}" placeholder="Optional note">${escapeHtml(note)}</textarea>
              </label>
              <div class="saveRow">
                <button class="pillBtn saveEventRsvpBtn" data-save-event="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">save</span><span>Save response</span></button>
                <span class="saveMsg" id="save-msg-${escapeHtml(event.event_id)}">${status ? `Current response: ${escapeHtml(labelForStatus(status))}` : "No response saved yet."}</span>
              </div>
            </div>
          ` : `<div class="progItem">Login to RSVP and add a note.</div>`}
        </div>
      </details>
    </div>
  `;
  hydrateCardStagePreview(event.event_id);
}

function renderResponseMatrix(eventId, status, response){
  return `
    <div class="responseMatrixWrap">
      <div class="responseMatrix" role="group" aria-label="RSVP quick response">
        <button class="responseMini ${status === "Y" ? "active committed" : ""}" data-response-event="${escapeHtml(eventId)}" data-status="Y" title="Available">✓</button>
        <button class="responseMini ${status === "M" ? "active committed" : ""}" data-response-event="${escapeHtml(eventId)}" data-status="M" title="Maybe">?</button>
        <button class="responseMini ${status === "N" ? "active committed" : ""}" data-response-event="${escapeHtml(eventId)}" data-status="N" title="Not available">✕</button>
      </div>
      ${renderSavedResponseMeta(response)}
    </div>
  `;
}

function renderPlayersNeeded(nextGig){
  const bar = $("playersNeededBar");
  if(!nextGig){ bar.className = "alertBar hidden"; bar.innerHTML = ""; return; }
  const chairs = state.bandChairs.map(normalizeChair).filter(ch => !ch.is_optional);
  const assignments = state.assignments.map(normalizeAssignment).filter(a => String(a.event_id) === String(nextGig.event_id));
  const open = chairs.filter(ch => !assignments.some(a => String(a.chair_code) === String(ch.chair_code)));
  if(!open.length){
    bar.className = "alertBar ok";
    bar.innerHTML = `<span class="material-symbols-outlined">check_circle</span><span>Band strength good for ${escapeHtml(nextGig.title)}. All core chairs are filled in the current layout.</span>`;
    return;
  }
  const names = open.slice(0, 5).map(ch => ch.display_short || ch.chair_code || ch.chair_label).join(" · ");
  bar.className = "alertBar";
  bar.innerHTML = `<span class="material-symbols-outlined">warning</span><span>Players needed for ${escapeHtml(nextGig.title)} — ${escapeHtml(names)}${open.length > 5 ? ` +${open.length - 5} more` : ""}</span>`;
}

function renderActivity(){
  const host = $("activityMatrix");
  if(!state.session){ host.innerHTML = `<div class="empty">Login to see your participation snapshot.</div>`; return; }
  const today = new Date();
  today.setHours(0,0,0,0);
  const start = new Date(today);
  start.setDate(start.getDate() - 7 * 12 + 1);
  const dates = [];
  for(let i = 0; i < 84; i += 1){ const d = new Date(start); d.setDate(start.getDate() + i); dates.push(d); }
  const eventByDate = new Map(getUpcomingEvents().map(e => [e.date, e]));
  const months = [];
  let prevMonth = "";
  const cells = dates.map(d => {
    const iso = d.toISOString().slice(0,10);
    const monthLabel = d.toLocaleDateString(undefined, { month:"short" });
    if(d.getDay() === 0 && monthLabel !== prevMonth){ months.push(monthLabel); prevMonth = monthLabel; }
    const ev = eventByDate.get(iso);
    const resp = ev ? rsvpFor(ev.event_id, state.session.member_id) : null;
    const cls = resp ? statusClass(resp.status) : (ev ? "none" : "none");
    const title = ev ? `${ev.title} — ${resp ? labelForStatus(resp.status) : "no response yet"}` : iso;
    return `<div class="activityCell ${cls}" title="${escapeHtml(title)}"></div>`;
  }).join("");
  host.innerHTML = `
    <div class="activityWrap">
      <div class="activityMonths">${months.map(m => `<span>${escapeHtml(m)}</span>`).join("")}</div>
      <div class="activityGrid">${cells}</div>
      <div class="activityLegend"><span>Less</span><div class="activityCell none"></div><div class="activityCell y"></div><div class="activityCell m"></div><div class="activityCell n"></div><span>More signal</span></div>
    </div>
  `;
}

function renderStrength(){
  const host = $("strengthMatrix");
  const events = getFilteredUpcomingEvents().slice(0, 6);
  if(!events.length){ host.innerHTML = `<div class="empty">No upcoming events to show.</div>`; return; }

  const chairs = state.bandChairs.map(normalizeChair).filter(ch => !ch.is_optional);
  const sections = [...new Set(chairs.map(ch => ch.section))];
  const assignments = state.assignments.map(normalizeAssignment);

  const header = events.map(e => `<th>${escapeHtml(e.type === "rehearsal" ? "Reh" : "Gig")}<br>${escapeHtml((e.date || "").slice(5))}</th>`).join("");
  const rows = sections.map(section => {
    const sectionChairs = chairs.filter(ch => ch.section === section);
    const cells = events.map(e => {
      const eventAssignments = assignments.filter(a => String(a.event_id) === String(e.event_id));
      const filled = sectionChairs.filter(ch => eventAssignments.some(a => String(a.chair_code) === String(ch.chair_code))).length;
      const needed = sectionChairs.length || 1;
      const ratio = filled / needed;
      const cls = ratio >= 1 ? "good" : ratio >= 0.66 ? "warn" : "bad";
      return `<td class="${cls} ${e.type === "rehearsal" ? "dim" : ""}">${filled}/${needed}<span class="strengthSub">${ratio >= 1 ? "good" : ratio >= 0.66 ? "borderline" : "short"}</span></td>`;
    }).join("");
    return `<tr><th style="text-align:left">${escapeHtml(section)}</th>${cells}</tr>`;
  }).join("");
  host.innerHTML = `<div class="strengthWrap"><table class="strengthTable"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function populateStageEventSelect(){
  const sel = $("stageEventSelect");
  const items = getUpcomingEvents();
  sel.innerHTML = items.map(e => `<option value="${escapeHtml(e.event_id)}" ${e.event_id === state.selectedEventId ? "selected" : ""}>${escapeHtml(e.title)}</option>`).join("");
}


function setStageMode(mode){
  state.stageMode = mode || "swimlane";
  document.querySelectorAll(".segBtn").forEach(b => b.classList.toggle("active", b.dataset.stageMode === state.stageMode));
  const visual = $("stageVisualWrap");
  const table = $("stageTableWrap");
  if(visual && table){
    const isTable = state.stageMode === "table";
    visual.hidden = isTable;
    table.hidden = !isTable;
  }
}
function openStageForEvent(eventId, mode = "swimlane"){
  state.selectedEventId = eventId || state.selectedEventId;
  setStageMode(mode);
  switchView("stage");
  if($("stageEventSelect")) $("stageEventSelect").value = state.selectedEventId;
  renderStage();
  window.scrollTo({top:0, behavior:"smooth"});
}
function hydrateCardStagePreview(eventId){
  const host = document.getElementById(`stage-preview-${eventId}`);
  if(!host) return;
  host.innerHTML = `<svg class="inlineStageSvg" viewBox="0 0 1000 360" aria-label="Stage preview"></svg>`;
  const svg = host.querySelector("svg");
  const chairs = state.bandChairs.map(normalizeChair).sort((a,b)=>a.order - b.order);
  const assignments = state.assignments.map(normalizeAssignment).filter(a => String(a.event_id) === String(eventId));
  renderStageSwimlane(svg, chairs, assignments, eventId, {compact:true});
}

function renderStage(){
  const eventId = $("stageEventSelect").value || state.selectedEventId;
  const svg = $("stageSvg");
  const tableWrap = $("stageTableWrap");
  svg.innerHTML = "";
  const chairs = state.bandChairs.map(normalizeChair).sort((a,b)=>a.order - b.order);
  const assignments = state.assignments.map(normalizeAssignment).filter(a => String(a.event_id) === String(eventId));

  if(state.stageMode === "table"){
    renderStageTable(tableWrap, chairs, assignments, eventId);
  }else if(state.stageMode === "swimlane"){
    renderStageSwimlane(svg, chairs, assignments, eventId);
    applyStageViewBox();
  }else{
    renderStagePlan(svg, chairs, assignments, eventId);
    applyStageViewBox();
  }
}

function stageStatus(eventId, memberId){
  const resp = memberId ? rsvpFor(eventId, memberId) : null;
  return String(resp?.status || (memberId ? "Y" : "N")).toUpperCase();
}
function stageFill(status){ return status === "Y" ? "var(--ok)" : status === "M" ? "var(--maybe)" : "var(--no)"; }

function renderStagePlan(svg, chairs, assignments, eventId){
  const bg = document.createElementNS("http://www.w3.org/2000/svg","rect");
  bg.setAttribute("x","40"); bg.setAttribute("y","20"); bg.setAttribute("width","920"); bg.setAttribute("height","700");
  bg.setAttribute("rx","28"); bg.setAttribute("fill","rgba(0,0,0,0.04)"); bg.setAttribute("stroke","rgba(128,128,128,0.18)");
  svg.appendChild(bg);

  for(const ch of chairs){
    const a = assignments.find(x => String(x.chair_code) === String(ch.chair_code));
    const member = a ? memberById(a.member_id) : null;
    const status = stageStatus(eventId, member?.member_id);
    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    g.setAttribute("transform", `translate(${ch.default_x},${ch.default_y})`);
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("r","26"); c.setAttribute("fill", stageFill(status)); c.setAttribute("stroke","rgba(16,24,39,.22)"); c.setAttribute("stroke-width","2");
    const t1 = document.createElementNS("http://www.w3.org/2000/svg","text");
    t1.setAttribute("text-anchor","middle"); t1.setAttribute("y","-5"); t1.setAttribute("font-size","11"); t1.setAttribute("font-weight","800"); t1.textContent = ch.display_short;
    const t2 = document.createElementNS("http://www.w3.org/2000/svg","text");
    t2.setAttribute("text-anchor","middle"); t2.setAttribute("y","12"); t2.setAttribute("font-size","12"); t2.setAttribute("font-weight","800");
    t2.textContent = member ? ((member.first_name?.[0]||"") + (member.last_name?.[0]||"")).toUpperCase() : "--";
    const title = document.createElementNS("http://www.w3.org/2000/svg","title");
    title.textContent = `${ch.chair_label}\n${member ? member.display_name || "" : "Vacant"}\n${labelForStatus(status)}`;
    g.append(c, t1, t2, title); svg.appendChild(g);
  }
}

function renderStageSwimlane(svg, chairs, assignments, eventId, opts = {}){
  const lanes = [...new Set(chairs.map(ch => ch.lane))];
  const compact = !!opts.compact;
  const xStart = compact ? 120 : 150;
  const yStart = compact ? 42 : 60;
  const laneGap = compact ? 50 : 64;
  const seatGap = compact ? 62 : 72;

  lanes.forEach((lane, laneIndex) => {
    const y = yStart + laneIndex * laneGap;
    const laneLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
    laneLabel.setAttribute("x", compact ? "16" : "40"); laneLabel.setAttribute("y", String(y + 4)); laneLabel.setAttribute("font-size", compact ? "12" : "15"); laneLabel.setAttribute("font-weight", "800");
    laneLabel.textContent = lane;
    svg.appendChild(laneLabel);

    chairs.filter(ch => ch.lane === lane).sort((a,b)=>a.order-b.order).forEach((ch, idx) => {
      const x = xStart + idx * seatGap;
      const a = assignments.find(xa => String(xa.chair_code) === String(ch.chair_code));
      const member = a ? memberById(a.member_id) : null;
      const status = stageStatus(eventId, member?.member_id);
      const g = document.createElementNS("http://www.w3.org/2000/svg","g");
      g.setAttribute("transform", `translate(${x},${y})`);
      const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
      rect.setAttribute("x", compact ? "-24" : "-28"); rect.setAttribute("y", compact ? "-16" : "-18"); rect.setAttribute("width", compact ? "48" : "56"); rect.setAttribute("height", compact ? "32" : "36"); rect.setAttribute("rx", compact ? "8" : "10"); rect.setAttribute("fill", stageFill(status)); rect.setAttribute("stroke","rgba(16,24,39,.2)");
      const t = document.createElementNS("http://www.w3.org/2000/svg","text");
      t.setAttribute("text-anchor","middle"); t.setAttribute("font-size", compact ? "10" : "11"); t.setAttribute("font-weight","800"); t.setAttribute("y", compact ? "-1" : "-2"); t.textContent = ch.display_short;
      const t2 = document.createElementNS("http://www.w3.org/2000/svg","text");
      t2.setAttribute("text-anchor","middle"); t2.setAttribute("font-size", compact ? "9" : "10"); t2.setAttribute("y", compact ? "11" : "12"); t2.textContent = member ? (member.first_name || "") : "vacant";
      const title = document.createElementNS("http://www.w3.org/2000/svg","title");
      title.textContent = `${ch.chair_label}\n${member ? member.display_name || "" : "Vacant"}`;
      g.append(rect, t, t2, title); svg.appendChild(g);
    });
  });
}


function renderStageTable(host, chairs, assignments, eventId){
  if(!host) return;
  const rows = chairs.map(ch => {
    const a = assignments.find(xa => String(xa.chair_code) === String(ch.chair_code));
    const member = a ? memberById(a.member_id) : null;
    const status = stageStatus(eventId, member?.member_id);
    return `<tr class="status-${status.toLowerCase()}"><td><span class="chairChip">${escapeHtml(ch.display_short || ch.chair_code || '')}</span><div class="stageSub">${escapeHtml(ch.section || '')}</div></td><td><div class="stageName">${escapeHtml(ch.chair_label || '')}</div><div class="stageSub">${escapeHtml(ch.lane || '')}</div></td><td>${member ? `<div class="stageName">${escapeHtml(member.display_name || `${member.first_name||''} ${member.last_name||''}`.trim())}</div><div class="stageSub">${escapeHtml(member.member_id || '')}</div>` : `<span class="stageSub">Vacant</span>`}</td><td><span class="rsvpPill ${statusClass(status)}">${escapeHtml(labelForStatus(status))}</span></td></tr>`;
  }).join('');
  host.innerHTML = `<div class="strengthWrap"><table class="stageTable"><thead><tr><th>Chair</th><th>Position</th><th>Player</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function applyStageViewBox(){ const svg=$("stageSvg"); if(svg) svg.setAttribute("viewBox", `${state.stageViewBox.x} ${state.stageViewBox.y} ${state.stageViewBox.w} ${state.stageViewBox.h}`); }
function resetStageView(){ state.stageViewBox = {x:0,y:0,w:1000,h:760}; applyStageViewBox(); }
function zoomStage(f){ const vb=state.stageViewBox; const nw=vb.w*f, nh=vb.h*f; vb.x += (vb.w-nw)/2; vb.y += (vb.h-nh)/2; vb.w=nw; vb.h=nh; applyStageViewBox(); }
function panStage(dx,dy){ const vb=state.stageViewBox; vb.x += dx; vb.y += dy; applyStageViewBox(); }

function renderLibrary(){
  const host = $("libraryList");
  if(!state.pieces.length){ host.innerHTML = `<div class="empty">No pieces found.</div>`; return; }
  host.innerHTML = state.pieces.map(p => `<div class="libraryItem"><div class="libraryTitle">${escapeHtml(p.title || p.piece_name || p.piece_id || "")}</div><div class="libraryMeta">${escapeHtml([p.composer, p.arranger].filter(Boolean).join(" — "))}</div></div>`).join("");
}

function renderPlanner(){
  const host = $("plannerList");
  const items = getFilteredUpcomingEvents();
  if(!items.length){ host.innerHTML = `<div class="empty">No events found.</div>`; return; }
  host.innerHTML = items.map(e => {
    const when = formatEventDateParts(e.date, e.start_time, e.end_time, e.end_date);
    return `<div class="plannerItem plannerItem--${escapeHtml(e.type || "other")}"><div class="plannerTop"><span class="plannerPill">${escapeHtml(e.type || "event")}</span><span class="plannerWhen">${escapeHtml(when.dayLabel)} · ${escapeHtml(when.dateLabel)} · ${escapeHtml(when.timeLabel || "")}</span></div><div class="plannerTitle">${escapeHtml(e.title)}</div><div class="plannerMeta">${escapeHtml(e.venue || "")}</div></div>`;
  }).join("");
}

function renderHome(){
  const nextGig = findNext(state.events, "gig");
  const nextReh = findNext(state.events, "rehearsal");
  state.selectedEventId = nextGig?.event_id || nextReh?.event_id || "";
  renderPlayersNeeded(nextGig);
  renderEventCard($("nextGigCard"), "NEXT GIG", nextGig, "No upcoming gigs found.");
  renderEventCard($("nextRehCard"), "NEXT REHEARSAL", nextReh, "No upcoming rehearsals found.");
  renderActivity();
  renderStrength();
  populateStageEventSelect();
}

async function persistRsvp(eventId, status){
  if(!state.session) return { ok:false, message:"Login first." };
  if(!eventId) return { ok:false, message:"No event selected." };
  const noteBox = document.querySelector(`[data-note-for="${CSS.escape(eventId)}"]`);
  const note = noteBox?.value || "";
  const existing = state.rsvp.find(r => String(r.event_id) === String(eventId) && String(r.member_id) === String(state.session.member_id));
  const snapshot = existing ? { ...existing } : null;

  if(existing){ existing.status = status; existing.comment = note; }
  else state.rsvp.push({ event_id:eventId, member_id:state.session.member_id, status, comment:note });

  const result = await saveRsvpResponse({
    event_id:eventId,
    member_id:state.session.member_id,
    member_name:state.session.display_name || `${state.session.first_name || ""} ${state.session.last_name || ""}`.trim(),
    status, comment:note, updated_at:new Date().toISOString()
  });

  if(!result.ok){
    if(existing && snapshot){ existing.status = snapshot.status; existing.comment = snapshot.comment; }
    else state.rsvp = state.rsvp.filter(r => !(String(r.event_id) === String(eventId) && String(r.member_id) === String(state.session.member_id)));
  }
  return result;
}

function bindHomeDelegates(){
  document.addEventListener("click", async (ev) => {
    const loginBtn = ev.target.closest(".loginPromptBtn");
    if(loginBtn){ $("loginDialog").showModal(); return; }

    const respBtn = ev.target.closest(".responseMini");
    if(respBtn){
      if(!state.session){ $("loginDialog").showModal(); return; }
      const { responseEvent, status } = respBtn.dataset;
      const msg = $(`save-msg-${responseEvent}`);
      if(msg) msg.textContent = `Pending response: ${labelForStatus(status)}`;
      document.querySelectorAll(`.responseMini[data-response-event="${CSS.escape(responseEvent)}"]`).forEach(btn => btn.classList.toggle("active", btn.dataset.status === status));
      return;
    }

    const openStageBtn = ev.target.closest(".openStageBtn");
    if(openStageBtn){
      openStageForEvent(openStageBtn.dataset.openStage || "", "swimlane");
      return;
    }

    const saveBtn = ev.target.closest(".saveEventRsvpBtn");
    if(saveBtn){
      const eventId = saveBtn.dataset.saveEvent;
      const active = document.querySelector(`.responseMini.active[data-response-event="${CSS.escape(eventId)}"]`);
      const msg = $(`save-msg-${eventId}`);
      if(!active){ if(msg) msg.textContent = "Choose a response first."; return; }
      if(msg) msg.textContent = "Saving…";
      const result = await persistRsvp(eventId, active.dataset.status || "");
      if(msg) msg.textContent = result.ok ? `Saved response: ${labelForStatus(active.dataset.status || "")}` : `Save failed: ${result.message}`;
      renderHome();
      if(document.querySelector("#view-stage.active")) renderStage();
      if(DEBUG) renderDebugPanel(state);
    }
  });
}

function bindLoginUi(){
  $("loginBtn").addEventListener("click", () => $("loginDialog").showModal());
  $("findLoginBtn").addEventListener("click", () => {
    const key = $("loginKeyInput").value;
    const member = Auth.findByLoginKey(state.members, key);
    const box = $("loginResult");
    if(!member){ box.className = "loginResult muted"; box.textContent = "No member matched that login name."; return; }
    Auth.saveUser(member);
    state.session = Auth.loadUser();
    updateGreeting();
    setInterval(updateGreeting, 30000);
    box.className = "loginResult";
    box.innerHTML = `Welcome <strong>${escapeHtml(member.first_name || member.display_name || "Member")}</strong> (${escapeHtml(member.member_id)})`;
    renderHome();
  });
  $("logoutBtn").addEventListener("click", () => {
    Auth.clearUser();
    state.session = null;
    updateGreeting();
    $("loginResult").className = "loginResult muted";
    $("loginResult").textContent = "Logged out.";
    renderHome();
  });
}

function bindControls(){
  const menuBtn = $("menuBtn");
  const scrim = $("scrim");
  const backTopBtn = $("backTopBtn");
  const themeBtn = $("themeBtn");
  if (menuBtn) menuBtn.addEventListener("click", openMenu);
  if (scrim) scrim.addEventListener("click", closeMenu);
  if (backTopBtn) backTopBtn.addEventListener("click", () => window.scrollTo({top:0, behavior:"smooth"}));
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "light";
    document.documentElement.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  });
  document.querySelectorAll(".navBtn").forEach(btn => btn.addEventListener("click", () => {
    switchView(btn.dataset.view);
    window.scrollTo({top:0, behavior:"smooth"});
  }));
  $("stageEventSelect").addEventListener("change", ()=>{ resetStageView(); renderStage(); });
  $("stageZoomInBtn").addEventListener("click", ()=> zoomStage(0.8));
  $("stageZoomOutBtn").addEventListener("click", ()=> zoomStage(1.25));
  $("stagePanLeftBtn").addEventListener("click", ()=> panStage(-60,0));
  $("stagePanRightBtn").addEventListener("click", ()=> panStage(60,0));
  $("stagePanUpBtn").addEventListener("click", ()=> panStage(0,-40));
  $("stagePanDownBtn").addEventListener("click", ()=> panStage(0,40));
  $("stageFitBtn").addEventListener("click", ()=> resetStageView());
  $("ignoreRehearsalsToggle").checked = state.ignoreRehearsals;
  $("plannerIgnoreRehearsalsToggle").checked = state.ignoreRehearsals;
  [$("ignoreRehearsalsToggle"), $("plannerIgnoreRehearsalsToggle")].forEach(el => el.addEventListener("change", () => {
    state.ignoreRehearsals = el.checked;
    $("ignoreRehearsalsToggle").checked = state.ignoreRehearsals;
    $("plannerIgnoreRehearsalsToggle").checked = state.ignoreRehearsals;
    localStorage.setItem("bbhub.ignoreRehearsals", state.ignoreRehearsals ? "1" : "0");
    renderStrength(); renderPlanner();
  }));
  setStageMode(state.stageMode);
  document.querySelectorAll(".segBtn").forEach(btn => btn.addEventListener("click", () => {
    setStageMode(btn.dataset.stageMode || "swimlane");
    renderStage();
  }));
}

async function start(){
  try{
    state.session = Auth.loadUser();
    updateGreeting();
    setInterval(updateGreeting, 30000);
    const data = await loadData();
    state.source = data.source || "unknown";
    state.members = data.members || [];
    state.rawEvents = data.rawEvents || [];
    state.events = (data.events || []).map(normalizeEvent);
    state.program = data.program || [];
    state.pieces = data.pieces || [];
    state.rsvp = data.rsvp || [];
    state.bandChairs = data.bandChairs || [];
    state.assignments = data.assignments || [];
    updateSummary();
    setStatus(`Loaded (${state.source}) — ${new Date().toLocaleString()}`);
    renderHome();
    renderPlanner();
    if(DEBUG) renderDebugPanel(state);
    setInterval(() => {
      renderHome();
      if(document.querySelector("#view-stage.active")) renderStage();
    }, 60000);
  }catch(err){
    setStatus(`Load failed: ${err.message}`);
    $("nextGigCard").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    $("nextRehCard").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    $("activityMatrix").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    $("strengthMatrix").innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    if(DEBUG) $("debugBox").innerHTML = `<pre class="mono">${escapeHtml(String(err.stack || err.message || err))}</pre>`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bindControls();
  bindLoginUi();
  bindHomeDelegates();
  start();
});
