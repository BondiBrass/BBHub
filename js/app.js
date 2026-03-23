import * as Auth from "./auth.js";
import { DEBUG, findNext, normalizeEvent, renderDebugPanel } from "./debug.js";
import { loadData, saveRsvpResponse } from "./sheets.js";
import { compactFromNowLabel, escapeHtml, formatEventDateParts } from "./utils.js";

const state = {
  source:"unknown", members:[], rawEvents:[], events:[], program:[], pieces:[],
  rsvp:[], bandChairs:[], assignments:[], bands:[], session:null,
  selectedEventId:"", savingRsvp:false, stageMode:(localStorage.getItem("bbhub.stageMode") || "table"), stageViewBox:{x:0,y:0,w:1000,h:760},
  ignoreRehearsals: localStorage.getItem("bbhub.ignoreRehearsals") === "1",
  guestBandFilter: JSON.parse(localStorage.getItem("bbhub.guestBandFilter") || "[]")
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
function getInitials(name){
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "B") + (parts[1]?.[0] || parts[0]?.[1] || "B");
}
function stageMemberLabel(member){
  if(!member) return "vacant";
  const first = String(member.first_name || "").trim();
  const display = String(member.display_name || member.display_name_check || [member.first_name, member.last_name].filter(Boolean).join(" ") || "").trim();
  const parts = display.split(/\s+/).filter(Boolean);
  const surnameInitial = String(member.last_name || "").trim()?.[0] || (parts.length > 1 ? parts[parts.length - 1][0] : "");
  const base = first || parts[0] || member.member_id || "player";
  return `${base}${surnameInitial ? surnameInitial.toUpperCase() : ""}`;
}
function chairAssignmentsByCode(assignments){
  const map = new Map();
  (assignments || []).forEach(a => {
    const key = String(a?.chair_code || "").trim();
    if(!key) return;
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(a);
  });
  return map;
}
function membersForChair(assignmentsByChair, chairCode){
  return (assignmentsByChair.get(String(chairCode || "").trim()) || [])
    .map(a => {
      const m = memberById(a.member_id);
      if(m) return { ...m, ...a };
      return {
        member_id: a.member_id || a.member_id_check || "",
        first_name: a.first_name || "",
        last_name: a.last_name || "",
        display_name: a.display_name || a.display_name_check || "",
        display_name_check: a.display_name_check || ""
      };
    })
    .filter(m => {
      const label = String(m?.first_name || m?.display_name || m?.display_name_check || m?.member_id || "").trim();
      return !!label;
    });
}
function chairStatusInfo(eventId, members){
  const statuses = (members || []).map(member => stageStatus(eventId, member?.member_id));
  if(!statuses.length) return { code: "N", label: "vacant" };
  if(statuses.includes("Y")) return { code: "Y", label: statuses.length === 1 ? "available" : `${statuses.filter(s => s === "Y").length}/${statuses.length} available` };
  if(statuses.includes("M")) return { code: "M", label: statuses.length === 1 ? "maybe" : `${statuses.filter(s => s === "M").length}/${statuses.length} maybe` };
  return { code: "N", label: statuses.length === 1 ? "not available" : `${statuses.length} not available` };
}
function chairMembersMarkup(eventId, members){
  if(!(members || []).length) return `<span class="stageName stageName--vacant">Vacant</span>`;
  return members.map(member => {
    const status = stageStatus(eventId, member?.member_id);
    const isCurrent = state.session && String(state.session.member_id || "") === String(member?.member_id || "");
    return `<span class="stageName stageName--${statusClass(status)}${isCurrent ? ' stageName--me' : ''}">${escapeHtml(stageMemberLabel(member))}</span>`;
  }).join('<br>');
}
function chairMembersTitle(chairLabel, members, eventId){
  if(!(members || []).length) return `${chairLabel}\nVacant`;

  return [chairLabel]
    .concat(members.map(member =>
      `${member.display_name || member.display_name_check || stageMemberLabel(member)} — ${labelForStatus(stageStatus(eventId, member?.member_id))}`
    ))
    .join("\n");
}
function chairsGroupedBySection(chairs){
  const groups = new Map();
  (chairs || []).forEach(ch => {
    const key = String(ch.section || ch.lane || 'Band').trim() || 'Band';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ch);
  });
  return [...groups.entries()]
    .map(([section, items]) => [section, items.slice().sort((a,b)=>Number(a.order||0)-Number(b.order||0))])
    .sort((a,b) => {
      const ao = Number(a[1][0]?.order || 0);
      const bo = Number(b[1][0]?.order || 0);
      return ao - bo || a[0].localeCompare(b[0]);
    });
}
function updateGreeting(){
  const pill = $("greetingPill");
  if(state.session){
    const name = state.session.display_name || [state.session.first_name, state.session.last_name].filter(Boolean).join(" ") || "Member";
    const initials = escapeHtml(getInitials(name).toUpperCase());
    const first = escapeHtml(state.session.first_name || state.session.display_name || "Member");
    pill.innerHTML = `<span class="avatarCircle">${initials}</span><span class="userPill__text"><strong>Hi ${first}</strong><span>${escapeHtml(nowHeaderText())}</span></span>`;
  }else{
    pill.innerHTML = `<span class="userPill__text"><strong>Welcome guest</strong><span>Login to book into gigs</span></span>`;
  }
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
  if(view === "planner") renderMatrixHome();
  renderPlanner();
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
function parseRsvpTimestamp(r){
  const raw = r?.timestamp || "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function normEventId(v){
  return String(v || "").replace(/^e/, "").trim();
}

function rsvpFor(eventId, memberId){
  return (state.rsvp || [])
    .filter(r =>
      normEventId(r.event_id) === normEventId(eventId) &&
      String(r.member_id || "").trim() === String(memberId || "").trim()
    )
    .sort((a, b) => parseRsvpTimestamp(b) - parseRsvpTimestamp(a))[0] || null;
}

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
function renderProgramItems(detailRows, detailTitle, event){
  if(!detailRows.length){
    return `<div class="progItem"><div class="progTitle">${event.notes ? escapeHtml(event.notes) : `No ${detailTitle.toLowerCase()} loaded.`}
      </div></div>`;
  }
  return detailRows.map(r => {
    const yt = String(r.youtube || r.youtube_url || r.url || "").trim();
    const meta = [r.composer, r.arranger, r.notes].filter(Boolean).join(" — ");
    return `<div class="progItem"><div class="progTitleRow"><div class="progTitle">${escapeHtml(r.piece_order)}. ${escapeHtml(r.piece_name || r.title || "")}</div>${yt ? `<a class="progYoutubeLink" href="${escapeHtml(yt)}" target="_blank" rel="noopener" title="Open YouTube"><span class="material-symbols-outlined">smart_display</span></a>` : ``}</div><div class="progMeta">${escapeHtml(meta)}</div></div>`;
  }).join("");
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
  if(!resp || !state.session) return "";
  const d = parseResponseDate(resp);
  const when = timeAgoShort(d);
  const exact = d ? d.toLocaleString([], { weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "";
  const who = escapeHtml(getInitials(state.session.display_name || [state.session.first_name, state.session.last_name].filter(Boolean).join(" ") || "Member").toUpperCase());
  return `<div class="responseSavedMeta"><span class="avatarCircle avatarCircle--tiny">${who}</span><span>You’re ${escapeHtml(labelForStatus(resp.status))}${when ? ` · updated ${escapeHtml(when)}` : ""}${exact ? ` · ${escapeHtml(exact)}` : ""}</span></div>`;
}

function getMemberBands(member){
  return String(member?.bands || "")
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
}
function currentMember(){
  return state.session ? memberById(state.session.member_id) : null;
}
function eventBandType(event){ return String(event?.band_type || "").trim(); }
function eventBandLabel(event){
  const bt = eventBandType(event);
  const found = (state.bands || []).find(b => String(b.band_type||"").trim() === bt);
  return found?.band_label || bt || "All Bands";
}
function eventBandColour(event){
  const bt = eventBandType(event);
  const found = (state.bands || []).find(b => String(b.band_type||"").trim() === bt);
  return found?.colour || "#e5e7eb";
}
function bandTextColour(colour){
  const c = String(colour || "").trim().toLowerCase();
  if(!c) return "#111827";
  const darkNames = new Set(["navy","purple","blue","red","teal","maroon","indigo","brown","black"]);
  if(darkNames.has(c)) return "#ffffff";
  if(c[0] === "#"){
    let hex = c.slice(1);
    if(hex.length === 3) hex = hex.split("").map(ch => ch + ch).join("");
    if(hex.length === 6){
      const r = parseInt(hex.slice(0,2), 16);
      const g = parseInt(hex.slice(2,4), 16);
      const b = parseInt(hex.slice(4,6), 16);
      const luminance = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
      return luminance < 0.58 ? "#ffffff" : "#111827";
    }
  }
  return "#111827";
}
function buildCardBandLabel(baseLabel, event){
  const bandLabel = eventBandLabel(event);
  const upperBand = String(bandLabel || '').toUpperCase();
  if(baseLabel === "NEXT GIG") return `NEXT ${upperBand} GIG`;
  if(baseLabel === "NEXT REHEARSAL") return `NEXT ${upperBand} REHEARSAL`;
  return upperBand ? `${baseLabel} · ${upperBand}` : baseLabel;
}

function bandChipStyle(colour){
  const bg = String(colour || "#e5e7eb").trim() || "#e5e7eb";
  const fg = bandTextColour(bg);
  return `--band-colour:${escapeHtml(bg)};--band-text:${escapeHtml(fg)};background-color:${escapeHtml(bg)} !important;color:${escapeHtml(fg)} !important;border:1px solid rgba(17,24,39,.14) !important;`;
}
function getAvailableBandTypes(){
  return (state.bands || []).map(b => String(b.band_type || "").trim()).filter(Boolean);
}
function getGuestBandFilter(){
  const available = getAvailableBandTypes();
  const selected = (Array.isArray(state.guestBandFilter) ? state.guestBandFilter : [])
    .map(v => String(v || "").trim())
    .filter(v => available.includes(v));
  return selected.length ? selected : available;
}
function saveGuestBandFilter(values){
  state.guestBandFilter = Array.from(new Set((values || []).map(v => String(v || "").trim()).filter(Boolean)));
  localStorage.setItem("bbhub.guestBandFilter", JSON.stringify(state.guestBandFilter));
}
function eventsVisibleToCurrentUser(events){
  const member = currentMember();
  if(!member){
    const bands = getGuestBandFilter();
    if(!bands.length) return events || [];
    return (events || []).filter(e => {
      const bt = eventBandType(e);
      return !bt || bands.includes(bt);
    });
  }
  const bands = getMemberBands(member);
  if(!bands.length) return events;
  return (events || []).filter(e => {
    const bt = eventBandType(e);
    return !bt || bands.includes(bt);
  });
}
function chairsForEvent(event){
  const bt = eventBandType(event);
  return state.bandChairs.map(normalizeChair).filter(ch => !bt || String(ch.band_type || "").trim() === bt).sort((a,b)=>a.order-b.order);
}
function assignmentsForEvent(eventOrId){
  const event = typeof eventOrId === "string" ? (state.events || []).find(e => String(e.event_id) === String(eventOrId)) : eventOrId;
  const eventId = typeof eventOrId === "string" ? eventOrId : event?.event_id;
  const bt = eventBandType(event);
  return state.assignments.map(normalizeAssignment).filter(a => String(a.event_id) === String(eventId) && (!bt || String(a.band_type || "").trim() === bt));
}
function findNextByBand(events, type){
  const map = new Map();
  (events || [])
    .filter(e => e.type === type && e.parsed instanceof Date && !Number.isNaN(+e.parsed) && e.parsed >= new Date())
    .sort((a,b)=>a.parsed-b.parsed)
    .forEach(e => {
      const key = eventBandType(e) || "_all";
      if(!map.has(key)) map.set(key, e);
    });
  return [...map.values()];
}
function gigStrengthAlert(event){
  const chairs = chairsForEvent(event).filter(ch => !ch.is_optional);
  const assignments = assignmentsForEvent(event);
  const open = chairs.filter(ch => !assignments.some(a => String(a.chair_code) === String(ch.chair_code)));
  if(!chairs.length) return "";
  const toneClass = open.length ? "" : " ok";
  const icon = open.length ? "warning" : "check_circle";
  const text = open.length
    ? `Players needed — ${open.slice(0, 5).map(ch => ch.display_short || ch.chair_code || ch.chair_label).join(" · ")}${open.length > 5 ? ` +${open.length - 5} more` : ""}`
    : `Band strength good. All core chairs are currently filled.`;
  return `<div class="eventInlineAlert${toneClass}"><span class="material-symbols-outlined">${icon}</span><span class="eventInlineAlert__text"><a href="#" class="inlineAlertDetailsLink" data-open-details="${escapeHtml(event.event_id)}">${escapeHtml(text)}</a></span></div>`;
}









function playersNeededSummary(event){
  const explicit = String(
    event?.players_needed_instruments ||
    event?.playersNeededInstruments ||
    event?.players_needed_text ||
    event?.playersNeededText ||
    event?.needed_instruments ||
    event?.neededInstruments ||
    ""
  ).trim();

  const explicitCount = Number(event?.players_needed || event?.playersNeeded || 0);

  let text = "";
  if(explicit){
    text = explicit;
  }else if(explicitCount > 0){
    text = String(explicitCount);
  }else if(typeof chairsForEvent === "function" && typeof assignmentsForEvent === "function"){
    const chairs = chairsForEvent(event).filter(ch => !ch.is_optional);
    const assignments = assignmentsForEvent(event);
    const open = chairs.filter(ch => !assignments.some(a => String(a.chair_code) === String(ch.chair_code)));
    if(open.length){
      text = open.slice(0, 5).map(ch => ch.display_short || ch.chair_code || ch.chair_label || "").filter(Boolean).join(" · ");
      if(open.length > 5) text += ` +${open.length - 5} more`;
    }
  }

  if(!text) return "";

  return `<div class="playersNeededRow playersNeededRow--needed">
    <span class="playersNeededIconFallback">⚠</span>
    <span class="playersNeededLabel">Players needed:</span>
    <span class="playersNeedList">${escapeHtml(text)}</span>
  </div>`;
}








function renderEventCard(host, label, event, emptyText){
  if(!host) return;
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
  const cardBandLabel = buildCardBandLabel(label, event);
  const bandAccent = eventBandColour(event);
  const neededCount = Number(event.players_needed || event.playersNeeded || 0);
  const maybeCount = Number(event.maybe_count || event.maybeCount || 0);
  const alertLineClass = neededCount > 0 ? "alertLine--needed" : (maybeCount > 0 ? "alertLine--warning" : "alertLine--ok");
  const playersNeededHtml = playersNeededSummary(event) ? `<div class="compactCard__playersNeeded">${playersNeededSummary(event)}</div>` : "";

  host.innerHTML = `
    <div class="compactCard eventCard eventCard--${theme} ${label === "NEXT GIG" ? "eventCard--hero" : ""} ${alertLineClass}" data-event-id="${escapeHtml(event.event_id)}" style="--band-accent:${escapeHtml(bandAccent)};">
      <div class="compactCard__row">
        <div class="compactCard__left">
          <span class="material-symbols-outlined compactCard__icon">${event.type === "rehearsal" ? "music_note" : "celebration"}</span>
          <span class="compactCard__title">${escapeHtml(event.title)}</span>
        </div>
        ${state.session ? renderResponseMatrix(event.event_id, status, response) : `<button class="pillBtn loginPromptBtn" data-open-login="1"><span class="material-symbols-outlined">how_to_reg</span><span>RSVP</span></button>`}
      </div>
      ${event.notes ? `<div class="eventNote"><span class="material-symbols-outlined">priority_high</span><div class="eventNote__text">${escapeHtml(event.notes)}</div></div>` : ``}
            ${playersNeededHtml || ""}
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
        <span class="themePill" style="${bandChipStyle(eventBandColour(event))}">${escapeHtml(cardBandLabel)}</span>
      </div>
      <details class="cardDetails">
        <summary><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle">expand_more</span> Details</summary>
        <div class="cardDetails__grid">
          <div>
            <div class="label">Stage layout</div>
            <div class="inlineStageToolbar">
              <button class="pillBtn openStageBtn" data-open-stage="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">stadia_controller</span><span>Open full layout</span></button>
              <span class="inlineStageHint">Swimlane preview</span>
            </div>
            <div class="inlineStageBox" id="stage-preview-${escapeHtml(event.event_id)}"></div>
          </div>
          <div>
            <div class="label">${detailTitle}</div>
            <div class="progList">
              ${renderProgramItems(detailRows, detailTitle, event)}
            </div>
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


function renderHeroBandChips(){
  const host = $("heroBandChips");
  if(!host) return;
  const bands = (state.bands || [])
    .slice()
    .sort((a,b)=>Number(a.sort_order || 999) - Number(b.sort_order || 999))
    .filter(b => String(b.band_type || "").trim());
  if(!bands.length){
    host.innerHTML = '';
    return;
  }

  host.classList.add('heroChips--guest');
  const selected = new Set(getGuestBandFilter());
  host.innerHTML = bands.map(b => {
    const bg = b.colour || '#e5e7eb';
    const label = b.band_label || b.band_type || 'Band';
    const bt = String(b.band_type || '').trim();
    const checked = selected.has(bt) ? 'checked' : '';
    return `<label class="heroChip heroChip--band heroChip--check" style="${bandChipStyle(bg)}"><input type="checkbox" class="heroBandCheck" data-band-type="${escapeHtml(bt)}" ${checked}><span>${escapeHtml(label)}</span></label>`;
  }).join('');
}


function renderPlayersNeeded(nextGigs){
  const bar = $("playersNeededBar");
  const gigs = Array.isArray(nextGigs) ? nextGigs : (nextGigs ? [nextGigs] : []);
  if(!gigs.length){ bar.className = "alertStack hidden"; bar.innerHTML = ""; return; }

  const cards = gigs.map(gig => {
    const chairs = chairsForEvent(gig).filter(ch => !ch.is_optional);
    const assignments = assignmentsForEvent(gig);
    const open = chairs.filter(ch => !assignments.some(a => String(a.chair_code) === String(ch.chair_code)));
    const tone = open.length ? "" : " ok";
    const icon = open.length ? "warning" : "check_circle";
    const text = open.length
      ? `Players needed for ${gig.title} — ${open.slice(0, 5).map(ch => ch.display_short || ch.chair_code || ch.chair_label).join(" · ")}${open.length > 5 ? ` +${open.length - 5} more` : ""}`
      : `Band strength good for ${gig.title}. All core chairs are filled in the current layout.`;
    return `<div class="alertBar${tone}"><span class="material-symbols-outlined">${icon}</span><span>${escapeHtml(text)}</span><span class="bandMetaPill" style="${bandChipStyle(eventBandColour(gig))}">${escapeHtml(eventBandLabel(gig))}</span></div>`;
  });

  bar.className = "alertStack";
  bar.innerHTML = cards.join("");
}

function renderActivity(){
  const host = $("activityMatrix");
  if(!host) return;
  const today = new Date();
  today.setHours(0,0,0,0);
  const end = new Date(today);
  end.setDate(end.getDate() + 7 * 12);

  const visibleEvents = eventsVisibleToCurrentUser(state.events || [])
    .map(normalizeEvent)
    .filter(e => e.parsed instanceof Date && !Number.isNaN(+e.parsed))
    .filter(e => e.parsed >= today && e.parsed <= end)
    .sort((a,b) => a.parsed - b.parsed);

  const visibleBands = (state.bands || [])
    .slice()
    .sort((a,b)=>Number(a.sort_order || 999) - Number(b.sort_order || 999))
    .filter(b => {
      const bt = String(b.band_type || '').trim();
      return !bt || visibleEvents.some(e => eventBandType(e) === bt);
    });

  if(!visibleEvents.length){
    host.innerHTML = `<div class="empty">No rehearsals or gigs found in the next 12 weeks.</div>`;
    return;
  }

  const byBand = new Map();
  visibleEvents.forEach(e => {
    const bt = eventBandType(e) || '_all';
    if(!byBand.has(bt)) byBand.set(bt, []);
    byBand.get(bt).push(e);
  });

  const orderedBands = visibleBands.length ? visibleBands : [...byBand.keys()].map(bt => ({ band_type:bt, band_label:eventBandLabel({band_type:bt}), colour:eventBandColour({band_type:bt}), sort_order:999 }));

  host.innerHTML = `
    <div class="bandScheduleWrap">
      ${orderedBands.map(band => {
        const bt = String(band.band_type || '').trim();
        const items = (byBand.get(bt) || []).sort((a,b) => a.parsed - b.parsed);
        if(!items.length) return '';
        const bg = band.colour || '#e5e7eb';
        const fg = bandTextColour(bg);
        return `
          <section class="bandScheduleBlock">
            <div class="bandScheduleHead">
              <span class="bandMetaPill" style="${bandChipStyle(bg)}">${escapeHtml(band.band_label || bt || 'Band')}</span>
              <span class="bandScheduleRange">Next 12 weeks</span>
            </div>
            <div class="bandScheduleList">
              ${items.map(e => {
                const when = formatEventDateParts(e.date, e.start_time, e.end_time, e.end_date);
                return `
                  <article class="bandScheduleItem bandScheduleItem--${escapeHtml(e.type || 'other')}">
                    <div class="bandScheduleDate">
                      <div class="bandScheduleDay">${escapeHtml(when.dayLabel)}</div>
                      <div class="bandScheduleDateText">${escapeHtml(when.dateLabel)}</div>
                    </div>
                    <div class="bandScheduleBody">
                      <div class="bandScheduleTop">
                        <span class="plannerPill">${escapeHtml(e.type || 'event')}</span>
                        <span class="bandScheduleTime">${escapeHtml(when.timeLabel || '')}</span>
                      </div>
                      <div class="bandScheduleTitle">${escapeHtml(e.title || '')}</div>
                      <div class="bandScheduleMeta">${escapeHtml(e.venue || '')}</div>
                    </div>
                  </article>`;
              }).join('')}
            </div>
          </section>`;
      }).join('')}
    </div>`;
}

function renderStrength(){
  const host = $("strengthMatrix");
  if(!host) return;
  const events = eventsVisibleToCurrentUser(getFilteredUpcomingEvents()).slice(0, 6);
  if(!events.length){ host.innerHTML = `<div class="empty">No upcoming events to show.</div>`; return; }

  const sections = [...new Set(
    events.flatMap(e => chairsForEvent(e).filter(ch => !ch.is_optional).map(ch => ch.section))
  )];

  const header = events.map(e => `<th>${escapeHtml(e.type === "rehearsal" ? "Reh" : "Gig")}<br>${escapeHtml((e.date || "").slice(5))}</th>`).join("");
  const rows = sections.map(section => {
    const cells = events.map(e => {
      const eventChairs = chairsForEvent(e).filter(ch => !ch.is_optional && ch.section === section);
      const eventAssignments = assignmentsForEvent(e);
      const filled = eventChairs.filter(ch => eventAssignments.some(a => String(a.chair_code) === String(ch.chair_code))).length;
      const needed = eventChairs.length || 1;
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
  const items = eventsVisibleToCurrentUser(getFilteredUpcomingEvents());
  if(!items.length){
    sel.innerHTML = "";
    return;
  }
  const ids = new Set(items.map(e => String(e.event_id)));
  if(!state.selectedEventId || !ids.has(String(state.selectedEventId))) {
    state.selectedEventId = items[0].event_id;
  }
  sel.innerHTML = items.map(e => `<option value="${escapeHtml(e.event_id)}" ${e.event_id === state.selectedEventId ? "selected" : ""}>${escapeHtml(e.title)} · ${escapeHtml(eventBandLabel(e))}</option>`).join("");
}


function setStageMode(mode){
  state.stageMode = mode || "table";
  try{ localStorage.setItem("bbhub.stageMode", state.stageMode); }catch(_e){}
  document.querySelectorAll(".segBtn").forEach(b => b.classList.toggle("active", b.dataset.stageMode === state.stageMode));
  const visual = $("stageVisualWrap");
  const table = $("stageTableWrap");
  if(visual && table){
    const visualMode = state.stageMode === "plan";
    visual.hidden = !visualMode;
    table.hidden = visualMode;
  }
}
function openStageForEvent(eventId, mode = null){
  state.selectedEventId = eventId || state.selectedEventId;
  setStageMode(mode || state.stageMode || "table");
  switchView("stage");
  if($("stageEventSelect")) $("stageEventSelect").value = state.selectedEventId;
  renderStage();
  window.scrollTo({top:0, behavior:"smooth"});
}
function hydrateCardStagePreview(eventId){
  const host = document.getElementById(`stage-preview-${eventId}`);
  if(!host) return;
  const event = (state.events || []).find(e => String(e.event_id) === String(eventId));
  const chairs = chairsForEvent(event);
  const assignments = assignmentsForEvent(event);
  renderInlineSwimlaneTable(host, chairs, assignments, eventId);
}


function renderInlineStageTable(host, chairs, assignments, eventId){
  if(!host) return;
  host.innerHTML = renderStageTableMarkup(chairs, assignments, eventId, true);
}

function renderInlineSwimlaneTable(host, chairs, assignments, eventId){
  if(!host) return;
  host.innerHTML = renderSwimlaneTableMarkup(chairs, assignments, eventId, {compact:true});
}

function renderStageSwimlaneTable(host, chairs, assignments, eventId){
  if(!host) return;
  host.innerHTML = renderSwimlaneTableMarkup(chairs, assignments, eventId, {compact:false});
}

function renderSwimlaneTableMarkup(chairs, assignments, eventId, opts = {}){
  const compact = !!opts.compact;
  return renderStageTableMarkup(chairs, assignments, eventId, compact);
}

function renderStageTableMarkup(chairs, assignments, eventId, compact = false){
  const groups = chairsGroupedBySection(chairs);
  const assignmentsByChair = chairAssignmentsByCode(assignments);
  const body = groups.map(([section, items]) => {
    const chairsRow = items.map(ch => `<td class="stageMatrix__chair"><span class="chairChip">${escapeHtml(ch.display_short || ch.chair_code || '')}</span></td>`).join('');
    const playersRow = items.map(ch => {
      const members = membersForChair(assignmentsByChair, ch.chair_code);
      const isVacant = !members.length;
      return `<td class="stageMatrix__players ${isVacant ? 'stageMatrix__vacant' : ''}">${chairMembersMarkup(eventId, members)}</td>`;
    }).join('');
    return `<tr class="stageMatrix__chairRow"><td class="stageMatrix__section">${escapeHtml(section)}</td>${chairsRow}</tr><tr class="stageMatrix__playerRow"><td class="stageMatrix__spacer"></td>${playersRow}</tr>`;
  }).join('');
  return `<div class="strengthWrap"><div class="stageMatrixWrap"><table class="stageTable stageMatrix ${compact ? 'stageTable--compact' : ''}"><tbody>${body || `<tr><td colspan="2"><div class="empty">No seating loaded.</div></td></tr>`}</tbody></table></div></div>`;
}

function updateStageHeading(event){
  const labelEl = document.querySelector('#view-stage .label');
  const titleEl = document.querySelector('#view-stage h2');
  const bandLabel = event ? eventBandLabel(event) : 'Band';
  if(labelEl) labelEl.textContent = `Stage layout · ${bandLabel}`;
  if(titleEl) titleEl.textContent = event ? `Band seating — ${bandLabel}` : 'Band seating';
}

function renderStage(){
  const select = $("stageEventSelect");
  const eventId = select?.value || state.selectedEventId;
  const svg = $("stageSvg");
  const tableWrap = $("stageTableWrap");
  svg.innerHTML = "";
  const event = (state.events || []).find(e => String(e.event_id) === String(eventId));
  if(event){
    state.selectedEventId = event.event_id;
    if(select && select.value !== state.selectedEventId) select.value = state.selectedEventId;
  }
  updateStageHeading(event);
  const chairs = chairsForEvent(event);
  const assignments = assignmentsForEvent(event);

  if(state.stageMode === "table"){
    renderStageTable(tableWrap, chairs, assignments, state.selectedEventId);
  }else if(state.stageMode === "swimlane"){
    renderStageSwimlaneTable(tableWrap, chairs, assignments, state.selectedEventId);
  }else{
    renderStagePlan(svg, chairs, assignments, state.selectedEventId);
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

  const assignmentsByChair = chairAssignmentsByCode(assignments);

  for(const ch of chairs){
    const members = membersForChair(assignmentsByChair, ch.chair_code);
    const statusInfo = chairStatusInfo(eventId, members);
    const g = document.createElementNS("http://www.w3.org/2000/svg","g");
    g.setAttribute("transform", `translate(${ch.default_x},${ch.default_y})`);
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("r","28"); c.setAttribute("fill", stageFill(statusInfo.code)); c.setAttribute("stroke","rgba(16,24,39,.22)"); c.setAttribute("stroke-width","2");
    const t1 = document.createElementNS("http://www.w3.org/2000/svg","text");
    t1.setAttribute("text-anchor","middle"); t1.setAttribute("y","-12"); t1.setAttribute("font-size","11"); t1.setAttribute("font-weight","800"); t1.setAttribute("paint-order", "stroke"); t1.setAttribute("stroke", "rgba(255,255,255,.82)"); t1.setAttribute("stroke-width", "3"); t1.textContent = ch.display_short;
    g.append(c, t1);

    if(members.length){
      members.forEach((member, idx) => {
        const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
        txt.setAttribute("text-anchor", "middle");
        txt.setAttribute("y", String(2 + idx * 11));
        txt.setAttribute("font-size", "10");
        txt.setAttribute("font-weight", state.session && String(state.session.member_id || '') === String(member.member_id || '') ? "800" : "700");
        txt.setAttribute("paint-order", "stroke");
        txt.setAttribute("stroke", "rgba(255,255,255,.82)");
        txt.setAttribute("stroke-width", "2.5");
        txt.textContent = stageMemberLabel(member);
        g.appendChild(txt);
      });
    } else {
      const vacant = document.createElementNS("http://www.w3.org/2000/svg","text");
      vacant.setAttribute("text-anchor","middle"); vacant.setAttribute("y","8"); vacant.setAttribute("font-size","10"); vacant.setAttribute("font-weight","700"); vacant.setAttribute("paint-order", "stroke"); vacant.setAttribute("stroke", "rgba(255,255,255,.82)"); vacant.setAttribute("stroke-width", "2.5"); vacant.textContent = "Vacant";
      g.appendChild(vacant);
    }
    const title = document.createElementNS("http://www.w3.org/2000/svg","title");
    title.textContent = chairMembersTitle(ch.chair_label, members, eventId);
    g.appendChild(title); svg.appendChild(g);
  }
}

function renderStageSwimlane(svg, chairs, assignments, eventId, opts = {}){
  const lanes = [...new Set(chairs.map(ch => ch.lane))];
  const compact = !!opts.compact;
  const xStart = compact ? 120 : 150;
  const yStart = compact ? 42 : 60;
  const laneGap = compact ? 50 : 64;
  const seatGap = compact ? 62 : 72;
  const assignmentsByChair = chairAssignmentsByCode(assignments);

  lanes.forEach((lane, laneIndex) => {
    const y = yStart + laneIndex * laneGap;
    const laneLabel = document.createElementNS("http://www.w3.org/2000/svg","text");
    laneLabel.setAttribute("x", compact ? "16" : "40"); laneLabel.setAttribute("y", String(y + 4)); laneLabel.setAttribute("font-size", compact ? "12" : "15"); laneLabel.setAttribute("font-weight", "800");
    laneLabel.textContent = lane;
    svg.appendChild(laneLabel);

    chairs.filter(ch => ch.lane === lane).sort((a,b)=>a.order-b.order).forEach((ch, idx) => {
      const x = xStart + idx * seatGap;
      const members = membersForChair(assignmentsByChair, ch.chair_code);
      const statusInfo = chairStatusInfo(eventId, members);
      const g = document.createElementNS("http://www.w3.org/2000/svg","g");
      g.setAttribute("transform", `translate(${x},${y})`);
      const rect = document.createElementNS("http://www.w3.org/2000/svg","rect");
      rect.setAttribute("x", compact ? "-28" : "-32"); rect.setAttribute("y", compact ? "-18" : "-20"); rect.setAttribute("width", compact ? "56" : "64"); rect.setAttribute("height", compact ? "38" : "42"); rect.setAttribute("rx", compact ? "8" : "10"); rect.setAttribute("fill", stageFill(statusInfo.code)); rect.setAttribute("stroke","rgba(16,24,39,.2)");
      const t = document.createElementNS("http://www.w3.org/2000/svg","text");
      t.setAttribute("text-anchor","middle"); t.setAttribute("font-size", compact ? "10" : "11"); t.setAttribute("font-weight","800"); t.setAttribute("y", compact ? "-4" : "-5"); t.textContent = ch.display_short;
      g.append(rect, t);
      if(members.length){
        members.slice(0, 3).forEach((member, i) => {
          const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
          txt.setAttribute("text-anchor", "middle"); txt.setAttribute("font-size", compact ? "8.5" : "9"); txt.setAttribute("y", String((compact ? 7 : 8) + i * 10)); txt.setAttribute("font-weight", state.session && String(state.session.member_id || '') === String(member.member_id || '') ? "800" : "700"); txt.textContent = stageMemberLabel(member);
          g.appendChild(txt);
        });
        if(members.length > 3){
          const more = document.createElementNS("http://www.w3.org/2000/svg","text");
          more.setAttribute("text-anchor", "middle"); more.setAttribute("font-size", compact ? "8" : "8.5"); more.setAttribute("y", compact ? "28" : "30"); more.textContent = `+${members.length - 3}`;
          g.appendChild(more);
        }
      } else {
        const empty = document.createElementNS("http://www.w3.org/2000/svg","text");
        empty.setAttribute("text-anchor", "middle"); empty.setAttribute("font-size", compact ? "8.5" : "9"); empty.setAttribute("y", compact ? "10" : "11"); empty.textContent = 'Vacant';
        g.appendChild(empty);
      }
      const title = document.createElementNS("http://www.w3.org/2000/svg","title");
      title.textContent = chairMembersTitle(ch.chair_label, members, eventId);
      g.appendChild(title); svg.appendChild(g);
    });
  });
}


function renderStageTable(host, chairs, assignments, eventId){
  if(!host) return;
  host.innerHTML = renderStageTableMarkup(chairs, assignments, eventId, false);
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
  const items = getFilteredUpcomingEvents();

  function renderIntoHost(hostId, emptyText){
    const host = $(hostId);
    if(!host) return;
    if(!items.length){
      host.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
      return;
    }
    host.innerHTML = items.map(e => `<div class="multiEventSlot" data-planner-slot="${escapeHtml(e.event_id)}"></div>`).join("");
    items.forEach(e => {
      const slot = host.querySelector(`[data-planner-slot="${CSS.escape(e.event_id)}"]`);
      const cardLabel = e.type === "rehearsal" ? "UPCOMING REHEARSAL" : e.type === "gig" ? "UPCOMING GIG" : "UPCOMING EVENT";
      renderEventCard(slot, cardLabel, e, emptyText);
    });
  }

  renderIntoHost("plannerList", "No events found.");
  renderIntoHost("homePlannerList", "No events found.");
}

function renderHome(){
  const visibleEvents = eventsVisibleToCurrentUser(state.events);
  const nextGigs = findNextByBand(visibleEvents, "gig");
  const nextRehs = findNextByBand(visibleEvents, "rehearsal");
  const nextGig = nextGigs[0] || null;
  const nextReh = nextRehs[0] || null;
  const visibleIds = new Set(visibleEvents.map(e => String(e.event_id)));
  if(!state.selectedEventId || !visibleIds.has(String(state.selectedEventId))){
    state.selectedEventId = nextGig?.event_id || nextReh?.event_id || "";
  }
  renderHeroBandChips();
  const alertBar = $("playersNeededBar"); if(alertBar){ alertBar.className = "alertStack hidden"; alertBar.innerHTML = ""; }
  const gigHost = $("nextGigCard");
  const rehHost = $("nextRehCard");
  if(gigHost){
    gigHost.innerHTML = nextGigs.length ? nextGigs.map(e => `<div class="multiEventSlot" data-event-slot="${escapeHtml(e.event_id)}"></div>`).join("") : `<div class="empty">No upcoming gigs found.</div>`;
    nextGigs.forEach(e => renderEventCard(gigHost.querySelector(`[data-event-slot="${CSS.escape(e.event_id)}"]`), "NEXT GIG", e, "No upcoming gigs found."));
  }
  if(rehHost){
    rehHost.innerHTML = nextRehs.length ? nextRehs.map(e => `<div class="multiEventSlot" data-event-slot="${escapeHtml(e.event_id)}"></div>`).join("") : `<div class="empty">No upcoming rehearsals found.</div>`;
    nextRehs.forEach(e => renderEventCard(rehHost.querySelector(`[data-event-slot="${CSS.escape(e.event_id)}"]`), "NEXT REHEARSAL", e, "No upcoming rehearsals found."));
  }
  renderMatrixHome();
  renderPlanner();
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
  document.addEventListener("change", (ev) => {
    const bandCheck = ev.target.closest(".heroBandCheck");
    if(bandCheck && !currentMember()){
      const selected = Array.from(document.querySelectorAll(".heroBandCheck:checked")).map(el => el.dataset.bandType).filter(Boolean);
      if(!selected.length){
        bandCheck.checked = true;
        return;
      }
      saveGuestBandFilter(selected);
      renderHome();
      if(document.querySelector("#view-stage.active")) renderStage();
      if(document.querySelector("#view-planner.active")) renderMatrixHome();
  renderPlanner();
      return;
    }
  });

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
      openStageForEvent(openStageBtn.dataset.openStage || "", "table");
      return;
    }

    const detailsBtn = ev.target.closest(".inlineAlertDetailsBtn, .inlineAlertDetailsLink");
    if(detailsBtn){
      const card = detailsBtn.closest('.eventCard');
      const details = card?.querySelector('.cardDetails');
      if(details){
        details.open = true;
        details.scrollIntoView({ behavior:'smooth', block:'nearest' });
      }
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
    const dlg = $("loginDialog"); if(dlg?.open) dlg.close();
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
    if(!member){ box.className = "loginResult muted"; box.textContent = "No member matched that code."; return; }
    Auth.saveUser(member);
    state.session = Auth.loadUser();
    updateGreeting();
    setInterval(updateGreeting, 30000);
    box.className = "loginResult";
    box.innerHTML = `Welcome <strong>${escapeHtml(member.first_name || member.display_name || "Member")}</strong> (${escapeHtml(member.member_id)})`;
    renderHome();
    renderMatrixHome();
  renderPlanner();
  });
  $("logoutBtn").addEventListener("click", () => {
    Auth.clearUser();
    state.session = null;
    updateGreeting();
    $("loginResult").className = "loginResult muted";
    $("loginResult").textContent = "Logged out.";
    renderHome();
    renderMatrixHome();
  renderPlanner();
  });
}

function bindControls(){
  const menuBtn = $("menuBtn");
  const scrim = $("scrim");
  const backTopBtn = $("backTopBtn");
  const themeBtn = $("themeBtn");
  const plannerIgnore = $("plannerIgnoreRehearsalsToggle");
  const homePlannerIgnore = $("homePlannerIgnoreRehearsalsToggle");
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
const strengthIgnore = $("ignoreRehearsalsToggle");
const plannerIgnoreLegacy = $("plannerIgnoreRehearsalsToggle");
[strengthIgnore, plannerIgnoreLegacy].filter(Boolean).forEach(el => {
  el.checked = state.ignoreRehearsals;
  el.addEventListener("change", () => {
    state.ignoreRehearsals = el.checked;
    [strengthIgnore, plannerIgnoreLegacy, homePlannerIgnore].filter(Boolean).forEach(box => {
      box.checked = state.ignoreRehearsals;
    });
    try{ localStorage.setItem("bbhub.ignoreRehearsals", state.ignoreRehearsals ? "1" : "0"); }catch(_e){}
    if(typeof renderStrength === "function") renderStrength();
    renderMatrixHome();
  renderPlanner();
    renderHome();
  });
});
  setStageMode(state.stageMode);
  document.querySelectorAll(".segBtn").forEach(btn => btn.addEventListener("click", () => {
    setStageMode(btn.dataset.stageMode || "swimlane");
    renderStage();
  }));
if(plannerIgnore){
  plannerIgnore.checked = state.ignoreRehearsals;
  plannerIgnore.addEventListener("change", () => {
    state.ignoreRehearsals = plannerIgnore.checked;
    if(homePlannerIgnore) homePlannerIgnore.checked = state.ignoreRehearsals;
    try{ localStorage.setItem("bbhub.ignoreRehearsals", state.ignoreRehearsals ? "1" : "0"); }catch(_e){}
    renderMatrixHome();
  renderPlanner();
    renderHome();
    if(document.querySelector("#view-stage.active")) renderStage();
  });
}
if(homePlannerIgnore){
  homePlannerIgnore.checked = state.ignoreRehearsals;
  homePlannerIgnore.addEventListener("change", () => {
    state.ignoreRehearsals = homePlannerIgnore.checked;
    if(plannerIgnore) plannerIgnore.checked = state.ignoreRehearsals;
    try{ localStorage.setItem("bbhub.ignoreRehearsals", state.ignoreRehearsals ? "1" : "0"); }catch(_e){}
    renderMatrixHome();
  renderPlanner();
    renderHome();
    if(document.querySelector("#view-stage.active")) renderStage();
  });
}

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
    state.bands = data.bands || [];
    updateSummary();
    setStatus(`Loaded (${state.source}) — ${new Date().toLocaleString()}`);
    renderHome();
    renderMatrixHome();
  renderPlanner();
    if(DEBUG) renderDebugPanel(state);
    setInterval(() => {
      renderHome();
      if(document.querySelector("#view-stage.active")) renderStage();
    }, 60000);
  }catch(err){
    setStatus(`Load failed: ${err.message}`);
    const safeSet = (id, html) => { const el = $(id); if(el) el.innerHTML = html; };
    const msg = `<div class="empty">${escapeHtml(err.message)}</div>`;
    safeSet("nextGigCard", msg);
    safeSet("nextRehCard", msg);
    safeSet("activityMatrix", msg);
    safeSet("strengthMatrix", msg);
    safeSet("plannerList", msg);
    safeSet("homePlannerList", msg);
    if(DEBUG){
      const dbg = $("debugBox");
      if(dbg) dbg.innerHTML = `<pre class="mono">${escapeHtml(String(err.stack || err.message || err))}</pre>`;
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  bindControls();
  bindLoginUi();
  bindHomeDelegates();
  start();
});





function renderMatrixHome(){
  const grid = $("matrixGrid");
  const labels = $("matrixTopLabels");
  if(!grid || !labels || !state.events) return;

  grid.innerHTML = "";
  labels.innerHTML = "<div></div>";

  const today = new Date();
  today.setHours(0,0,0,0);

  for(let w = 0; w < 12; w++){
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + w * 7);

    const lab = document.createElement("div");
    lab.textContent = weekStart.getDate() + weekStart.toLocaleDateString("en-AU", { month:"short" });
    labels.appendChild(lab);

    const col = document.createElement("div");
    col.className = "matrixCol";

    for(let i = 0; i < 7; i++){
      const cd = new Date(weekStart);
      cd.setDate(weekStart.getDate() + i);

      const dayEvents = (state.events || []).filter(e => {
        const d2 = new Date(e.start_datetime || e.date || 0);
        return d2.toDateString() === cd.toDateString();
      });

      const ev = dayEvents.length ? dayEvents[0] : null;

      const cell = document.createElement("div");
      cell.className = "matrixCell";
      cell.style.background = "#eee";
      cell.style.cursor = ev ? "pointer" : "default";

      if(ev){
        if(ev.type === "gig") cell.style.background = "#ffe082";
        else if(ev.type === "rehearsal") cell.style.background = "#90caf9";
        else cell.style.background = "#c8e6c9";

        cell.title = dayEvents.map(e => e.title).join(" | ");

        cell.onclick = () => {
          const homeTarget = document.querySelector('#homePlannerList [data-event-id="' + ev.event_id + '"]');
          if(homeTarget){
            const details = document.getElementById("homePlannerAccordion");
            if(details && !details.open) details.open = true;
            homeTarget.scrollIntoView({behavior:"smooth", block:"center"});
            return;
          }
          const plannerTarget = document.querySelector('#plannerList [data-event-id="' + ev.event_id + '"]');
          if(plannerTarget){
            plannerTarget.scrollIntoView({behavior:"smooth", block:"center"});
          }
        };

        const bt = String(ev.band_type || "").toLowerCase();
        let bandClass = "band-other";
        if(bt.includes("brass")) bandClass = "band-brass";
        else if(bt.includes("big")) bandClass = "band-big";
        else if(bt.includes("concert")) bandClass = "band-concert";

        const dot = document.createElement("div");
        dot.className = "matrixBandDot " + bandClass;
        cell.appendChild(dot);
      }else{
        cell.title = "";
      }

      col.appendChild(cell);
    }

    grid.appendChild(col);
  }
}




