export function fmtDateTime(d){
  if(!d) return "n/a";
  return d.toLocaleString(undefined,{
    weekday:"short", year:"numeric", month:"short", day:"numeric",
    hour:"2-digit", minute:"2-digit"
  });
}
export function fromNowLabel(d){
  if(!d) return "invalid";
  const ms = d - new Date();
  if(ms < 0) return "past";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / (60 * 24));
  const hrs = Math.floor((mins % (60 * 24)) / 60);
  const m = mins % 60;
  return `${days}d ${hrs}h ${m}m`;
}
export function compactFromNowLabel(d){
  if(!d) return "invalid";
  const ms = d - new Date();
  if(ms < 0) return "past";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / (60 * 24));
  const hrs = Math.floor((mins % (60 * 24)) / 60);
  const m = mins % 60;
  if(days > 0) return `${days}d:${hrs}h:${m}m`;
  if(hrs > 0) return `${hrs}h:${m}m`;
  return `${m}m`;
}
export function formatEventDateParts(eventDate, startTime, endTime, endDate = eventDate){
  const dateStr = String(eventDate || "").trim();
  const endDateStr = String(endDate || eventDate || "").trim();
  const startStr = String(startTime || "").trim();
  const endStr = String(endTime || "").trim();
  if(!dateStr) return { dayLabel:"", dateLabel:"", timeLabel:[startStr, endStr].filter(Boolean).join("–") };
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const weekday = dt.toLocaleDateString(undefined, { weekday:"long" });
  const dateLabel = `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  let timeLabel = [startStr, endStr].filter(Boolean).join("–");
  if(endStr && endDateStr && endDateStr !== dateStr){
    timeLabel = `${startStr} – ${endDateStr} ${endStr}`;
  }
  return {
    dayLabel: weekday,
    dateLabel,
    timeLabel
  };
}
export function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
