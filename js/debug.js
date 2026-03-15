import { fromNowLabel, escapeHtml } from "./utils.js";

export const DEBUG = new URLSearchParams(window.location.search).get("debug") === "true";

function pad2(v) { return String(v).padStart(2, "0"); }

export function normalizeSheetDate(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (m) return m[1];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  return s;
}

export function normalizeSheetTime(value) {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [hh, mm] = s.split(":");
    return `${pad2(hh)}:${mm}`;
  }
  let m = s.match(/^\d{4}-\d{2}-\d{2}[T\s](\d{1,2}):(\d{2})/);
  if (m) return `${pad2(m[1])}:${m[2]}`;
  m = s.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  m = s.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (m) {
    let hh = Number(m[1]);
    const mm = m[2];
    const ap = m[3].toLowerCase();
    if (ap === 'pm' && hh !== 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    return `${pad2(hh)}:${mm}`;
  }
  m = s.match(/^(\d{1,2})\s*([ap]m)$/i);
  if (m) {
    let hh = Number(m[1]);
    const ap = m[2].toLowerCase();
    if (ap === 'pm' && hh !== 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    return `${pad2(hh)}:00`;
  }
  return s;
}

export function splitDateTime(value) {
  if (!value) return { date: "", time: "" };
  const s = String(value).trim();
  let m = s.match(/^(\d{4}-\d{1,2}-\d{1,2})[T\s](\d{1,2}:\d{2})(?::\d{2})?$/);
  if (m) return { date: normalizeSheetDate(m[1]), time: normalizeSheetTime(m[2]) };
  m = s.match(/^(\d{1,2}\/\d{1,2}\/\d{4})[T\s](\d{1,2}:\d{2})(?::\d{2})?$/);
  if (m) return { date: normalizeSheetDate(m[1]), time: normalizeSheetTime(m[2]) };
  return { date: normalizeSheetDate(s), time: normalizeSheetTime(s) };
}

export function combineDateTime(dateStr, timeStr) {
  const d = normalizeSheetDate(dateStr);
  const t = normalizeSheetTime(timeStr);
  if (!d) return "";
  if (!t) return `${d} 00:00:00`;
  return `${d} ${t}:00`;
}

export function parseLocalDateTime(dateStr, timeStr = "00:00") {
  const d = normalizeSheetDate(dateStr);
  const t = normalizeSheetTime(timeStr);
  if (!d) return null;
  const dp = d.split("-");
  if (dp.length !== 3) return null;
  const tm = t.match(/^(\d{1,2}):(\d{2})$/);
  const hh = tm ? Number(tm[1]) : 0;
  const mm = tm ? Number(tm[2]) : 0;
  return new Date(Number(dp[0]), Number(dp[1]) - 1, Number(dp[2]), hh, mm, 0, 0);
}

export function parseLocalDateTimeString(value) {
  const parts = splitDateTime(value);
  if (!parts.date) return null;
  return parseLocalDateTime(parts.date, parts.time || "00:00");
}

export function normalizeEvent(e) {
  const type = String(e.type || e.event_type || "").trim().toLowerCase();
  const startParts = splitDateTime(e.start_datetime || e.start || "");
  const endParts = splitDateTime(e.end_datetime || e.end || "");
  const date = startParts.date || normalizeSheetDate(e.date);
  const startTime = startParts.time || normalizeSheetTime(e.start_time);
  const endDate = endParts.date || date;
  const endTime = endParts.time || normalizeSheetTime(e.end_time);
  const start = combineDateTime(date, startTime);
  const end = combineDateTime(endDate, endTime);
  const parsed = parseLocalDateTime(date, startTime || "00:00");
  const parsedEnd = parseLocalDateTime(endDate, endTime || "00:00");
  return {
    ...e,
    event_id: e.event_id || e.id || "",
    title: e.title || e.event_name || e.name || "Untitled",
    type,
    date,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    start_datetime: start,
    end_datetime: end,
    start,
    end,
    parsed,
    parsedEnd,
    venue: e.venue || e.location || "",
    uniform: e.uniform || e.dress || "",
    map_url: e.map_url || "",
    notes: e.notes || ""
  };
}

export function findNext(events, wantedType) {
  const now = new Date();
  const wanted = String(wantedType || "").trim().toLowerCase();
  return (events || [])
    .map(normalizeEvent)
    .filter(e => e.parsed instanceof Date && !isNaN(e.parsed))
    .filter(e => e.type === wanted)
    .filter(e => e.parsed >= now)
    .sort((a,b) => a.parsed - b.parsed)[0] || null;
}

export function renderDebugPanel(state) {
  const host = document.getElementById("debugBox");
  if(!host) return;
  const future = (state.events || [])
    .map(normalizeEvent)
    .filter(e => e.parsed instanceof Date && !isNaN(e.parsed))
    .sort((a,b) => a.parsed - b.parsed);
  const nextGig = findNext(state.events, "gig");
  const nextReh = findNext(state.events, "rehearsal");
  host.innerHTML = `
    <div class="debugGrid">
      ${[
        ["Source", state.source || "unknown"],
        ["Members", state.members?.length || 0],
        ["Events", state.events?.length || 0],
        ["Program rows", state.program?.length || 0],
        ["Pieces", state.pieces?.length || 0],
        ["RSVP rows", state.rsvp?.length || 0]
      ].map(([k, v]) => `
        <div class="debugStat">
          <div class="debugLabel">${escapeHtml(k)}</div>
          <div class="debugVal">${escapeHtml(v)}</div>
        </div>
      `).join("")}
    </div>
    <div class="debugStat"><div class="debugLabel">Derived next gig</div><div class="debugVal mono">${nextGig ? `${escapeHtml(nextGig.event_id)} | ${escapeHtml(nextGig.title)} | ${escapeHtml(fromNowLabel(nextGig.parsed))}` : "not found"}</div></div>
    <div class="debugStat" style="margin-top:8px"><div class="debugLabel">Derived next rehearsal</div><div class="debugVal mono">${nextReh ? `${escapeHtml(nextReh.event_id)} | ${escapeHtml(nextReh.title)} | ${escapeHtml(fromNowLabel(nextReh.parsed))}` : "not found"}</div></div>
    <table class="debugTable">
      <thead><tr><th>id</th><th>type</th><th>title</th><th>start_datetime</th><th>end_datetime</th><th>parsed</th></tr></thead>
      <tbody>
        ${future.map(e => `<tr><td class="mono">${escapeHtml(e.event_id)}</td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.title)}</td><td class="mono">${escapeHtml(e.start_datetime)}</td><td class="mono">${escapeHtml(e.end_datetime)}</td><td class="mono">${escapeHtml(e.parsed.toLocaleString())}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}
