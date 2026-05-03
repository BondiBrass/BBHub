import * as Auth from "./auth.js";
import { DEBUG, findNext, normalizeEvent, renderDebugPanel } from "./debug.js";
import { clearApiDebugLog, getApiDebugLog, loadData, saveCommentResponse, saveRsvpResponse, subscribeApiDebugLog } from "./sheets.js";
import { compactFromNowLabel, escapeHtml, formatEventDateParts } from "./utils.js";
import { BBHUB_CONFIG } from "./config.js";

const routeParams = new URLSearchParams(window.location.search);

const state = {
  source:"unknown", members:[], rawEvents:[], events:[], program:[], pieces:[],
  rsvp:[], comments:[], bandChairs:[], assignments:[], bands:[], session:null,
  selectedEventId:"", savingRsvp:false, stageMode:(localStorage.getItem("bbhub.stageMode") || "graphic"), stageViewBox:{x:0,y:0,w:1000,h:760},
  ignoreRehearsals: localStorage.getItem("bbhub.ignoreRehearsals") === "1",
  guestBandFilter: JSON.parse(localStorage.getItem("bbhub.guestBandFilter") || "[]"),
  debugTimings: {},
  route: {
    eventId: routeParams.get("event") || "",
    mode: routeParams.get("mode") || "",
    memberParam: routeParams.get("member") || routeParams.get("member_id") || "",
    keyParam: routeParams.get("key") || routeParams.get("login_key") || "",
    view: routeParams.get("view") || (routeParams.get("mode") === "dashboard" ? "dashboard" : (routeParams.get("mode") === "availability" ? "availability" : (routeParams.get("event") ? "public" : "normal")))
  }
};

function $(id){ return document.getElementById(id); }
function showLoading(){ $("loadingOverlay")?.classList.remove("hidden"); }
function hideLoading(){ $("loadingOverlay")?.classList.add("hidden"); }
function setStatus(msg){ $("statusLine").textContent = msg; }
function formatApiDebugValue(value){
  if(value == null || value === "") return "";
  if(typeof value === "string") return value;
  try{ return JSON.stringify(value, null, 2); }catch(_e){ return String(value); }
}

function isPublicEventRoute(){
  return !!state.route.eventId && state.route.view === "public";
}
function publicEventLink(eventId){
  return `./?event=${encodeURIComponent(String(eventId || ""))}`;
}
function formatPublicEventDate(value){
  const d = value ? new Date(value) : null;
  if(!d || Number.isNaN(+d)) return "Date TBC";
  return d.toLocaleString("en-AU", { weekday:"short", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function renderAboutContent(){
  const host = $("aboutContent");
  if(!host) return;
  host.innerHTML = `
    <div class="aboutRow"><strong>Version number</strong><span>${escapeHtml(BBHUB_CONFIG.VERSION || "")}</span></div>
    <div class="aboutRow"><strong>Last updated</strong><span>${escapeHtml(BBHUB_CONFIG.LAST_UPDATED || "")}</span></div>
    <div class="aboutRow"><strong>Contact email</strong><span><a href="mailto:${escapeHtml(BBHUB_CONFIG.CONTACT_EMAIL || "")}">${escapeHtml(BBHUB_CONFIG.CONTACT_EMAIL || "")}</a></span></div>
    <div class="aboutFooter">${escapeHtml(BBHUB_CONFIG.APP_TITLE || "BBHub")}</div>
  `;
}
function applyPublicRestrictions(root = document){
  root.querySelectorAll('.responseMini, .loginPromptBtn, .miniRsvpOnly, .responseMatrixWrap, .saveRow, [data-save-comment="1"], .commentComposer, .commentUtilityWrap').forEach(el => el.remove());
  root.querySelectorAll('[data-note-for], .commentTextarea, [data-guest-nickname-for], [data-guest-email-for], .commentTagBtn').forEach(el => {
    if('disabled' in el) el.disabled = true;
    if(el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.setAttribute('readonly', 'readonly');
  });
}
function renderPublicEventFallback(badId){
  const host = $("publicEventShell");
  if(!host) return;
  const upcoming = (state.events || [])
    .filter(e => e?.parsed instanceof Date && !Number.isNaN(+e.parsed))
    .filter(e => e.parsed >= new Date(Date.now() - 86400000))
    .sort((a,b) => a.parsed - b.parsed)
    .slice(0, 40);
  host.innerHTML = `
    <div class="publicEventHeader">
      <div class="publicEventKicker"><span class="material-symbols-outlined">search</span><span>Public event finder</span></div>
      <h2>Event not found</h2>
      <div class="muted">We couldn’t find <strong>${escapeHtml(badId || "")}</strong>. Search one of the published events below.</div>
    </div>
    <div class="publicEventSearchWrap">
      <input id="publicEventSearch" class="publicEventSearch" type="search" placeholder="Search by title, venue, band, or date" autocomplete="off" />
      <div id="publicEventList" class="publicEventList">
        ${upcoming.map(event => `
          <article class="publicEventItem" data-public-event-item>
            <div class="publicEventItem__body">
              <div class="publicEventItem__title">${escapeHtml(event.title || event.event_name || event.event_id)}</div>
              <div class="publicEventItem__meta">${escapeHtml(formatPublicEventDate(event.start_datetime || event.date))} · ${escapeHtml(eventBandLabel(event))} · ${escapeHtml(event.venue || "Venue TBC")}</div>
            </div>
            <a class="pillBtn publicEventItem__link" href="${publicEventLink(event.event_id)}"><span class="material-symbols-outlined">arrow_forward</span><span>Open</span></a>
          </article>
        `).join("")}
      </div>
    </div>`;
  const input = $("publicEventSearch");
  input?.addEventListener("input", () => {
    const q = String(input.value || "").trim().toLowerCase();
    host.querySelectorAll('[data-public-event-item]').forEach(item => {
      const text = String(item.textContent || "").toLowerCase();
      item.style.display = !q || text.includes(q) ? "" : "none";
    });
  });
}
function renderPublicEventPage(){
  const host = $("publicEventShell");
  if(!host) return;
  const event = (state.events || []).find(e => String(e.event_id) === String(state.route.eventId || ""));
  if(!event){
    renderPublicEventFallback(state.route.eventId);
    return;
  }
  host.innerHTML = `<div class="multiEventSlot" data-event-slot="${escapeHtml(event.event_id)}"></div>`;
  renderEventCard(host.querySelector('[data-event-slot]'), "NEXT GIG", event, "Event not found.");
  const details = host.querySelector('.cardDetails');
  if(details) details.open = false;
  applyPublicRestrictions(host);
}
function syncHomeRouteMode(active){
  document.body.classList.toggle('publicEventMode', !!active);
  const shell = $("publicEventShell");
  if(shell) shell.classList.toggle('hidden', !active);
}

function renderApiDebugPanel(entries = getApiDebugLog()){
  const host = $("apiDebugLog");
  const count = $("apiDebugCount");
  if(count) count.textContent = String(entries.length || 0);
  if(!host) return;
  if(!entries.length){
    host.innerHTML = `<div class="apiDebugEmpty">No API activity yet.</div>`;
    return;
  }
  host.innerHTML = entries.map(entry => {
    const label = entry.type === "request" ? "POST" : entry.type === "response" ? `RESPONSE${entry.status ? ` ${entry.status}` : ""}` : (entry.type || "log").toUpperCase();
    const tone = entry.ok === false ? " is-error" : entry.type === "request" ? " is-request" : "";
    const body = entry.payload ?? entry.response ?? entry.message ?? "";
    return `
      <div class="apiDebugItem${tone}">
        <div class="apiDebugMeta">
          <span class="apiDebugBadge">${escapeHtml(label)}</span>
          <span class="apiDebugTime">${escapeHtml(new Date(entry.at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'}))}</span>
        </div>
        ${entry.endpoint ? `<div class="apiDebugEndpoint mono">${escapeHtml(entry.endpoint)}</div>` : ""}
        <pre class="apiDebugPre">${escapeHtml(formatApiDebugValue(body))}</pre>
      </div>`;
  }).join("");
}

function setupApiDebugPanel(){
  if($("apiDebugDrawer")) return;
  const drawer = document.createElement("section");
  drawer.id = "apiDebugDrawer";
  drawer.className = "apiDebugDrawer hidden";
  drawer.innerHTML = `
    <div class="apiDebugHead">
      <div>
        <div class="label">API debug</div>
        <h3>Live POST / response log</h3>
      </div>
      <div class="apiDebugHeadActions">
        <button class="pillBtn" id="apiDebugClearBtn" type="button"><span class="material-symbols-outlined">delete_sweep</span><span>Clear</span></button>
        <button class="iconBtn" id="apiDebugCloseBtn" type="button" title="Close"><span class="material-symbols-outlined">close</span></button>
      </div>
    </div>
    <div class="apiDebugSubhead">
      <span>Entries: <strong id="apiDebugCount">0</strong></span>
      <span class="muted">login key is masked</span>
    </div>
    <div id="apiDebugLog" class="apiDebugLog"></div>
  `;
  document.body.appendChild(drawer);

  const toggle = document.createElement("button");
  toggle.id = "apiDebugToggleBtn";
  toggle.className = "iconBtn apiDebugToggleBtn";
  toggle.type = "button";
  toggle.title = "API debug log";
  toggle.innerHTML = '<span class="material-symbols-outlined">bug_report</span>';
  document.body.appendChild(toggle);

  const setOpen = (open) => {
    drawer.classList.toggle("hidden", !open);
    toggle.classList.toggle("is-active", !!open);
  };

  toggle.addEventListener("click", () => setOpen(drawer.classList.contains("hidden")));
  $("apiDebugCloseBtn")?.addEventListener("click", () => setOpen(false));
  $("apiDebugClearBtn")?.addEventListener("click", () => clearApiDebugLog());
  subscribeApiDebugLog(renderApiDebugPanel);
  renderApiDebugPanel();
}

function updateSummary(){ $("summaryLine").textContent = `${state.members.length} members · ${state.events.length} events · ${state.pieces.length} pieces`; }
function openMenu(){ $("sidePanel").classList.remove("hidden"); $("sidePanel").classList.add("open"); $("scrim").classList.remove("hidden"); }
function closeMenu(){ $("sidePanel").classList.add("hidden"); $("sidePanel").classList.remove("open"); $("scrim").classList.add("hidden"); }
function nowHeaderText(){
  const d = new Date();
  const time = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  return time;
}
const TEXT_SIZE_STEPS = ["small", "normal", "large", "xlarge", "xxlarge"];
const TEXT_SIZE_LABELS = {
  small: "90%",
  normal: "100%",
  large: "112%",
  xlarge: "125%",
  xxlarge: "138%"
};

function applyTextSize(size){
  const next = TEXT_SIZE_STEPS.includes(size) ? size : "normal";
  document.documentElement.setAttribute("data-text-size", next);

  const label = document.getElementById("textSizeLabel");
  if(label) label.textContent = TEXT_SIZE_LABELS[next] || "100%";

  const downBtn = document.getElementById("textSizeDownBtn");
  const upBtn = document.getElementById("textSizeUpBtn");
  if(downBtn) downBtn.disabled = next === TEXT_SIZE_STEPS[0];
  if(upBtn) upBtn.disabled = next === TEXT_SIZE_STEPS[TEXT_SIZE_STEPS.length - 1];

  try{ localStorage.setItem("bbhub.textSize", next); }catch(_e){}
}

function stepTextSize(delta){
  const current = document.documentElement.getAttribute("data-text-size") || "normal";
  const idx = Math.max(0, TEXT_SIZE_STEPS.indexOf(current));
  const nextIdx = Math.max(0, Math.min(TEXT_SIZE_STEPS.length - 1, idx + delta));
  applyTextSize(TEXT_SIZE_STEPS[nextIdx]);
}

function initTextSizeControls(){
  const saved = (() => {
    try{ return localStorage.getItem("bbhub.textSize") || "normal"; }catch(_e){ return "normal"; }
  })();

  applyTextSize(saved);

  document.getElementById("textSizeDownBtn")?.addEventListener("click", () => stepTextSize(-1));
  document.getElementById("textSizeUpBtn")?.addEventListener("click", () => stepTextSize(1));
  document.getElementById("textSizeResetBtn")?.addEventListener("click", () => applyTextSize("normal"));
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
  const publicMode = isPublicEventRoute();
  $("loginBtn").classList.toggle("hidden", !!state.session || publicMode);
  $("logoutBtn").classList.toggle("hidden", !state.session || publicMode);
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
  if(view === "dashboard") renderNudgeDashboard();
  if(view === "availability") renderAvailabilityView();
  renderPlanner();
  hideLoading();
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
  const raw = r?.updated_at || r?.timestamp || r?.created_at || r?.saved_at || r?.datetime || r?.date_time || "";
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
    chair_code: a.chair_code || a.chair_id || a.chair || a.position || "",
    event_id: a.event_id || a.event || a.eventId || a.gig_id || a.id || "",
    member_id: a.member_id || a.member || a.memberId || a.member_key || a.person_id || a.login_key || a.key || ""
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
    const pieceId = String(r.piece_id || r.piece_name || r.title || '').trim();
    const targetId = `${event.event_id}|${pieceId}`;
    const commentCount = commentsForTarget('event_piece', targetId).length;
    const commentMarkup = pieceId ? `<div class="progComments">${renderCommentBlock('event_piece', targetId, `Piece comments${commentCount ? ` · ${commentCount}` : ''}`, { eventId:event.event_id, pieceId })}</div>` : '';
    return `<div class="progItem"><div class="progTitleRow"><div class="progTitle">${escapeHtml(r.piece_order)}. ${escapeHtml(r.piece_name || r.title || "")}</div>${yt ? `<a class="progYoutubeLink" href="${escapeHtml(yt)}" target="_blank" rel="noopener" title="Open YouTube"><span class="material-symbols-outlined">smart_display</span></a>` : ``}</div><div class="progMeta">${escapeHtml(meta)}</div>${commentMarkup}</div>`;
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

function canonicalRsvpStatus(resp){
  const r = resp ? normalizeRsvpRow(resp) : null;
  return String(r?.status || r?.response || r?.availability || r?.rsvp || r?.answer || "").trim().toUpperCase();
}
function availabilityStatusLabel(status){
  const s = String(status || "").toUpperCase();
  if(s === "Y") return "I'm available";
  if(s === "M") return "Maybe";
  if(s === "N") return "I'm not available";
  return "No response";
}
function availabilityStatusIcon(status){
  const s = String(status || "").toUpperCase();
  if(s === "Y") return "✅";
  if(s === "M") return "?";
  if(s === "N") return "❌";
  return "—";
}
function compactIdentity(v){
  return String(v || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
function expandIdentityKeys(values){
  const out = [];
  values.forEach(v => {
    const raw = String(v || "").trim().toLowerCase();
    if(raw) out.push(raw);
    const compact = compactIdentity(raw);
    if(compact) out.push(compact);
  });
  return [...new Set(out)];
}
function availabilityMemberMatch(member, token){
  const t = String(token || "").trim().toLowerCase();
  if(!t) return false;
  const wanted = availabilityMemberKeys(member);
  return wanted.includes(t) || wanted.includes(compactIdentity(t));
}
function availabilityMemberKeys(memberOrId){
  const m = (typeof memberOrId === "object" && memberOrId)
    ? memberOrId
    : ((state.members || []).find(x => String(x.member_id || "") === String(memberOrId || "")) || { member_id: memberOrId });
  const firstLast = `${m.first_name || ""}.${m.last_name || ""}`;
  const firstLast2 = `${m.given_name || ""}.${m.family_name || ""}`;
  return expandIdentityKeys([
    m.member_id, m.member, m.member_key, m.login_key, m.key, m.email, m.display_name, m.name,
    m.first_name, m.given_name, m.last_name, m.family_name, firstLast, firstLast2
  ]);
}
function normalizeRsvpRow(r){
  const eventId = firstNonEmpty(r.event_id, r.event, r.eventId, r.gig_id, r.gig);
  const memberId = firstNonEmpty(r.member_id, r.member, r.memberId, r.member_key, r.person_id, r.login_key, r.key);
  const status = firstNonEmpty(r.status, r.response, r.availability, r.rsvp, r.answer);
  return { ...r, event_id: eventId, member_id: memberId, status, response: status };
}
function rsvpMatchesMember(r, memberId){
  const nr = normalizeRsvpRow(r);
  const rowKeys = expandIdentityKeys([nr.member_id, r.login_key, r.key, r.email, r.member, r.member_key, r.name, r.display_name]);
  const wanted = availabilityMemberKeys(memberId);
  return rowKeys.some(k => wanted.includes(k));
}
function resolveAvailabilityMember(){
  const key = String(state.route.keyParam || "").trim();
  const memberParam = String(state.route.memberParam || "").trim();
  if(key){
    const byKey = (state.members || []).find(m => availabilityMemberMatch(m, key));
    if(byKey) return byKey;
  }
  if(memberParam){
    const byMember = (state.members || []).find(m => availabilityMemberMatch(m, memberParam));
    if(byMember) return byMember;
  }
  if(state.session){
    const bySession = memberById(state.session.member_id);
    if(bySession) return { ...bySession, ...state.session };
    return state.session;
  }
  return null;
}
function assignmentsForMember(memberId){
  return (state.assignments || []).map(normalizeAssignment).filter(a => {
    const keys = expandIdentityKeys([a.member_id, a.member, a.member_key, a.login_key, a.key, a.email, a.name, a.display_name]);
    const wanted = availabilityMemberKeys(memberId);
    return keys.some(k => wanted.includes(k));
  });
}
function titleCaseName(str){
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\b[a-z]/g, c => c.toUpperCase());
}
function firstNameForHeader(member){
  const fromMember = firstNonEmpty(member?.first_name, member?.given_name);
  if(fromMember) return titleCaseName(fromMember).split(" ")[0];
  const display = firstNonEmpty(member?.display_name, member?.name);
  if(display) return titleCaseName(display).split(" ")[0];
  const idFirst = String(member?.member_id || "").split(/[.@_\s-]+/)[0];
  return titleCaseName(idFirst || "Member").split(" ")[0];
}
function daysRelativeLabel(d){
  if(!(d instanceof Date) || Number.isNaN(+d)) return "";
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((b - a) / 86400000);
  if(days === 0) return "today";
  if(days === 1) return "tomorrow";
  if(days === -1) return "yesterday";
  if(days > 1) return `${days} days from now`;
  return `${Math.abs(days)} days ago`;
}
function formatAvailabilityDate(event){
  if(!(event?.parsed instanceof Date) || Number.isNaN(+event.parsed)) return "Date TBC";
  const date = event.parsed.toLocaleDateString("en-AU", { weekday:"short", day:"2-digit", month:"short" });
  const time = event.start_time ? event.parsed.toLocaleTimeString("en-AU", { hour:"2-digit", minute:"2-digit", hour12:true }).replace("AM", "am").replace("PM", "pm") : "";
  const rel = daysRelativeLabel(event.parsed);
  return `${date}${time ? ` · ${time}` : ""}${rel ? ` (${rel})` : ""}`;
}

function formatAvailabilityHeaderDate(event){
  if(!(event?.parsed instanceof Date) || Number.isNaN(+event.parsed)) return "Date TBC";
  const date = event.parsed.toLocaleDateString("en-AU", { weekday:"short", day:"2-digit", month:"short" });
  const time = event.parsed.toLocaleTimeString("en-AU", { hour:"2-digit", minute:"2-digit", hour12:true }).replace("AM", "am").replace("PM", "pm");
  return `${date} · ${time}`;
}
function renderAvailabilityNextGigAlert(nextEvent){
  if(!nextEvent) return `<div class="availabilityNextAlert availabilityNextAlert--empty"><div><strong>APB</strong><span>No upcoming gigs found.</span></div></div>`;
  const rel = daysRelativeLabel(nextEvent.parsed) || "date TBC";
  const title = nextEvent.title || nextEvent.event_name || nextEvent.name || nextEvent.event_id || "Next gig";
  const href = `#${availabilityCardAnchor(nextEvent.event_id)}`;
  return `<a class="availabilityNextAlert" href="${escapeHtml(href)}" aria-label="Jump to next gig card: ${escapeHtml(title)}">
    <div class="availabilityNextAlert__apb">APB</div>
    <div class="availabilityNextAlert__body">
      <div class="availabilityNextAlert__labelRow"><div class="availabilityNextAlert__label">NEXT GIG</div>${renderAvailabilityMiniSummary(nextEvent.event_id)}</div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(formatAvailabilityHeaderDate(nextEvent))} <em>(${escapeHtml(rel)})</em></span>
    </div>
  </a>`;
}

function isAvailabilityGig(event){
  const type = String(event?.type || event?.event_type || event?.category || "").trim().toLowerCase();
  if(type) return ["gig", "performance", "concert", "job"].includes(type);
  const title = String(event?.title || event?.event_name || event?.name || "").toLowerCase();
  return !/(rehearsal|practice|sectional)/.test(title);
}

function firstNonEmpty(...vals){
  for(const v of vals){
    const s = String(v || "").trim();
    if(s) return s;
  }
  return "";
}
function isProbablyUrl(v){
  return /^https?:\/\//i.test(String(v || "").trim());
}
function googleDirectionsUrl(destination){
  const d = String(destination || "").trim();
  if(!d) return "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d)}`;
}
function eventField(row, ...names){
  if(!row) return "";
  for(const name of names){
    const direct = row[name];
    if(String(direct || "").trim()) return direct;
  }
  const wanted = names.map(n => String(n).toLowerCase().replace(/[^a-z0-9]/g, ""));
  for(const [key, value] of Object.entries(row)){
    const normKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
    if(wanted.includes(normKey) && String(value || "").trim()) return value;
  }
  return "";
}
function availabilityLocationLinks(event){
  const venue = firstNonEmpty(
    eventField(event, "location", "venue", "address", "place", "destination", "where", "site", "map_location"),
    event?.venue, event?.location, event?.address
  );
  const mapUrl = firstNonEmpty(eventField(event,
    "map_url", "maps_url", "map", "directions_url", "direction_url", "google_maps_url", "google_map_url", "location_url", "venue_url"
  ));
  const parkingUrl = firstNonEmpty(eventField(event,
    "parking_url", "parking_map_url", "parking", "park_url", "carpark_url", "car_park_url"
  ));
  const entryUrl = firstNonEmpty(eventField(event,
    "entry_url", "entrance_url", "access_url", "entry", "entrance", "door_url"
  ));
  const directionsHref = mapUrl || googleDirectionsUrl(venue);
  const locationLabel = venue || (directionsHref ? "Location" : "Location TBC");
  const locationNode = directionsHref
    ? `<a class="availabilityLocationText availabilityLocationText--link" href="${escapeHtml(directionsHref)}" target="_blank" rel="noopener" title="Open directions">${escapeHtml(locationLabel)}</a>`
    : `<span class="availabilityLocationText availabilityLocationText--empty">${escapeHtml(locationLabel)}</span>`;
  const extraLinks = [];
  if(parkingUrl) extraLinks.push(`<a href="${escapeHtml(parkingUrl)}" target="_blank" rel="noopener">Parking</a>`);
  if(entryUrl) extraLinks.push(`<a href="${escapeHtml(entryUrl)}" target="_blank" rel="noopener">Entry</a>`);
  return `<div class="availabilityMeta availabilityMeta--location"><span class="material-symbols-outlined">location_on</span>${locationNode}${extraLinks.length ? `<span class="availabilityLinkRow">${extraLinks.join("<span class=\"dotSep\">·</span>")}</span>` : ""}</div>`;
}

function availabilityChairLabel(assignment, event){
  const code = String(assignment?.chair_code || assignment?.chair_id || "").trim();
  if(!code) return "";
  const assignmentBand = String(assignment?.band_type || "").trim();
  const eventBand = String(event?.band_type || event?.band || "").trim();
  const wantedBand = assignmentBand || eventBand;
  const chairs = (state.bandChairs || []).map(normalizeChair);
  const exact = chairs.find(ch =>
    String(ch.chair_code || "").trim() === code &&
    (!wantedBand || !String(ch.band_type || "").trim() || String(ch.band_type || "").trim() === wantedBand)
  ) || chairs.find(ch => String(ch.chair_code || "").trim() === code);
  const full = String(
    assignment?.chair_label || assignment?.chair_name ||
    exact?.chair_label || exact?.chair_name || exact?.instrument || exact?.name || ""
  ).trim();
  if(full && full !== code) return `${full} · ${code}`;
  return code;
}

function chairNameOnly(label){
  return String(label || "").split(" · ")[0].trim();
}
function primaryAvailabilityChair(memberId, events, byEvent){
  const now = new Date();
  const sorted = (events || []).filter(e => e?.parsed instanceof Date && !Number.isNaN(+e.parsed)).sort((a,b) => a.parsed - b.parsed);
  const upcoming = sorted.find(e => e.parsed >= now && (byEvent.get(String(e.event_id)) || []).length);
  const chosen = upcoming || sorted.find(e => (byEvent.get(String(e.event_id)) || []).length);
  const assignment = chosen ? (byEvent.get(String(chosen.event_id)) || [])[0] : null;
  return assignment ? chairNameOnly(availabilityChairLabel(assignment, chosen)) : "";
}

function rsvpForAnyMember(eventId, memberId){
  const rows = (state.rsvp || [])
    .map(normalizeRsvpRow)
    .filter(r => normEventId(r.event_id) === normEventId(eventId) && rsvpMatchesMember(r, memberId))
    .sort((a,b) => parseRsvpTimestamp(b) - parseRsvpTimestamp(a));
  return rows[0] || null;
}
function availabilitySummaryForEvent(eventId){
  // Count the expected players from Assignments, but also include anybody who has
  // responded to this gig even if they are not assigned to a chair yet.
  // Availability is a person/event state; chair assignment is only display context.
  const ids = new Set(
    (state.assignments || [])
      .map(normalizeAssignment)
      .filter(a => normEventId(a.event_id) === normEventId(eventId))
      .map(a => String(firstNonEmpty(a.member_id, a.member, a.member_key, a.login_key, a.key, a.email, a.name, a.display_name)).trim())
      .filter(Boolean)
  );

  (state.rsvp || [])
    .map(normalizeRsvpRow)
    .filter(r => normEventId(r.event_id) === normEventId(eventId))
    .forEach(r => {
      const rowKey = String(firstNonEmpty(r.member_id, r.member, r.member_key, r.login_key, r.key, r.email, r.name, r.display_name)).trim();
      if(rowKey) ids.add(rowKey);
    });

  const summary = { y:0, m:0, n:0, none:0 };
  ids.forEach(memberId => {
    const resp = rsvpForAnyMember(eventId, memberId);
    const status = canonicalRsvpStatus(resp);
    if(status === "Y") summary.y++;
    else if(status === "M") summary.m++;
    else if(status === "N") summary.n++;
    else summary.none++;
  });
  return summary;
}
function renderAvailabilityMiniSummary(eventId){
  const s = availabilitySummaryForEvent(eventId);
  return `<span class="availabilityMiniSummary" title="Gig RSVP summary: yes ${s.y}, maybe ${s.m}, no ${s.n}, no reply ${s.none}" data-availability-summary="${escapeHtml(eventId)}" aria-label="Gig RSVP summary: yes ${s.y}, maybe ${s.m}, no ${s.n}, no reply ${s.none}">` +
    `<span class="availabilityMiniSummary__item availabilityMiniSummary__item--yes">✓${s.y}</span>` +
    `<span class="availabilityMiniSummary__item availabilityMiniSummary__item--maybe">?${s.m}</span>` +
    `<span class="availabilityMiniSummary__item availabilityMiniSummary__item--no">✕${s.n}</span>` +
    `<span class="availabilityMiniSummary__item availabilityMiniSummary__item--none">!${s.none}</span>` +
  `</span>`;
}
function availabilityCardAnchor(eventId){
  return "gig-" + String(eventId || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}
function updateAvailabilityMiniSummaryUI(eventId){
  const safeEventId = (window.CSS && CSS.escape) ? CSS.escape(String(eventId)) : String(eventId).replace(/"/g, '\"');
  const nodes = document.querySelectorAll(`[data-availability-summary="${safeEventId}"]`);
  if(!nodes.length) return;
  nodes.forEach(node => {
    const wrap = document.createElement("span");
    wrap.innerHTML = renderAvailabilityMiniSummary(eventId);
    const replacement = wrap.firstElementChild;
    if(replacement) node.replaceWith(replacement);
  });
}
function memberDisplayName(member){
  return member?.display_name || [member?.first_name, member?.last_name].filter(Boolean).join(" ") || member?.member_id || "Member";
}
function buildAvailabilityHref(eventId, member){
  const key = state.route.keyParam || member?.login_key || "";
  const p = new URLSearchParams();
  p.set("event", eventId);
  if(key) p.set("key", key);
  return `./?${p.toString()}`;
}
function renderAvailabilityView(){
  const host = $("availabilityApp");
  if(!host) return;
  const member = resolveAvailabilityMember();
  if(!member){
    host.className = "availabilityApp";
    host.innerHTML = `<div class="availabilityHeader"><div class="label">Availability</div><h2>Who is this for?</h2><p class="muted">Open with <strong>?mode=availability&member=member_id</strong>, or login first.</p></div>`;
    return;
  }
  const memberId = firstNonEmpty(member.member_id, member.member, member.member_key, member.login_key, member.key, state.route.memberParam, state.route.keyParam);
  const assigned = assignmentsForMember(memberId);
  const byEvent = new Map();
  assigned.forEach(a => {
    if(!a.event_id) return;
    if(!byEvent.has(String(a.event_id))) byEvent.set(String(a.event_id), []);
    byEvent.get(String(a.event_id)).push(a);
  });
  const nowCutoff = new Date(new Date().getFullYear(), 0, 1);
  const events = (state.events || [])
    .map(normalizeEvent)
    .filter(e => isAvailabilityGig(e))
    .filter(e => e.parsed instanceof Date && !Number.isNaN(+e.parsed) && e.parsed >= nowCutoff)
    .sort((a,b) => a.parsed - b.parsed);
  const saveDisabled = !member.login_key && !state.route.keyParam && !(state.session && String(state.session.member_id) === String(memberId));
  const name = memberDisplayName(member);
  const firstUpcomingIndex = events.findIndex(e => e.parsed instanceof Date && !Number.isNaN(+e.parsed) && e.parsed >= new Date());
  const nextGig = firstUpcomingIndex >= 0 ? events[firstUpcomingIndex] : null;
  const headerChair = primaryAvailabilityChair(memberId, events, byEvent);
  const rows = events.map((event, eventIndex) => {
    const chairs = byEvent.get(String(event.event_id)) || [];
    const chairText = chairs.length
      ? chairs.map(a => availabilityChairLabel(a, event)).filter(Boolean).join(" · ")
      : "Not assigned";
    const resp = rsvpForAnyMember(event.event_id, memberId);
    const status = canonicalRsvpStatus(resp);
    const d = parseResponseDate(resp);
    const ago = d ? timeAgoShort(d) : "";
    const statusText = status ? availabilityStatusLabel(status) : "No response yet";
    const detailHref = buildAvailabilityHref(event.event_id, member);
    const cardExtraClass = `${status ? "availabilityCard--" + statusClass(status) : "availabilityCard--none"}${eventIndex === firstUpcomingIndex ? " availabilityCard--next" : ""}`;
    return `<article id="${escapeHtml(availabilityCardAnchor(event.event_id))}" class="availabilityCard ${cardExtraClass}" data-availability-card="${escapeHtml(event.event_id)}">
      <div class="availabilityCard__top">
        <div>
          <h3><span class="availabilityCardIndex">${eventIndex + 1}.</span><span>${escapeHtml(event.title || event.event_name || event.event_id)}</span></h3>
          <div class="availabilityMeta"><span class="material-symbols-outlined">event</span><span>${escapeHtml(formatAvailabilityDate(event))}</span></div>
          <div class="availabilityMeta availabilityMeta--chair"><span class="material-symbols-outlined">stadia_controller</span><span class="availabilityChairText">Chair: ${escapeHtml(chairText)}</span>${renderAvailabilityMiniSummary(event.event_id)}</div>
          ${availabilityLocationLinks(event)}
        </div>
        <div class="availabilityBadge availabilityBadge--${escapeHtml(statusClass(status))}"><span>${escapeHtml(availabilityStatusIcon(status))}</span><strong>${escapeHtml(statusText)}</strong>${ago ? `<small>${escapeHtml(ago)}</small>` : `<small>not yet sent</small>`}</div>
      </div>
      <div class="availabilityActions" role="group" aria-label="Availability response for ${escapeHtml(event.title)}">
        ${[
          ["Y", "✅", "Available"],
          ["M", "?", "Maybe"],
          ["N", "❌", "No"]
        ].map(([code, icon, label]) => `<button class="availabilityBtn ${status === code ? "is-selected" : ""}" type="button" data-availability-save="${escapeHtml(event.event_id)}" data-member-id="${escapeHtml(memberId)}" data-status="${code}" ${saveDisabled ? "disabled" : ""}><span>${icon}</span><strong>${label}</strong></button>`).join("")}
      </div>
      <div class="availabilityFooter"><span class="availabilityMsg" data-availability-msg="${escapeHtml(event.event_id)}">${saveDisabled ? "Login key needed to save from this link." : "Tap once to save."}</span><a href="${escapeHtml(detailHref)}">More Details →</a></div>
    </article>`;
  }).join("");
  host.className = "availabilityApp";
  host.innerHTML = `<div class="availabilityHeader">
    <div class="availabilityHeader__topline"><div><div class="label">My gigs</div><h2>Hi ${escapeHtml(firstNameForHeader(member))}${headerChair ? ` <span class="availabilityHeaderChair">· ${escapeHtml(headerChair)}</span>` : ""}${DEBUG ? ` <span class="debugMemberId">(${escapeHtml(memberId)})</span>` : ""}</h2></div><div class="availabilityHeader__count">${events.length} gig${events.length === 1 ? "" : "s"}</div></div>
    ${renderAvailabilityNextGigAlert(nextGig)}
    <p class="muted">Quick availability for ${escapeHtml(name)}. Showing all gigs this year; chair appears where assigned.</p>
    <div class="availabilitySummary"><span>✅ Available</span><span>? Maybe</span><span>❌ Not available</span><span class="summaryNoResponse">No response yet</span></div>
  </div>${events.length ? `<div class="availabilityList">${rows}</div>` : `<div class="empty">No gigs found for this year.</div>`}`;
}

function updateAvailabilityCardUI(eventId, status, opts = {}){
  const safeEventId = (window.CSS && CSS.escape) ? CSS.escape(String(eventId)) : String(eventId).replace(/"/g, '\"');
  const card = document.querySelector(`[data-availability-card="${safeEventId}"]`);
  if(!card) return;
  const s = String(status || "").toUpperCase();
  const hasStatus = ["Y","M","N"].includes(s);

  card.classList.remove("availabilityCard--y", "availabilityCard--m", "availabilityCard--n", "availabilityCard--none");
  card.classList.add(hasStatus ? `availabilityCard--${statusClass(s)}` : "availabilityCard--none");

  const badge = card.querySelector(".availabilityBadge");
  if(badge){
    const label = hasStatus ? availabilityStatusLabel(s) : "No response yet";
    const icon = hasStatus ? availabilityStatusIcon(s) : "—";
    badge.className = `availabilityBadge availabilityBadge--${statusClass(s)}`;
    badge.innerHTML = `<span>${escapeHtml(icon)}</span><strong>${escapeHtml(label)}</strong><small>${opts.pending ? "saving…" : (hasStatus ? "just now" : "not yet sent")}</small>`;
  }
  card.querySelectorAll(".availabilityBtn").forEach(b => {
    const selected = hasStatus && String(b.dataset.status || "").toUpperCase() === s;
    b.classList.toggle("is-selected", selected);
    b.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  const msg = card.querySelector(".availabilityMsg");
  if(msg){
    msg.classList.remove("is-saving", "is-saved", "is-error");
    if(opts.error) msg.classList.add("is-error");
    else if(opts.pending) msg.classList.add("is-saving");
    else if(opts.saved) msg.classList.add("is-saved");
    msg.textContent = opts.message || (opts.pending ? `Saving — ${availabilityStatusLabel(s)}` : (opts.saved ? `Saved ✓ ${availabilityStatusLabel(s)}` : "Tap once to save."));
  }
}

function availabilityMemberByAnyId(memberId){
  return (state.members || []).find(m => availabilityMemberMatch(m, memberId)) || resolveAvailabilityMember();
}

function localAvailabilityPayload(eventId, memberId, status){
  const now = new Date().toISOString();
  const member = availabilityMemberByAnyId(memberId) || {};
  const loginKey = firstNonEmpty(state.route.keyParam, member.login_key, member.key, state.route.memberParam);
  const displayName = memberDisplayName(member);
  return {
    event_id:eventId,
    event:eventId,
    member_id:firstNonEmpty(member.member_id, memberId, state.route.memberParam, loginKey),
    member:firstNonEmpty(state.route.memberParam, member.member_id, memberId),
    member_key:firstNonEmpty(member.member_key, member.member_id, memberId),
    login_key:loginKey,
    key:loginKey,
    email:member.email || "",
    name:displayName,
    display_name:displayName,
    first_name:member.first_name || member.given_name || "",
    last_name:member.last_name || member.family_name || "",
    status,
    response:status,
    availability:status,
    rsvp:status,
    updated_at:now,
    timestamp:now,
    saved_at:now,
    comment:""
  };
}

function upsertLocalAvailabilityRsvp(eventId, memberId, status){
  const payload = localAvailabilityPayload(eventId, memberId, status);
  if(!Array.isArray(state.rsvp)) state.rsvp = [];
  const existing = state.rsvp.find(r => normEventId(normalizeRsvpRow(r).event_id) === normEventId(eventId) && rsvpMatchesMember(r, memberId));
  if(existing){
    Object.assign(existing, payload);
  }else{
    state.rsvp.push(payload);
  }
}


async function persistAvailabilityRsvp(eventId, memberId, status){
  const member = availabilityMemberByAnyId(memberId) || {};
  const loginKey = firstNonEmpty(state.route.keyParam, member.login_key, member.key, state.route.memberParam);
  if(!loginKey) return { ok:false, message:"Missing login key." };
  const payload = localAvailabilityPayload(eventId, memberId, status);
  return await saveRsvpResponse({
    ...payload,
    member_id:firstNonEmpty(member.member_id, memberId, state.route.memberParam, loginKey),
    login_key:loginKey
  });
}


function renderShowcaseResponseReminder(response){
  if(response){
    const d = parseResponseDate(response);
    const when = timeAgoShort(d);
    const status = String(response?.status || "").toUpperCase();

    const statusText =
      status === "Y" ? "I'm available" :
      status === "M" ? "Maybe" :
      status === "N" ? "Not available" :
      labelForStatus(response?.status || "");

    const toneClass =
      status === "Y" ? " eventShowcase__reminder--yes" :
      status === "M" ? " eventShowcase__reminder--maybe" :
      status === "N" ? " eventShowcase__reminder--no" : "";

    return `
      <div class="eventShowcase__reminder${toneClass}">
        ${when ? `<span class="eventShowcase__reminderAgo">${escapeHtml(when)}</span> ` : ""}
        you last responded <strong>${escapeHtml(statusText)}</strong>
      </div>
    `;
  }

  return `
    <div class="eventShowcase__reminder eventShowcase__reminder--prompt">
      Please let us know your availability ASAP
    </div>
  `;
}


function commentCreatedMs(c){
  const raw = c?.created_at || c?.timestamp || c?.updated_at || "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function normalizedComments(){
  return (state.comments || []).filter(c => String(c.status || 'published').toLowerCase() !== 'hidden' && String(c.is_public || 'TRUE').toLowerCase() !== 'false');
}
function commentsForTarget(targetType, targetId){
  return normalizedComments()
    .filter(c => String(c.target_type || '').toLowerCase() === String(targetType || '').toLowerCase() && String(c.target_id || '').trim() === String(targetId || '').trim())
    .sort((a,b) => commentCreatedMs(b) - commentCreatedMs(a));
}
function commentAuthorLabel(c){
  if(String(c.author_type || '').toLowerCase() === 'member'){
    return c.display_name || 'Member';
  }
  return c.guest_nickname || 'Guest';
}
function commentTagPill(c){
  const tags = [c.tag_1, c.tag_2].filter(Boolean);
  return tags.map(tag => `<span class="commentTag">${escapeHtml(String(tag).replace(/_/g,' '))}</span>`).join('');
}
function renderCommentsListMarkup(items, opts = {}){
  const limit = Number(opts.limit || 5);
  const expanded = !!opts.expanded;
  const rows = expanded ? items : items.slice(0, limit);
  if(!items.length) return `<div class="empty">No comments yet.</div>`;
  return `${rows.map(c => {
    const d = new Date(c.created_at || c.timestamp || Date.now());
    const rel = timeAgoShort(d);
    return `<article class="commentItem"><div class="commentMeta"><strong>${escapeHtml(commentAuthorLabel(c))}</strong><span>${escapeHtml(rel || '')}</span></div>${commentTagPill(c) ? `<div class="commentTags">${commentTagPill(c)}</div>` : ''}<div class="commentText">${escapeHtml(c.comment_text || '')}</div></article>`;
  }).join('')}${items.length > limit ? `<button class="pillBtn commentMoreBtn" type="button" data-comment-toggle="1">${expanded ? 'Show less' : `Show more (${items.length - limit})`}</button>` : ''}`;
}
function quickTagsForTarget(targetType){
  if(targetType === 'band') return ['suggestion','question','feedback'];
  if(targetType === 'event_piece') return ['loved_it','needs_work','play_again'];
  return ['running_late','need_music','need_lift','can_help'];
}
function renderCommentComposer(targetType, targetId, eventId = '', pieceId = ''){
  const tags = quickTagsForTarget(targetType);
  const guestFields = state.session ? '' : `<div class="commentGuestRow"><input class="commentInput" data-guest-nickname-for="${escapeHtml(targetType)}|${escapeHtml(targetId)}" placeholder="Nickname" /><input class="commentInput" data-guest-email-for="${escapeHtml(targetType)}|${escapeHtml(targetId)}" placeholder="Contact email" /></div>`;
  return `<div class="commentComposer" data-comment-composer="${escapeHtml(targetType)}|${escapeHtml(targetId)}"><div class="commentTagRow">${tags.map(tag => `<button type="button" class="commentTagBtn" data-comment-tag="${escapeHtml(tag)}">${escapeHtml(String(tag).replace(/_/g,' '))}</button>`).join('')}</div>${guestFields}<textarea class="commentTextarea" data-comment-text-for="${escapeHtml(targetType)}|${escapeHtml(targetId)}" rows="3" placeholder="Add a comment for all to see"></textarea><div class="saveRow"><span class="saveMsg" id="comment-msg-${escapeHtml(targetType)}-${escapeHtml(targetId).replace(/[^a-zA-Z0-9_-]/g,'_')}">${state.session ? 'Posting as member.' : 'Guest comments require nickname and email.'}</span><button class="primaryBtn" type="button" data-save-comment="1" data-target-type="${escapeHtml(targetType)}" data-target-id="${escapeHtml(targetId)}" data-event-id="${escapeHtml(eventId)}" data-piece-id="${escapeHtml(pieceId)}">Post comment</button></div></div>`;
}
function renderCommentBlock(targetType, targetId, title, opts = {}){
  const items = commentsForTarget(targetType, targetId);
  const eventId = opts.eventId || '';
  const pieceId = opts.pieceId || '';
  return `<section class="commentBlock" data-comment-block="${escapeHtml(targetType)}|${escapeHtml(targetId)}"><div class="label">${escapeHtml(title)}</div><div class="commentList" data-comment-list="${escapeHtml(targetType)}|${escapeHtml(targetId)}">${renderCommentsListMarkup(items, { limit:3, expanded:false })}</div>${renderCommentComposer(targetType, targetId, eventId, pieceId)}</section>`;
}
function refreshCommentBlocks(){
  document.querySelectorAll('[data-comment-list]').forEach(el => {
    const key = el.getAttribute('data-comment-list') || '';
    const [targetType, ...rest] = key.split('|');
    const targetId = rest.join('|');
    const expanded = el.dataset.expanded === '1';
    el.innerHTML = renderCommentsListMarkup(commentsForTarget(targetType, targetId), { limit:3, expanded });
  });
}
async function persistComment(payload){
  const optimistic = {
    comment_id:`tmp_${Date.now()}`,
    target_type:payload.target_type,
    target_id:payload.target_id,
    event_id:payload.event_id || '',
    piece_id:payload.piece_id || '',
    author_type: state.session ? 'member' : 'guest',
    member_id: state.session?.member_id || '',
    display_name: state.session?.display_name || [state.session?.first_name, state.session?.last_name].filter(Boolean).join(' '),
    guest_nickname: payload.guest_nickname || '',
    guest_email: payload.guest_email || '',
    comment_text: payload.comment_text,
    tag_1: payload.tag_1 || '',
    tag_2: payload.tag_2 || '',
    is_public:'TRUE',
    status:'published',
    created_at:new Date().toISOString()
  };
  state.comments.unshift(optimistic);
  refreshCommentBlocks();
  const result = await saveCommentResponse(payload);
  if(!result.ok){
    state.comments = state.comments.filter(c => c.comment_id !== optimistic.comment_id);
    refreshCommentBlocks();
    return result;
  }
  const saved = result.result?.data || result.result || {};
  optimistic.comment_id = saved.comment_id || optimistic.comment_id;
  optimistic.created_at = saved.created_at || optimistic.created_at;
  refreshCommentBlocks();
  return result;
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








function renderCommentUtilitySummary(event){
  const eventCount = commentsForTarget('event', event.event_id).length;
  const pieceCount = getEventProgramRows(event).reduce((sum, r) => {
    const pieceId = String(r.piece_id || r.program_id || r.pieceId || '').trim();
    if(!pieceId) return sum;
    return sum + commentsForTarget('event_piece', `${event.event_id}|${pieceId}`).length;
  }, 0);
  return { eventCount, pieceCount, total:eventCount + pieceCount };
}

function renderCommentUtilityRow(event){
  const counts = renderCommentUtilitySummary(event);
  const totalLabel = counts.total === 1 ? 'Comments (1)' : `Comments (${counts.total})`;
  return `<div class="commentUtilityRow commentUtilityRow--compact"><div class="commentUtilityActions"><button class="pillBtn commentJumpBtn commentJumpBtn--count" type="button" data-open-comment="${escapeHtml(event.event_id)}"><span>${escapeHtml(totalLabel)}</span><span class="material-symbols-outlined">expand_more</span></button></div></div>`;
}

function renderEventNoticeRows(event, limit=3){
  const items = commentsForTarget('event', event.event_id);
  if(!items.length) return `<div class="empty eventNoticeEmpty">No recent notices</div>`;
  return items.slice(0, limit).map(c => {
    const ago = timeAgoShort(parseResponseDate(c) || new Date(c.created_at || ''));
    const who = commentAuthorLabel(c) || 'Guest';
    const tags = [c.tag_1, c.tag_2].map(v => String(v || '').trim()).filter(Boolean);
    const primaryTag = tags[0] ? String(tags[0]).replace(/_/g,' ') : '';
    const text = String(c.comment_text || '').trim();
    return `<article class="eventNoticeItem eventNoticeItem--compact" data-open-comment="${escapeHtml(event.event_id)}" role="button" tabindex="0">
      <span class="eventNoticeAgo">${escapeHtml(ago || '')}</span>
      <span class="eventNoticeSep">|</span>
      <span class="eventNoticeAuthor">${escapeHtml(who)}</span>
      ${primaryTag ? `<span class="eventNoticeSep">|</span><span class="eventNoticeTag">${escapeHtml(primaryTag)}</span>` : ''}
      <span class="eventNoticeSep">|</span>
      <span class="eventNoticeText">${escapeHtml(text)}</span>
    </article>`;
  }).join('');
}

function renderEventNotices(event){
  const items = commentsForTarget('event', event.event_id);
  if(!items.length) return '';
  const total = items.length;
  const previewCount = Math.min(total, 3);
  return `<section class="eventNoticesCard eventNoticesCard--compact" data-event-notices="${escapeHtml(event.event_id)}">
    <details class="eventNoticesDetails">
      <summary class="eventNoticesSummary">
        <span class="eventNoticesTitle">Latest comments (${previewCount}/${total})</span>
        <span class="eventNoticesChevron">▼</span>
      </summary>
      <div class="eventNoticesScroller eventNoticesScroller--preview">${renderEventNoticeRows(event, 20)}</div>
    </details>
  </section>`;
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
  const playersNeededRaw = playersNeededSummary(event);
  const playersNeededHtml = playersNeededRaw ? `<div class="compactCard__playersNeeded">${playersNeededRaw}</div>` : "";
  const isShowcase = label === "NEXT GIG" || label === "NEXT REHEARSAL";
  const eventKindLabel = event.type === 'rehearsal' ? 'REHEARSAL' : 'GIG';
  const showcaseBandBar = escapeHtml(cardBandLabel || `NEXT ${eventBandLabel(event).toUpperCase()} ${eventKindLabel}`);
  const denseBadge = escapeHtml(label === 'NEXT REHEARSAL' ? 'REHEARSAL' : (label || eventKindLabel));
  const responseHtml = state.session ? renderResponseMatrix(event.event_id, status, response) : `<button class="pillBtn loginPromptBtn" data-open-login="1"><span class="material-symbols-outlined">how_to_reg</span><span>RSVP</span></button>`;
  const noteHtml = event.notes ? `<div class="eventNote"><span class="material-symbols-outlined">priority_high</span><div class="eventNote__text">${escapeHtml(event.notes)}</div></div>` : ``;
  const detailsHtml = `
      <details class="cardDetails">
        <summary><span class="material-symbols-outlined" style="font-size:18px;vertical-align:middle">expand_more</span> Details</summary>
        <div class="commentUtilityWrap"></div>
        <div class="cardDetails__grid">
          <div>
            <div class="label">Band plan</div>
            <div class="inlineStageToolbar">
              <button class="pillBtn openStageBtn" data-open-stage="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">stadia_controller</span><span>Open full layout</span></button>
              <label class="prettyToggle">
                <input type="checkbox" data-stage-pretty-toggle="${escapeHtml(event.event_id)}">
                <span>Pretty layout</span>
              </label>
            </div>
            <div class="inlineStageHint">Compact list first. Tick “Pretty layout” to bring back the swimlane cards.</div>
            <div class="inlineStageBox inlineStageBox--compactFirst" id="stage-preview-${escapeHtml(event.event_id)}"></div>
          </div>
          <div>
            <div class="label">${detailTitle}</div>
            <div class="progList">
              ${renderProgramItems(detailRows, detailTitle, event)}
            </div>
          </div>
          <div>
            ${renderCommentBlock('event', event.event_id, 'Gig comments', { eventId:event.event_id })}
          </div>
          ${state.session ? `
            <div>
              <label class="field">
                <span>My note</span>
                <textarea rows="3" data-note-for="${escapeHtml(event.event_id)}" placeholder="Optional note">${escapeHtml(note)}</textarea>
              </label>
              <div class="saveRow">
                <span class="saveMsg" id="save-msg-${escapeHtml(event.event_id)}">${status ? `Current response: ${escapeHtml(labelForStatus(status))}` : "No response saved yet."}</span>
              </div>
            </div>
          ` : `<div class="progItem">Login to RSVP and add a note.</div>`}
        </div>
      </details>`;

  if(isShowcase){
    host.innerHTML = `
      <div class="compactCard eventCard eventCard--showcase eventCard--${theme} ${alertLineClass}" data-event-id="${escapeHtml(event.event_id)}" style="--band-accent:${escapeHtml(bandAccent)};">
        <div class="eventShowcase__bandbar">${showcaseBandBar}</div>
        <div class="eventShowcase__inner">
          <div class="eventShowcase__title">${escapeHtml(event.title)}</div>
          ${playersNeededHtml ? `<div class="eventShowcase__attention">${playersNeededHtml}</div>` : ''}
          ${noteHtml}
          <div class="eventShowcase__info">
            <div class="eventShowcase__meta"><span class="material-symbols-outlined compactCard__icon">schedule</span><span>${escapeHtml(when.dayLabel)} ${escapeHtml(when.dateLabel)} · ${escapeHtml(when.timeLabel || "")}</span></div>
            <div class="eventShowcase__meta"><span class="material-symbols-outlined compactCard__icon">location_on</span><span>${venue}</span></div>
            <div class="eventShowcase__meta"><span class="material-symbols-outlined compactCard__icon">checkroom</span><span>${escapeHtml(attireText)}</span></div>
          </div>
          ${renderEventNotices(event)}
          <div class="eventShowcase__footer">
            <div class="eventShowcase__action eventShowcase__action--rsvp">${responseHtml}</div>
            <div class="eventShowcase__action eventShowcase__action--countdown"><div class="compactCard__countdown"><span class="material-symbols-outlined">timer</span><span>${escapeHtml(compactFromNowLabel(event.parsed))}</span></div></div>
            <div class="eventShowcase__action eventShowcase__action--buttons"><button class="eventShowcase__detailsBtn" type="button" data-open-details="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">expand_more</span><span>Details</span></button></div>
          </div>
          ${renderShowcaseResponseReminder(response)}
          ${renderShowcaseBandPlan(event, label)}
${detailsHtml}
        </div>
      </div>
    `;
  } else {
    host.innerHTML = `
      <div class="compactCard eventCard eventCard--dense eventCard--${theme} ${alertLineClass}" data-event-id="${escapeHtml(event.event_id)}" style="--band-accent:${escapeHtml(bandAccent)};">
        <div class="compactCard__row compactCard__row--top">
          <div class="compactCard__left">
            <span class="material-symbols-outlined compactCard__icon">${event.type === "rehearsal" ? "music_note" : "celebration"}</span>
            <span class="compactCard__title">${escapeHtml(event.title)}</span>
          </div>
          ${state.session ? `
          <div class="miniRsvpOnly" aria-label="RSVP quick response">
            <button class="responseMini ${status === "Y" ? "active committed" : ""}" data-response-event="${escapeHtml(event.event_id)}" data-status="Y" title="Available">✓</button>
            <button class="responseMini ${status === "M" ? "active committed" : ""}" data-response-event="${escapeHtml(event.event_id)}" data-status="M" title="Maybe">?</button>
            <button class="responseMini ${status === "N" ? "active committed" : ""}" data-response-event="${escapeHtml(event.event_id)}" data-status="N" title="Not available">✕</button>
          </div>` : `<button class="pillBtn loginPromptBtn compactLoginBtn" data-open-login="1"><span class="material-symbols-outlined">how_to_reg</span><span>RSVP</span></button>`}
        </div>
        ${noteHtml}
        ${playersNeededHtml || ""}
        
        <div class="compactCard__row compactCard__row--denseMeta">
          <div class="compactCard__left">
            <span class="material-symbols-outlined compactCard__icon">schedule</span>
            <span class="compactCard__metaText">${escapeHtml(when.dayLabel)} ${escapeHtml(when.dateLabel)} · ${escapeHtml(when.timeLabel || "")}</span>
          </div>
          <div class="compactCard__countdown"><span class="material-symbols-outlined">timer</span><span>${escapeHtml(compactFromNowLabel(event.parsed))}</span></div>
        </div>
        <div class="compactCard__row compactCard__row--denseMeta">
          <div class="compactCard__left"><span class="material-symbols-outlined compactCard__icon">location_on</span><span class="compactCard__metaText">${venue}</span></div>
        </div>
        <div class="compactCard__row compactCard__row--denseMeta compactCard__row--bottomMeta">
          <div class="compactCard__left"><span class="material-symbols-outlined compactCard__icon">checkroom</span><span class="compactCard__metaText">${escapeHtml(attireText)}</span></div>
          <span class="themePill" style="${bandChipStyle(eventBandColour(event))}">${denseBadge}</span>
        </div>
        ${renderShowcaseResponseReminder(response)}
${detailsHtml}
      </div>
    `;
  }
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
  const event = (state.events || []).find(e => String(e.event_id) === String(eventId));
  const defaultMode = event && String(event.band_type || '').toLowerCase() === 'main' ? 'compact' : 'pretty';
  setInlineStagePreviewMode(eventId, defaultMode);
}


function renderInlineStageTable(host, chairs, assignments, eventId){
  if(!host) return;
  host.innerHTML = renderStageTableMarkup(chairs, assignments, eventId, true);
}

function renderInlineSwimlaneTable(host, chairs, assignments, eventId){
  if(!host) return;
  renderStageSwimlaneTable(host, chairs, assignments, eventId);
}

function compactStageSectionLabel(section){
  const raw = String(section || 'Band').trim();
  const low = raw.toLowerCase();
  if(low.includes('soprano')) return 'SOP';
  if(low.includes('front') && low.includes('cornet')) return 'FR CORNET';
  if(low === 'repiano' || low.includes('repiano')) return 'REP';
  if(low.includes('flugel')) return 'FLUGEL';
  if(low.includes('solo') && low.includes('cornet')) return 'SOLO';
  if(low.includes('horn')) return 'HORN';
  if(low.includes('baritone')) return 'BARI';
  if(low.includes('euphon')) return 'EUPH';
  if(low.includes('trombone')) return 'TBONE';
  if(low.includes('bass')) return 'BASS';
  if(low.includes('percussion')) return 'PERC';
  return raw.toUpperCase();
}

function buildCompactStageMarkup(chairs, assignments){
  const groups = chairsGroupedBySection(chairs || []);
  const assignmentsByChair = chairAssignmentsByCode(assignments || []);
  const lines = groups.map(([section, items]) => {
    const parts = items.map(ch => {
      const members = membersForChair(assignmentsByChair, ch.chair_code);
      const isVacant = !members.length;
      const names = members.length
        ? members.map(m => `<span>${bbhubCompactPlayerName(stageMemberLabel(m))}</span>`).join(', ')
        : '<span class="compactBand__vacant">Vacant</span>';
      const code = String(ch.display_short || ch.chair_code || '').trim().toLowerCase();
      if(items.length === 1) return names;
      const chairCode = `<span class="compactBand__chairCode${isVacant ? ' compactBand__chairCode--vacant' : ''}">${escapeHtml(code)}</span>`;
      return `<span class="compactBand__chairChunk${isVacant ? ' compactBand__chairChunk--vacant' : ''}">${chairCode}:${names}</span>`;
    }).join(', ');
    return `<div class="compactBand__line"><span class="compactBand__group">${escapeHtml(compactStageSectionLabel(section))}</span><span class="compactBand__sep">|</span><span class="compactBand__players">${parts}</span></div>`;
  }).join('');
  return `<div class="compactBand">${lines || `<div class="empty">No seating loaded.</div>`}</div>`;
}

function renderInlineCompactStage(host, chairs, assignments, eventId){
  if(!host) return;
  host.innerHTML = buildCompactStageMarkup(chairs, assignments);
}

function showcasePlanPalette(sectionName, instrumentName){
  const cls = bbhubSeatSectionClass(sectionName, instrumentName);
  const map = {
    'seat--soprano': { fill:'#dbeafe', stroke:'#2563eb', text:'#1e3a8a' },
    'seat--cornet': { fill:'#dbeafe', stroke:'#3b82f6', text:'#1d4ed8' },
    'seat--flugel': { fill:'#cffafe', stroke:'#06b6d4', text:'#155e75' },
    'seat--horn': { fill:'#f3e8ff', stroke:'#9333ea', text:'#6b21a8' },
    'seat--euph': { fill:'#d1fae5', stroke:'#14b8a6', text:'#0f766e' },
    'seat--bari': { fill:'#d1fae5', stroke:'#10b981', text:'#065f46' },
    'seat--tbone': { fill:'#e2e8f0', stroke:'#64748b', text:'#334155' },
    'seat--bass': { fill:'#dcfce7', stroke:'#16a34a', text:'#166534' },
    'seat--perc': { fill:'#fee2e2', stroke:'#ef4444', text:'#991b1b' },
    'seat--staff': { fill:'#fef3c7', stroke:'#a16207', text:'#854d0e' },
    'seat--guest': { fill:'#ede9fe', stroke:'#7c3aed', text:'#5b21b6' },
    'seat--default': { fill:'#e2e8f0', stroke:'#94a3b8', text:'#334155' }
  };
  return map[cls] || map['seat--default'];
}


function renderShowcasePlanMarkup(chairs, assignments, eventId){
  const items = (chairs || []).map(normalizeChair).filter(Boolean);
  if(!items.length) return '<div class="eventShowcase__emptyPlan">No seating loaded.</div>';
  const assignmentsByChair = chairAssignmentsByCode(assignments || []);
  const seatR = 28;
  const labelGap = 44;
  const minX = Math.min(...items.map(ch => Number(ch.default_x || 0))) - seatR - 18;
  const maxX = Math.max(...items.map(ch => Number(ch.default_x || 0))) + seatR + 18;
  const minY = Math.min(...items.map(ch => Number(ch.default_y || 0))) - seatR - 26;
  const maxY = Math.max(...items.map(ch => Number(ch.default_y || 0))) + seatR + labelGap;
  const width = Math.max(260, maxX - minX);
  const height = Math.max(180, maxY - minY);
  const pad = 18;
  const viewBox = `${minX - pad} ${minY - pad} ${width + pad * 2} ${height + pad * 2}`;

  const parts = [];
  parts.push(`<svg class="eventShowcase__planSvg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Band seating plan">`);
  parts.push(`<rect x="${minX - 8}" y="${minY - 8}" width="${width + 16}" height="${height + 16}" rx="26" fill="rgba(248,250,252,.98)" stroke="rgba(148,163,184,.28)"/>`);

  for(const ch of items){
    const members = membersForChair(assignmentsByChair, ch.chair_code);
    const statusInfo = chairStatusInfo(eventId, members);
    const seatFill = stageFill(statusInfo.code);
    const isAlert = statusInfo.code === 'N';
    const names = members.slice(0, 3).map(member => stageMemberLabel(member));
    const title = chairMembersTitle(ch.chair_label || ch.display_short || ch.chair_code || 'Chair', members, eventId);
    parts.push(`<g class="eventShowcase__planSeat ${isAlert ? 'eventShowcase__planSeat--vacant' : 'eventShowcase__planSeat--filled'} ${bbhubSeatSectionClass(ch.section, ch.chair_label || ch.instrument || '')}" data-status="${statusInfo.code}" transform="translate(${Number(ch.default_x || 0)},${Number(ch.default_y || 0)})">`);
    parts.push(`<title>${escapeHtml(title)}</title>`);
    parts.push(`<circle r="30" fill="${seatFill}" stroke="${isAlert ? '#d32f2f' : 'rgba(16,24,39,.22)'}" stroke-width="${isAlert ? '3.2' : '2'}"/>`);
    parts.push(`<circle r="34" fill="none" stroke="${isAlert ? 'rgba(211,47,47,.42)' : 'rgba(15,23,42,.06)'}" stroke-width="${isAlert ? '5' : '3'}"/>`);
    parts.push(`<text class="eventShowcase__planCode" text-anchor="middle" y="-12">${escapeHtml(ch.display_short || ch.chair_code || '')}</text>`);
    if(names.length){
      names.forEach((name, idx) => {
        parts.push(`<text class="eventShowcase__planName" text-anchor="middle" y="${2 + idx * 11}">${escapeHtml(name)}</text>`);
      });
      if(members.length > 3){
        parts.push(`<text class="eventShowcase__planMore" text-anchor="middle" y="${2 + 3 * 11}">+${members.length - 3}</text>`);
      }
    } else {
      parts.push(`<text class="eventShowcase__planVacant" text-anchor="middle" y="8">Vacant</text>`);
    }
    parts.push(`<text class="eventShowcase__planLabel" text-anchor="middle" y="48">${escapeHtml(ch.chair_label || ch.instrument || '')}</text>`);
    parts.push(`</g>`);
  }

  parts.push(`</svg>`);
  return parts.join('');
}

function renderShowcaseBandPlan(event, label){
  const isNextMainGig = label === "NEXT GIG" && String(event?.band_type || '').toLowerCase() === 'main';
  if(!isNextMainGig) return '';
  const chairs = chairsForEvent(event);
  if(!chairs.length) return '';
  const assignments = assignmentsForEvent(event);
  const eventId = escapeHtml(event.event_id);
  return `
    <div class="eventShowcase__bandPlan">
      <div class="eventShowcase__bandPlanTitle">Band plan</div>
      <div class="eventShowcase__bandGraphicWrap">
        <div class="eventShowcase__bandGraphicHead">
          <div class="eventShowcase__bandGraphicTitle">Seating view</div>
          <div class="eventShowcase__bandLegend" aria-label="Section colours">
            <span class="eventShowcase__legendItem"><i class="seatLegendDot seatLegendDot--cornet"></i>Cornets</span>
            <span class="eventShowcase__legendItem"><i class="seatLegendDot seatLegendDot--horn"></i>Horns</span>
            <span class="eventShowcase__legendItem"><i class="seatLegendDot seatLegendDot--low"></i>Low brass</span>
            <span class="eventShowcase__legendItem"><i class="seatLegendDot seatLegendDot--perc"></i>Perc</span>
          </div>
        </div>
        <div class="eventShowcase__viewTabs" role="tablist" aria-label="Band plan view">
          <button class="eventShowcase__viewTab is-active" type="button" data-showcase-view-tab="${eventId}" data-view="plan" aria-pressed="true">Plan</button>
          <button class="eventShowcase__viewTab" type="button" data-showcase-view-tab="${eventId}" data-view="swimlane" aria-pressed="false">Swimlane</button>
          <button class="eventShowcase__viewTab" type="button" data-showcase-view-tab="${eventId}" data-view="table" aria-pressed="false">Table</button>
        </div>
        <div class="eventShowcase__viewPanel is-active" data-showcase-view-panel="${eventId}" data-view="plan">
          ${renderShowcasePlanMarkup(chairs, assignments, event.event_id)}
        </div>
        <div class="eventShowcase__viewPanel" data-showcase-view-panel="${eventId}" data-view="swimlane">
          <div class="eventShowcase__swimlaneWrap">
            <div class="eventShowcase__swimlaneToolbar">
              <div class="inlineStageHint">Compact list first. Tick “Pretty layout” to bring back the swimlane cards.</div>
              <label class="prettyToggle prettyToggle--showcase">
                <input type="checkbox" class="eventShowcase__prettyToggle" data-showcase-pretty-toggle="${eventId}">
                <span>Pretty layout</span>
              </label>
            </div>
            <div class="eventShowcase__swimlaneCompact is-active" data-showcase-swimlane-compact="${eventId}">
              ${buildCompactStageMarkup(chairs, assignments)}
            </div>
            <div class="eventShowcase__swimlanePretty" data-showcase-swimlane-pretty="${eventId}">
              ${renderSwimlaneTableMarkup(chairs, assignments, event.event_id, { showcase:true })}
            </div>
          </div>
        </div>
        <div class="eventShowcase__viewPanel" data-showcase-view-panel="${eventId}" data-view="table">
          ${renderStageTableMarkup(chairs, assignments, event.event_id, true)}
        </div>
      </div>
    </div>`;
}

function setInlineStagePreviewMode(eventId, mode){
  const host = document.getElementById(`stage-preview-${eventId}`);
  if(!host) return;
  const event = (state.events || []).find(e => String(e.event_id) === String(eventId));
  const chairs = chairsForEvent(event);
  const assignments = assignmentsForEvent(event);
  const resolved = mode === 'pretty' ? 'pretty' : 'compact';
  host.dataset.previewMode = resolved;
  const toggle = document.querySelector(`[data-stage-pretty-toggle="${CSS.escape(String(eventId))}"]`);
  if(toggle) toggle.checked = resolved === 'pretty';
  if(resolved === 'pretty') renderInlineSwimlaneTable(host, chairs, assignments, eventId);
  else renderInlineCompactStage(host, chairs, assignments, eventId);
}


function bbhubSeatSectionClass(sectionName, instrumentName){
  const t = String(sectionName || instrumentName || "").toLowerCase();
  if(t.includes("soprano")) return "seat--soprano";
  if(t.includes("cornet")) return "seat--cornet";
  if(t.includes("flugel")) return "seat--flugel";
  if(t.includes("horn")) return "seat--horn";
  if(t.includes("euphon")) return "seat--euph";
  if(t.includes("baritone")) return "seat--bari";
  if(t.includes("trombone")) return "seat--tbone";
  if(t.includes("bass")) return "seat--bass";
  if(t.includes("percussion")) return "seat--perc";
  if(t.includes("staff")) return "seat--staff";
  if(t.includes("guest")) return "seat--guest";
  return "seat--default";
}
function bbhubCompactPlayerName(name){
  return escapeHtml(String(name || "").trim());
}

function renderStageSwimlaneTable(host, chairs, assignments, eventId){
  const groups = chairsGroupedBySection(chairs || []);
  const assignmentsByChair = chairAssignmentsByCode(assignments || []);
  const parts = ['<div class="seatBoard">'];
  groups.forEach(([section, items]) => {
    const filled = items.filter(ch => membersForChair(assignmentsByChair, ch.chair_code).length > 0).length;
    const total = items.length;
    const needs = filled < total;
    parts.push(`<section class="seatLane ${needs ? 'seatLane--needs' : ''}">`);
    parts.push(`<div class="seatLane__title">${escapeHtml(section)} <span class="seatLane__count">${filled}/${total} filled</span></div>`);
    parts.push('<div class="seatLane__grid">');
    items.forEach(ch => {
      const members = membersForChair(assignmentsByChair, ch.chair_code);
      const isVacant = !members.length;
      const secClass = bbhubSeatSectionClass(section, ch.chair_label || ch.instrument || '');
      const playerHtml = isVacant
        ? '<div class="seatCard__player seatCard__player--vacant">Vacant</div>'
        : members.slice(0, 3).map(member => {
            const isCurrent = state.session && String(state.session.member_id || '') === String(member.member_id || '');
            return `<div class="seatCard__player${isCurrent ? ' seatCard__player--me' : ''}">${escapeHtml(stageMemberLabel(member))}</div>`;
          }).join('') + (members.length > 3 ? `<div class="seatCard__more">+${members.length - 3} more</div>` : '');
      parts.push(`
        <article class="seatCard ${secClass} ${isVacant ? 'seatCard--vacant' : 'seatCard--filled'}" title="${escapeHtml(chairMembersTitle(ch.chair_label || ch.display_short || ch.chair_code || 'Chair', members, eventId))}">
          <div class="seatCard__code">${escapeHtml(ch.display_short || ch.chair_code || '')}</div>
          ${playerHtml}
          <div class="seatCard__instrument">${escapeHtml(ch.chair_label || ch.instrument || section || '')}</div>
        </article>
      `);
    });
    parts.push('</div></section>');
  });
  parts.push('</div>');
  host.innerHTML = parts.join('');
}

function renderSwimlaneTableMarkup(chairs, assignments, eventId, opts = {}){
  const host = document.createElement('div');
  renderStageSwimlaneTable(host, chairs, assignments, eventId);
  return host.innerHTML;
}

function renderStageTableMarkup(chairs, assignments, eventId, compact = false){
  const groups = chairsGroupedBySection(chairs);
  const assignmentsByChair = chairAssignmentsByCode(assignments);
  const body = groups.map(([section, items]) => {
    const sectionHead = `<tr class="stageList__sectionRow"><td colspan="2" class="stageList__section">${escapeHtml(section)}</td></tr>`;
    const rows = items.map(ch => {
      const members = membersForChair(assignmentsByChair, ch.chair_code);
      const isVacant = !members.length;
      const names = isVacant
        ? `<span class="stageName stageName--vacant">Vacant</span>`
        : chairMembersMarkup(eventId, members);
      return `<tr class="stageList__row ${isVacant ? 'stageList__row--vacant' : ''}">
        <td class="stageList__chair"><span class="chairChip">${escapeHtml(ch.display_short || ch.chair_code || '')}</span><span class="stageList__chairLabel">${escapeHtml(ch.chair_label || '')}</span></td>
        <td class="stageList__names">${names}</td>
      </tr>`;
    }).join('');
    return sectionHead + rows;
  }).join('');
  return `<div class="strengthWrap"><div class="stageMatrixWrap"><table class="stageTable stageList ${compact ? 'stageTable--compact' : ''}"><tbody>${body || `<tr><td colspan="2"><div class="empty">No seating loaded.</div></td></tr>`}</tbody></table></div></div>`;
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
    requestAnimationFrame(() => resetStageView());
  }
}

function stageStatus(eventId, memberId){
  const resp = memberId ? rsvpFor(eventId, memberId) : null;
  return String(resp?.status || (memberId ? "Y" : "N")).toUpperCase();
}
function stageFill(status){ return status === "Y" ? "var(--ok)" : status === "M" ? "var(--maybe)" : "var(--no)"; }

function renderStagePlan(svg, chairs, assignments, eventId){
  const stageGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
  stageGroup.setAttribute("id","stageGroup");
  svg.appendChild(stageGroup);
  const bg = document.createElementNS("http://www.w3.org/2000/svg","rect");
  bg.setAttribute("x","40"); bg.setAttribute("y","20"); bg.setAttribute("width","920"); bg.setAttribute("height","700");
  bg.setAttribute("rx","28"); bg.setAttribute("fill","rgba(0,0,0,0.04)"); bg.setAttribute("stroke","rgba(128,128,128,0.18)");
  stageGroup.appendChild(bg);

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
    g.appendChild(title); stageGroup.appendChild(g);
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
    stageGroup.appendChild(laneLabel);

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
      g.appendChild(title); stageGroup.appendChild(g);
    });
  });
}


function renderStageTable(host, chairs, assignments, eventId){
  if(!host) return;
  host.innerHTML = renderStageTableMarkup(chairs, assignments, eventId, false);
}

function applyStageViewBox(){
  const svg = $("stageSvg");
  if(svg){
    svg.setAttribute("viewBox",
      `${state.stageViewBox.x} ${state.stageViewBox.y} ${state.stageViewBox.w} ${state.stageViewBox.h}`);
  }
}

function fitStageView(){
  const svg = $("stageSvg");
  const stageGroup = $("stageGroup");
  if(!svg || !stageGroup || typeof stageGroup.getBBox !== "function") return false;

  let bbox;
  try{
    bbox = stageGroup.getBBox();
  }catch(e){
    return false;
  }

  if(!bbox || !bbox.width || !bbox.height) return false;

  const pad = 0.10;
  const padX = Math.max(24, bbox.width * pad);
  const padY = Math.max(24, bbox.height * pad);

  state.stageViewBox = {
    x: bbox.x - padX,
    y: bbox.y - padY,
    w: bbox.width + padX * 2,
    h: bbox.height + padY * 2
  };

  applyStageViewBox();
  return true;
}

function resetStageView(){
  if(!fitStageView()){
    state.stageViewBox = {x:0,y:0,w:1000,h:760};
    applyStageViewBox();
  }
}

function zoomStage(f){
  const vb = state.stageViewBox;
  const nw = vb.w * f;
  const nh = vb.h * f;
  vb.x += (vb.w - nw) / 2;
  vb.y += (vb.h - nh) / 2;
  vb.w = nw;
  vb.h = nh;
  applyStageViewBox();
}

function panStage(dx,dy){
  const vb = state.stageViewBox;
  vb.x += dx;
  vb.y += dy;
  applyStageViewBox();
}

function sameDayDate(a, b){
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function dayShortLabel(date){
  return date.toLocaleDateString("en-AU", { weekday:"short" });
}
function monthHeaderLabel(date){
  return date.toLocaleDateString("en-AU", { month:"long", year:"numeric" });
}
function timelineDateLabel(event){
  const d = event?.parsed instanceof Date ? event.parsed : new Date(event?.start_datetime || event?.date || 0);
  if(Number.isNaN(+d)) return { day:"", date:"", month:"" };
  return {
    day: dayShortLabel(d),
    date: String(d.getDate()),
    month: d.toLocaleDateString("en-AU", { month:"short" })
  };
}
function timelineTimeLabel(event){
  const when = formatEventDateParts(event.date, event.start_time, event.end_time, event.end_date || event.date);
  return when.timeLabel || "";
}
function mapSearchHref(place){
  const q = String(place || "").trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : "";
}
function timelineCounts(eventId){
  const rows = (state.rsvp || []).filter(r => normEventId(r.event_id) === normEventId(eventId));
  return {
    y: rows.filter(r => String(r.status || "").toUpperCase() === "Y").length,
    m: rows.filter(r => String(r.status || "").toUpperCase() === "M").length,
    n: rows.filter(r => String(r.status || "").toUpperCase() === "N").length
  };
}
function timelineToneClass(event){
  if(event.type === "rehearsal") return "timelineEvent--rehearsal";
  if(event.type === "gig") return "timelineEvent--gig";
  return "timelineEvent--other";
}
function timelineIcon(event){
  if(event.type === "rehearsal") return "music_note";
  if(event.type === "gig") return "celebration";
  return "event";
}
function timelinePlayersNeededMarkup(event){
  const txt = String(event?.players_needed || event?.playersNeeded || event?.alert || "").trim();
  if(!txt) return "";
  return `<div class="timelineNeed"><span class="material-symbols-outlined">warning</span><span>${escapeHtml(txt)}</span></div>`;
}
function renderTimelineList(hostId, items, emptyText){
  const host = $(hostId);
  if(!host) return;
  if(!(items || []).length){
    host.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  const monthGroups = [];
  let currentMonth = null;
  items.forEach(event => {
    const d = event?.parsed instanceof Date ? event.parsed : new Date(event?.start_datetime || event?.date || 0);
    if(Number.isNaN(+d)) return;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if(!currentMonth || currentMonth.key !== key){
      currentMonth = { key, label: monthHeaderLabel(d), items: [] };
      monthGroups.push(currentMonth);
    }
    currentMonth.items.push(event);
  });

  host.innerHTML = monthGroups.map(group => {
    let prevDay = null;
    const body = group.items.map(event => {
      const d = event.parsed instanceof Date ? event.parsed : new Date(event.start_datetime || event.date || 0);
      const showDay = !prevDay || !sameDayDate(prevDay, d);
      prevDay = d;
      const dt = timelineDateLabel(event);
      const bandAccent = eventBandColour(event);
      const bandText = bandTextColour(bandAccent);
      const venueText = event.location || event.venue || event.place || "Venue TBC";
      const venue = escapeHtml(venueText);
      const venueHref = mapSearchHref(venueText);
      const counts = timelineCounts(event.event_id);
      const response = state.session ? rsvpFor(event.event_id, state.session.member_id) : null;
      const you = response ? `<span class="timelineYou timelineYou--${statusClass(response.status)}">You: ${escapeHtml(labelForStatus(response.status))}</span>` : "";
      const note = timelinePlayersNeededMarkup(event);
      const metaMain = `<span>${escapeHtml(timelineTimeLabel(event))}</span>`;
      const metaVenue = venueHref ? `<a class="timelineEvent__metaLink" href="${escapeHtml(venueHref)}" target="_blank" rel="noopener" data-stop-open="1"><span class="material-symbols-outlined">location_on</span>${venue}</a>` : `<span>${venue}</span>`;
      return `
        <div class="timelineRow ${showDay ? 'timelineRow--newDay' : 'timelineRow--sameDay'}" data-event-id="${escapeHtml(event.event_id)}">
          <div class="timelineDate ${showDay ? '' : 'timelineDate--ghost'}">
            ${showDay ? `<div class="timelineDate__day">${escapeHtml(dt.day)}</div><div class="timelineDate__num">${escapeHtml(dt.date)}</div><div class="timelineDate__month">${escapeHtml(dt.month)}</div>` : ''}
          </div>
          <button class="timelineEvent ${timelineToneClass(event)}" data-open-details="1" style="--timeline-band:${escapeHtml(bandAccent)};--timeline-band-text:${escapeHtml(bandText)};">
            <div class="timelineEvent__top">
              <span class="material-symbols-outlined timelineEvent__icon">${timelineIcon(event)}</span>
              <span class="timelineEvent__title">${escapeHtml(event.title || event.event_name || "Untitled event")}</span>
              ${you}
            </div>
            <div class="timelineEvent__meta">${metaMain}<span class="timelineEvent__metaSep">·</span>${metaVenue}</div>
            ${note}
            <div class="timelineEvent__foot">
              <span class="timelineBand">${escapeHtml(eventBandLabel(event))}</span>
              <span class="timelineRspv">✔ ${counts.y} &nbsp; ? ${counts.m} &nbsp; ✖ ${counts.n}</span>
            </div>
          </button>
        </div>`;
    }).join("");
    return `<section class="timelineMonth"><div class="timelineMonth__label">${escapeHtml(group.label)}</div><div class="timelineMonth__body">${body}</div></section>`;
  }).join("");
}

function renderLibrary(){
  const host = $("libraryList");
  if(!state.pieces.length){ host.innerHTML = `<div class="empty">No pieces found.</div>`; return; }
  host.innerHTML = state.pieces.map(p => `<div class="libraryItem"><div class="libraryTitle">${escapeHtml(p.title || p.piece_name || p.piece_id || "")}</div><div class="libraryMeta">${escapeHtml([p.composer, p.arranger].filter(Boolean).join(" — "))}</div></div>`).join("");
}

function renderPlanner(){
  const items = getFilteredUpcomingEvents();
  renderTimelineList("homeTimelineList", items, "No events found.");
  renderTimelineList("plannerTimelineList", items, "No events found.");

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

function nudgeEventLink(eventId){
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('event', String(eventId || ''));
  return url.toString();
}
function nudgeChairLabel(ch){
  const code = String(ch?.display_short || ch?.chair_code || '').trim();
  const label = String(ch?.chair_label || ch?.instrument || ch?.section || '').trim();
  return label && label.toLowerCase() !== code.toLowerCase() ? `${code} (${label})` : code;
}
function nudgeAssignmentStats(event){
  const chairs = chairsForEvent(event).filter(ch => !ch.is_optional);
  const assignments = assignmentsForEvent(event);
  const byChair = chairAssignmentsByCode(assignments);
  const needs = [];
  let covered = 0;
  chairs.forEach(ch => {
    const members = membersForChair(byChair, ch.chair_code);
    if(members.length > 0) covered += 1;
    else needs.push({ chair: ch, reason: 'vacant' });
  });
  const assignedMemberIds = new Set(assignments
    .map(a => String(a.member_id || a.member_id_check || a.display_name || a.display_name_check || '').trim())
    .filter(Boolean));
  return { chairs, assignments, needs, covered, vacant: needs.length, total: chairs.length, assignedPlayers: assignedMemberIds.size, extraAssignments: Math.max(0, assignments.length - covered) };
}
function nudgeEventStats(event){ return nudgeAssignmentStats(event); }
function nudgeDateLine(event){
  const d = event?.parsed instanceof Date ? event.parsed : new Date(event?.start_datetime || event?.date || 0);
  if(Number.isNaN(+d)) return 'Date TBC';
  const date = d.toLocaleDateString('en-AU', { weekday:'short', day:'2-digit', month:'short' });
  const time = timelineTimeLabel(event);
  return time ? `${date} · ${time}` : date;
}
function buildNudgeMessage(event, tone = 'reminder'){
  const stats = nudgeAssignmentStats(event);
  const needLines = stats.needs.length ? stats.needs.map(item => `⚠️ ${nudgeChairLabel(item.chair)}`).join('\n') : '✅ No vacant core chairs showing in BBHub right now.';
  const title = event?.title || event?.event_name || event?.event_id || 'Band event';
  const prefix = tone === 'urgent' ? '🚨 Chair coverage check' : tone === 'friendly' ? '🎺 Friendly BBHub reminder' : '🎺 BBHub chair coverage reminder';
  const action = tone === 'urgent' ? 'Please jump into BBHub ASAP so we can lock the band plan 👇' : tone === 'friendly' ? 'When you get a moment, please check the band plan and update your response here 👇' : 'Please check the band plan and update your response here 👇';
  return `${prefix}\n\n${title}\n📅 ${nudgeDateLine(event)}\n\nBand plan from Assignments:\n🎼 Chairs filled: ${stats.covered}/${stats.total}\n👥 Players assigned: ${stats.assignedPlayers}\n⚠️ Vacant chairs: ${stats.vacant}\n\nChairs needing coverage:\n${needLines}\n\n${action}\n${nudgeEventLink(event.event_id)}`;
}
function nudgePlanFilename(event){
  const raw = String(event?.event_id || event?.event_name || 'band-plan').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `${raw || 'band-plan'}-chair-plan.png`;
}
function nudgePlanMarkup(event){ return renderShowcasePlanMarkup(chairsForEvent(event), assignmentsForEvent(event), event?.event_id || ''); }
async function exportNudgePlanImage(eventId){
  const event = (state.events || []).find(e => String(e.event_id) === String(eventId));
  if(!event) return;
  const holder = document.createElement('div');
  holder.style.position = 'fixed'; holder.style.left = '-10000px'; holder.style.top = '0'; holder.style.width = '1100px'; holder.style.background = '#ffffff';
  holder.innerHTML = nudgePlanMarkup(event);
  document.body.appendChild(holder);
  const svg = holder.querySelector('svg');
  if(!svg){ holder.remove(); alert('No chair plan SVG found for this event.'); return; }
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const viewBox = clone.getAttribute('viewBox') || '0 0 1000 700';
  const parts = viewBox.split(/\s+/).map(Number);
  const w = Math.max(800, Math.round(parts[2] || 1000));
  const h = Math.max(500, Math.round(parts[3] || 700));
  clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h));
  const style = document.createElement('style');
  style.textContent = '.eventShowcase__planCode{font:bold 18px Arial,sans-serif;fill:#111827}.eventShowcase__planName,.eventShowcase__planVacant{font:bold 11px Arial,sans-serif;fill:#111827}.eventShowcase__planMore{font:bold 10px Arial,sans-serif;fill:#475569}.eventShowcase__planLabel{font:10px Arial,sans-serif;fill:#475569}';
  clone.insertBefore(style, clone.firstChild);
  const svgText = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas'); canvas.width = w * 2; canvas.height = h * 2;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url); holder.remove();
    canvas.toBlob(outBlob => {
      if(!outBlob) return alert('Could not create chair plan image.');
      const a = document.createElement('a'); a.href = URL.createObjectURL(outBlob); a.download = nudgePlanFilename(event); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); holder.remove(); alert('Could not render the chair plan image.'); };
  img.src = url;
}
function renderNudgeDashboard(){
  const host = $('nudgeDashboardList');
  if(!host) return;
  const allItems = eventsVisibleToCurrentUser(getFilteredUpcomingEvents()).filter(e => e.type !== 'rehearsal');
  const routeEventId = String(state.route.eventId || '');
  const items = routeEventId ? allItems.filter(e => String(e.event_id) === routeEventId) : allItems.slice(0, 30);
  if(!items.length){ host.innerHTML = '<div class="empty">No upcoming gigs found.</div>'; return; }
  host.classList.remove('empty');
  host.innerHTML = items.map(event => {
    const stats = nudgeAssignmentStats(event);
    const msg = buildNudgeMessage(event, $('nudgeToneSelect')?.value || 'reminder');
    const needsHtml = stats.needs.length
      ? stats.needs.slice(0, 8).map(item => `<span class="nudgeChairNeed">${escapeHtml(nudgeChairLabel(item.chair))}</span>`).join('') + (stats.needs.length > 8 ? `<span class="nudgeChairNeed nudgeChairNeed--more">+${stats.needs.length - 8} more</span>` : '')
      : '<span class="nudgeAllGood">All core chairs covered</span>';
    return `<article class="nudgeCard" data-nudge-event="${escapeHtml(event.event_id)}">
      <div class="nudgeCard__main">
        <div class="nudgeCard__top"><span class="nudgeBandPill">${escapeHtml(eventBandLabel(event))}</span><span class="nudgeDate">${escapeHtml(nudgeDateLine(event))}</span></div>
        <h3>${escapeHtml(event.title || event.event_name || event.event_id)}</h3>
        <div class="nudgeStats"><span>🎼 ${stats.covered}/${stats.total} chairs filled</span><span>👥 ${stats.assignedPlayers} players assigned</span><span>⚠️ ${stats.vacant} vacant</span></div>
        <div class="nudgeNeeds">${needsHtml}</div>
      </div>
      <div class="nudgeActions">
        <button class="pillBtn" type="button" data-nudge-toggle="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">expand_more</span><span>Preview</span></button>
        <button class="pillBtn" type="button" data-nudge-plan="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">image</span><span>Plan PNG</span></button>
        <button class="primaryBtn" type="button" data-nudge-go="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">send</span><span>GO</span></button>
      </div>
      <details class="nudgePreviewAccordion" data-nudge-details="${escapeHtml(event.event_id)}">
        <summary>Review / copy WhatsApp text manually</summary>
        <div class="nudgePreviewGrid">
          <textarea class="nudgePreviewText" readonly>${escapeHtml(msg)}</textarea>
          <div class="nudgePlanPreview">
            <div class="nudgePlanPreview__title">Band plan image source</div>
            ${nudgePlanMarkup(event)}
          </div>
        </div>
        <div class="nudgePreviewActions">
          <button class="pillBtn" type="button" data-nudge-copy="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">content_copy</span><span>Copy text</span></button>
          <button class="pillBtn" type="button" data-nudge-plan="${escapeHtml(event.event_id)}"><span class="material-symbols-outlined">download</span><span>Download plan PNG</span></button>
          <span class="muted">WhatsApp Web cannot reliably auto-attach an image to a group. Download the PNG, then attach it manually if wanted.</span>
        </div>
      </details>
    </article>`;
  }).join('');
}
async function copyNudgeMessage(eventId, openWhatsApp = false, showAlert = true){
  const event = (state.events || []).find(e => String(e.event_id) === String(eventId));
  if(!event) return;
  const tone = $('nudgeToneSelect')?.value || 'reminder';
  const msg = buildNudgeMessage(event, tone);
  try{ await navigator.clipboard.writeText(msg); }catch(_e){}
  if(openWhatsApp) window.open('https://web.whatsapp.com/', '_blank', 'noopener');
  if(showAlert) alert(openWhatsApp ? 'Message copied. WhatsApp Web is opening — paste into the band group and send. Attach the plan PNG manually if you want the picture included.' : 'Message copied to clipboard.');
}
function renderHome(){
  if(isPublicEventRoute()){
    syncHomeRouteMode(true);
    renderPublicEventPage();
    return;
  }
  syncHomeRouteMode(false);
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
  renderBandNoticeboard();
  renderStrength();
  populateStageEventSelect();
}

function ensureBandNoticeboardHost(){
  let host = $("bandNoticeboard");
  if(host) return host;
  const home = $("view-home");
  if(!home) return null;
  const section = document.createElement('section');
  section.className = 'card';
  section.id = 'bandNoticeboard';
  home.appendChild(section);
  return section;
}
function renderBandNoticeboard(){
  const host = ensureBandNoticeboardHost();
  if(!host) return;
  const count = commentsForTarget('band', 'band_main').length;
  host.innerHTML = `<div class="sectionHead"><div><div class="label">Band comments</div><h2>Band noticeboard</h2><div class="muted">General comments for the whole band. Guests can join in too.</div></div><div class="noticeboardSummary"><span class="material-symbols-outlined">forum</span><span>${count === 1 ? '1 comment' : `${count} comments`}</span></div></div>${renderCommentBlock('band', 'band_main', 'Latest comments')}`;
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

  if(!state.session.login_key){
    if(existing && snapshot){ existing.status = snapshot.status; existing.comment = snapshot.comment; }
    else state.rsvp = state.rsvp.filter(r => !(String(r.event_id) === String(eventId) && String(r.member_id) === String(state.session.member_id)));
    return { ok:false, message:"Missing login key in session." };
  }

  const result = await saveRsvpResponse({
    event_id:eventId,
    member_id:state.session.member_id,
    login_key:state.session.login_key,
    status,
    comment:note
  });

  if(!result.ok){
    if(existing && snapshot){ existing.status = snapshot.status; existing.comment = snapshot.comment; }
    else state.rsvp = state.rsvp.filter(r => !(String(r.event_id) === String(eventId) && String(r.member_id) === String(state.session.member_id)));
  } else {
    const target = state.rsvp.find(r => String(r.event_id) === String(eventId) && String(r.member_id) === String(state.session.member_id));
    if(target){
      target.status = status;
      target.comment = note;
      target.updated_at = new Date().toISOString();
      target.timestamp = target.updated_at;
    }
  }
  return result;
}

function bindHomeDelegates(){
  document.addEventListener("change", (ev) => {
    const prettyToggle = ev.target.closest('[data-stage-pretty-toggle]');
    if(prettyToggle){
      const eventId = prettyToggle.dataset.stagePrettyToggle || '';
      setInlineStagePreviewMode(eventId, prettyToggle.checked ? 'pretty' : 'compact');
      return;
    }

    const bandCheck = ev.target.closest(".heroBandCheck");
    if(bandCheck && !currentMember()){
      const selected = Array.from(document.querySelectorAll(".heroBandCheck:checked")).map(el => el.dataset.bandType).filter(Boolean);
      if(!selected.length){
        bandCheck.checked = true;
        return;
      }
      saveGuestBandFilter(selected);
      renderHome();
      if(document.querySelector("#view-availability.active")) renderAvailabilityView();
      if(document.querySelector("#view-stage.active")) renderStage();
      if(document.querySelector("#view-planner.active")) renderMatrixHome();
  renderPlanner();
      return;
    }
  });

  document.addEventListener("click", async (ev) => {
    const loginBtn = ev.target.closest(".loginPromptBtn");
    if(loginBtn){ $("loginDialog").showModal(); return; }

    const commentToggle = ev.target.closest('[data-comment-toggle="1"]');
    if(commentToggle){
      const list = commentToggle.closest('[data-comment-list]');
      if(list){
        list.dataset.expanded = list.dataset.expanded === '1' ? '0' : '1';
        refreshCommentBlocks();
      }
      return;
    }

    const commentTag = ev.target.closest('.commentTagBtn');
    if(commentTag){
      const composer = commentTag.closest('[data-comment-composer]');
      const textarea = composer?.querySelector('.commentTextarea');
      const label = commentTag.textContent.trim();
      commentTag.classList.toggle('is-active');
      if(textarea && !textarea.value.trim()) textarea.value = label + ' – ';
      return;
    }

    const saveCommentBtn = ev.target.closest('[data-save-comment="1"]');
    if(saveCommentBtn){
      const targetType = saveCommentBtn.dataset.targetType || '';
      const targetId = saveCommentBtn.dataset.targetId || '';
      const eventId = saveCommentBtn.dataset.eventId || '';
      const pieceId = saveCommentBtn.dataset.pieceId || '';
      const composer = saveCommentBtn.closest('[data-comment-composer]');
      const textArea = composer?.querySelector('.commentTextarea');
      const msgId = `comment-msg-${targetType}-${targetId.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
      const msg = $(msgId);
      const selectedTags = Array.from(composer?.querySelectorAll('.commentTagBtn.is-active') || []).map(el => (el.dataset.commentTag || '').trim()).filter(Boolean);
      const payload = {
        target_type: targetType,
        target_id: targetId,
        event_id: eventId,
        piece_id: pieceId,
        comment_text: textArea?.value.trim() || '',
        tag_1: selectedTags[0] || '',
        tag_2: selectedTags[1] || ''
      };
      if(state.session){
        payload.author_type = 'member';
        payload.member_id = state.session.member_id;
        payload.login_key = state.session.login_key;
      }else{
        payload.author_type = 'guest';
        payload.guest_nickname = composer?.querySelector('[data-guest-nickname-for]')?.value.trim() || '';
        payload.guest_email = composer?.querySelector('[data-guest-email-for]')?.value.trim() || '';
      }
      if(msg) msg.textContent = 'Saving comment...';
      const result = await persistComment(payload);
      if(result.ok){
        if(textArea) textArea.value = '';
        composer?.querySelectorAll('.commentTagBtn').forEach(el => el.classList.remove('is-active'));
        if(!state.session){
          const nick = composer?.querySelector('[data-guest-nickname-for]');
          const email = composer?.querySelector('[data-guest-email-for]');
          if(nick) nick.value = '';
          if(email) email.value = '';
        }
        if(msg) msg.textContent = 'Comment posted.';
      }else{
        if(msg) msg.textContent = result.message || 'Unable to save comment.';
      }
      return;
    }

    const respBtn = ev.target.closest(".responseMini");
    if(respBtn){
      if(!state.session){ $("loginDialog").showModal(); return; }
      const { responseEvent, status } = respBtn.dataset;
      const msg = $(`save-msg-${responseEvent}`);
      document.querySelectorAll(`.responseMini[data-response-event="${CSS.escape(responseEvent)}"]`).forEach(btn => btn.classList.toggle("active", btn.dataset.status === status));
      if(msg) msg.textContent = "Saving…";
      respBtn.disabled = true;
      try {
        const result = await persistRsvp(responseEvent, status || "");
        if(msg) msg.textContent = result.ok ? `Saved response: ${labelForStatus(status || "")}` : `Save failed: ${result.message || result.error || "Unknown error"}`;
        renderHome();
        const dlg = $("loginDialog"); if(dlg?.open) dlg.close();
        if(document.querySelector("#view-stage.active")) renderStage();
        if(DEBUG) renderDebugPanel(state);
      } finally {
        respBtn.disabled = false;
      }
      return;
    }

    const openCommentBtn = ev.target.closest('[data-open-comment]');
    if(openCommentBtn){
      const eventId = openCommentBtn.dataset.openComment || '';
      const card = openCommentBtn.closest('.eventCard');
      const details = card?.querySelector('.cardDetails');
      if(details){
        details.open = true;
        details.scrollIntoView({ behavior:'smooth', block:'nearest' });
        setTimeout(() => {
          const textarea = details.querySelector(`[data-comment-text-for="event|${CSS.escape(eventId)}"]`);
          textarea?.focus();
        }, 160);
      }
      return;
    }

    const prettyToggle = ev.target.closest('[data-stage-pretty-toggle]');
    if(prettyToggle){
      const eventId = prettyToggle.dataset.stagePrettyToggle || '';
      setInlineStagePreviewMode(eventId, prettyToggle.checked ? 'pretty' : 'compact');
      return;
    }

    const showcaseTab = ev.target.closest('[data-showcase-view-tab]');
    if(showcaseTab){
      const eventId = showcaseTab.dataset.showcaseViewTab || '';
      const view = showcaseTab.dataset.view || 'plan';
      const root = showcaseTab.closest('.eventShowcase__bandGraphicWrap');
      if(root){
        root.querySelectorAll('[data-showcase-view-tab]').forEach(btn => {
          const active = btn === showcaseTab;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        root.querySelectorAll(`[data-showcase-view-panel="${CSS.escape(String(eventId))}"]`).forEach(panel => {
          panel.classList.toggle('is-active', panel.dataset.view === view);
        });
      }
      return;
    }

    const showcasePrettyToggle = ev.target.closest('[data-showcase-pretty-toggle]');
    if(showcasePrettyToggle){
      const eventId = showcasePrettyToggle.dataset.showcasePrettyToggle || '';
      const root = showcasePrettyToggle.closest('.eventShowcase__swimlaneWrap');
      if(root){
        const compact = root.querySelector(`[data-showcase-swimlane-compact="${CSS.escape(String(eventId))}"]`);
        const pretty = root.querySelector(`[data-showcase-swimlane-pretty="${CSS.escape(String(eventId))}"]`);
        const active = !!showcasePrettyToggle.checked;
        if(compact) compact.classList.toggle('is-hidden', active);
        if(pretty) pretty.classList.toggle('is-active', active);
      }
      return;
    }

    const openStageBtn = ev.target.closest(".openStageBtn");
    if(openStageBtn){
      openStageForEvent(openStageBtn.dataset.openStage || "", "plan");
      return;
    }

    const detailsBtn = ev.target.closest(".inlineAlertDetailsBtn, .inlineAlertDetailsLink, .eventShowcase__detailsBtn, [data-open-details]");
    if(detailsBtn){
      const card = detailsBtn.closest('.eventCard');
      const details = card?.querySelector('.cardDetails');
      if(details){
        details.open = !details.open || detailsBtn.matches(".inlineAlertDetailsBtn, .inlineAlertDetailsLink");
        details.scrollIntoView({ behavior:'smooth', block:'nearest' });
      }
      return;
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
        const dlg = $("loginDialog");
        if (dlg && dlg.open) dlg.close();
    state.session = Auth.loadUser();
    updateGreeting();
    setInterval(updateGreeting, 30000);
    box.className = "loginResult";
    box.innerHTML = `Welcome <strong>${escapeHtml(member.first_name || member.display_name || "Member")}</strong> (${escapeHtml(member.member_id)})`;
    renderHome();
    renderMatrixHome();
  renderPlanner();
    if(document.querySelector("#view-availability.active")) renderAvailabilityView();
    if(document.querySelector("#view-availability.active")) renderAvailabilityView();
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
  const homeTimelineInclude = $("homeTimelineIncludeRehearsalsToggle");
  const plannerTimelineInclude = $("plannerTimelineIncludeRehearsalsToggle");
  const aboutBtn = $("aboutBtn");
  if (menuBtn) menuBtn.addEventListener("click", openMenu);
  if (aboutBtn) aboutBtn.addEventListener("click", () => { renderAboutContent(); $("aboutDialog")?.showModal(); closeMenu(); });
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
  document.addEventListener("click", (e) => {
    if(e.target.closest('[data-stop-open="1"]')) e.stopPropagation();
  });
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
    [homeTimelineInclude, plannerTimelineInclude].filter(Boolean).forEach(box => {
      box.checked = !state.ignoreRehearsals;
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
    setStageMode(btn.dataset.stageMode || "graphic");
    renderStage();
  }));
if(plannerIgnore){
  plannerIgnore.checked = state.ignoreRehearsals;
  plannerIgnore.addEventListener("change", () => {
    state.ignoreRehearsals = plannerIgnore.checked;
    if(homePlannerIgnore) homePlannerIgnore.checked = state.ignoreRehearsals;
    if(homeTimelineInclude) homeTimelineInclude.checked = !state.ignoreRehearsals;
    if(plannerTimelineInclude) plannerTimelineInclude.checked = !state.ignoreRehearsals;
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
    if(homeTimelineInclude) homeTimelineInclude.checked = !state.ignoreRehearsals;
    if(plannerTimelineInclude) plannerTimelineInclude.checked = !state.ignoreRehearsals;
    try{ localStorage.setItem("bbhub.ignoreRehearsals", state.ignoreRehearsals ? "1" : "0"); }catch(_e){}
    renderMatrixHome();
  renderPlanner();
    renderHome();
    if(document.querySelector("#view-stage.active")) renderStage();
  });
}

if(homeTimelineInclude){
  homeTimelineInclude.checked = !state.ignoreRehearsals;
  homeTimelineInclude.addEventListener("change", () => {
    state.ignoreRehearsals = !homeTimelineInclude.checked;
    if(plannerTimelineInclude) plannerTimelineInclude.checked = homeTimelineInclude.checked;
    if(plannerIgnore) plannerIgnore.checked = state.ignoreRehearsals;
    if(homePlannerIgnore) homePlannerIgnore.checked = state.ignoreRehearsals;
    try{ localStorage.setItem("bbhub.ignoreRehearsals", state.ignoreRehearsals ? "1" : "0"); }catch(_e){}
    renderMatrixHome();
    renderPlanner();
    renderHome();
    if(document.querySelector("#view-stage.active")) renderStage();
  });
}
if(plannerTimelineInclude){
  plannerTimelineInclude.checked = !state.ignoreRehearsals;
  plannerTimelineInclude.addEventListener("change", () => {
    state.ignoreRehearsals = !plannerTimelineInclude.checked;
    if(homeTimelineInclude) homeTimelineInclude.checked = plannerTimelineInclude.checked;
    if(plannerIgnore) plannerIgnore.checked = state.ignoreRehearsals;
    if(homePlannerIgnore) homePlannerIgnore.checked = state.ignoreRehearsals;
    try{ localStorage.setItem("bbhub.ignoreRehearsals", state.ignoreRehearsals ? "1" : "0"); }catch(_e){}
    renderMatrixHome();
    renderPlanner();
    renderHome();
    if(document.querySelector("#view-stage.active")) renderStage();
  });
}

}

async function start(){
  showLoading();
  const t0 = performance.now();
  const timings = {
    startedAt: new Date().toISOString(),
    authMs: 0,
    loadDataMs: 0,
    statePrepMs: 0,
    renderHomeMs: 0,
    totalMs: 0
  };
  try{
    const tAuth0 = performance.now();
    state.session = Auth.loadUser();
    timings.authMs = Math.round(performance.now() - tAuth0);
    updateGreeting();
    setInterval(updateGreeting, 30000);

    const tLoad0 = performance.now();
    const data = await loadData();
    timings.loadDataMs = Math.round(performance.now() - tLoad0);

    const tPrep0 = performance.now();
    state.source = data.source || "unknown";
    state.members = data.members || [];
    state.rawEvents = data.rawEvents || [];
    state.events = (data.events || []).map(normalizeEvent);
    state.program = data.program || [];
    state.pieces = data.pieces || [];
    state.rsvp = data.rsvp || [];
    state.comments = data.comments || [];
    state.bandChairs = data.bandChairs || [];
    state.assignments = data.assignments || [];
    state.bands = data.bands || [];
    timings.statePrepMs = Math.round(performance.now() - tPrep0);

    updateSummary();
    const tRender0 = performance.now();
    renderHome();
    if(state.route.view === "dashboard") switchView("dashboard");
    if(state.route.view === "availability") switchView("availability");
    timings.renderHomeMs = Math.round(performance.now() - tRender0);
    timings.totalMs = Math.round(performance.now() - t0);
    state.debugTimings = timings;

    setStatus(`Loaded (${state.source}) in ${(timings.totalMs / 1000).toFixed(2)}s — ${new Date().toLocaleString()}`);
    if(DEBUG) renderDebugPanel(state);
    console.log("BBHub timings", timings);

    setInterval(() => {
      renderHome();
      if(document.querySelector("#view-availability.active")) renderAvailabilityView();
      if(document.querySelector("#view-stage.active")) renderStage();
      if(DEBUG) renderDebugPanel(state);
    }, 60000);

  } catch(err){
    state.debugTimings = { ...timings, totalMs: Math.round(performance.now() - t0), error: err?.message || String(err) };
    if(DEBUG) renderDebugPanel(state);
    setStatus(`Load failed: ${err.message}`);
  } finally {
    requestAnimationFrame(() => hideLoading());
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initTextSizeControls();
  setupApiDebugPanel();
  bindControls();
  bindLoginUi();
  bindHomeDelegates();

  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-availability-save]");
    if(!btn) return;
    const eventId = btn.dataset.availabilitySave;
    const memberId = btn.dataset.memberId;
    const status = btn.dataset.status;
    const card = btn.closest('.availabilityCard');
    const previous = rsvpForAnyMember(eventId, memberId);
    const previousStatus = canonicalRsvpStatus(previous);
    const rsvpSnapshot = (state.rsvp || []).map(r => ({ ...r }));

    // Optimistic local update: update the source array first, then redraw the availability screen from that source.
    // This deliberately does NOT depend on the member being assigned to a chair.
    upsertLocalAvailabilityRsvp(eventId, memberId, status);
    renderAvailabilityView();
    updateAvailabilityCardUI(eventId, status, { pending:true });
    const pendingCard = document.querySelector(`[data-availability-card="${(window.CSS && CSS.escape) ? CSS.escape(String(eventId)) : String(eventId).replace(/"/g, '\"')}"]`);
    pendingCard?.querySelectorAll('.availabilityBtn').forEach(b => b.disabled = true);

    const result = await persistAvailabilityRsvp(eventId, memberId, status);
    if(result.ok){
      upsertLocalAvailabilityRsvp(eventId, memberId, status);
      renderAvailabilityView();
      updateAvailabilityCardUI(eventId, status, { pending:false, saved:true, message:`Saved ✓ ${availabilityStatusLabel(status)}` });
      const savedCard = document.querySelector(`[data-availability-card="${(window.CSS && CSS.escape) ? CSS.escape(String(eventId)) : String(eventId).replace(/"/g, '\"')}"]`);
      savedCard?.querySelectorAll('.availabilityBtn').forEach(b => b.disabled = false);
      setTimeout(() => {
        const msg = savedCard?.querySelector('.availabilityMsg');
        if(msg && msg.classList.contains('is-saved')){
          msg.classList.remove('is-saved');
          msg.textContent = 'Tap once to save.';
        }
      }, 1800);
      if(document.querySelector("#view-stage.active")) renderStage();
    }else{
      state.rsvp = rsvpSnapshot;
      renderAvailabilityView();
      updateAvailabilityCardUI(eventId, previousStatus, { pending:false, error:true, message: result.message || "Save failed — tap again." });
      const errorCard = document.querySelector(`[data-availability-card="${(window.CSS && CSS.escape) ? CSS.escape(String(eventId)) : String(eventId).replace(/"/g, '\"')}"]`);
      errorCard?.querySelectorAll('.availabilityBtn').forEach(b => b.disabled = false);
    }
  });
  document.addEventListener("click", (ev) => {
    const toggle = ev.target.closest("[data-nudge-toggle]");
    const copy = ev.target.closest("[data-nudge-copy]");
    const plan = ev.target.closest("[data-nudge-plan]");
    const go = ev.target.closest("[data-nudge-go]");
    if(toggle){
      const details = document.querySelector(`[data-nudge-details="${CSS.escape(toggle.dataset.nudgeToggle)}"]`);
      if(details) details.open = !details.open;
    }
    if(copy) copyNudgeMessage(copy.dataset.nudgeCopy, false, true);
    if(plan) exportNudgePlanImage(plan.dataset.nudgePlan);
    if(go) copyNudgeMessage(go.dataset.nudgeGo, true, true);
  });
  $("nudgeToneSelect")?.addEventListener("change", renderNudgeDashboard);
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






function upgradeStageTablesToSeatBoard(root){
  root = root || document;
  const tables = root.querySelectorAll('.stageMatrix table, .swimlaneTable, .stageSwimlane table, table.stageTable');
  tables.forEach(table => {
    if(table.dataset.v21Done === '1') return;
    const rows = Array.from(table.querySelectorAll('tr'));
    const groups = [];
    rows.forEach(tr => {
      const cells = Array.from(tr.children);
      if(cells.length < 2) return;
      const section = (cells[0].innerText || "").trim();
      if(!section) return;
      const chairs = [];
      for(let i=1;i<cells.length;i++){
        const txt = (cells[i].innerText || "").trim();
        if(!txt) continue;
        const lines = txt.split(/\n+/).map(s => s.trim()).filter(Boolean);
        if(!lines.length) continue;
        const chair = lines[0] || "";
        const player = lines[1] || "Vacant";
        const instrument = lines[2] || section;
        chairs.push({chair, player, instrument});
      }
      if(chairs.length) groups.push({section, chairs});
    });
    if(!groups.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'seatBoard';
    wrap.innerHTML = groups.map(g => {
      const filled = g.chairs.filter(c => !/^vacant$/i.test(c.player)).length;
      const needs = filled < g.chairs.length;
      return `
        <section class="seatLane ${needs ? 'seatLane--needs' : ''}">
          <div class="seatLane__title">${escapeHtml(g.section)} <span class="seatLane__count">${filled}/${g.chairs.length} filled</span></div>
          <div class="seatLane__grid">
            ${g.chairs.map(c => `
              <article class="seatCard ${bbhubSeatSectionClass(g.section, c.instrument)} ${/^vacant$/i.test(c.player) ? 'seatCard--vacant' : 'seatCard--filled'}">
                <div class="seatCard__code">${escapeHtml(c.chair)}</div>
                <div class="seatCard__player">${/^vacant$/i.test(c.player) ? 'Vacant' : escapeHtml(c.player)}</div>
                <div class="seatCard__instrument">${escapeHtml(c.instrument)}</div>
              </article>
            `).join('')}
          </div>
        </section>
      `;
    }).join('');
    table.dataset.v21Done = '1';
    table.parentNode.insertBefore(wrap, table);
    table.style.display = 'none';
  });
}

document.addEventListener('click', function(){
  setTimeout(() => upgradeStageTablesToSeatBoard(document), 0);
});
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(() => upgradeStageTablesToSeatBoard(document), 100);
});


function renderEventCommentsPreview(eventId, comments){
  if(!comments || !comments.length) return "";

  const rows = comments
    .filter(c => c.event_id === eventId)
    .sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));

  if(!rows.length) return "";

  const preview = rows.slice(0,3);

  return `
    <div class="eventCommentsPreview">
      <div class="eventCommentsPreview__title">
        Latest comments (${preview.length}/${rows.length}) ▼
      </div>
      <div class="eventCommentsPreview__list">
        ${preview.map(r=>`
          <div class="eventCommentsPreview__row">
            <span>${timeAgoShort(new Date(r.timestamp))}</span>
            <span>${escapeHtml(r.display_name||"")}</span>
            <span>${escapeHtml(r.comment||"")}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}


