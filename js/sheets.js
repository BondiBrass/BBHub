import { BBHUB_CONFIG } from "./config.js";


const apiDebugLog = [];
const apiDebugListeners = new Set();

function redactDebugValue(key, value){
  if(key === "login_key"){
    const s = String(value || "");
    if(!s) return "";
    return s.length <= 2 ? "••" : `${s.slice(0,2)}••••`;
  }
  return value;
}

function sanitizeDebugPayload(payload){
  return Object.fromEntries(Object.entries(payload || {}).map(([k,v]) => [k, redactDebugValue(k, v)]));
}

function emitApiDebug(){
  const snapshot = apiDebugLog.slice();
  apiDebugListeners.forEach(fn => {
    try{ fn(snapshot); }catch(_e){}
  });
}

function pushApiDebug(entry){
  apiDebugLog.unshift({ id:`log_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, at:new Date().toISOString(), ...entry });
  if(apiDebugLog.length > 100) apiDebugLog.length = 100;
  emitApiDebug();
}

export function getApiDebugLog(){
  return apiDebugLog.slice();
}

export function clearApiDebugLog(){
  apiDebugLog.length = 0;
  emitApiDebug();
}

export function subscribeApiDebugLog(fn){
  if(typeof fn !== "function") return () => {};
  apiDebugListeners.add(fn);
  try{ fn(apiDebugLog.slice()); }catch(_e){}
  return () => apiDebugListeners.delete(fn);
}

const demo = {
  Bands: [
    {band_type:"main", band_label:"Main Brass Band", sort_order:1, colour:"gold"},
    {band_type:"bigband", band_label:"Big Band", sort_order:2, colour:"purple"}
  ],
  Members: [
    {member_id:"m001", first_name:"Roy", last_name:"Hill", display_name:"Roy Hill", login_key:"roy.hill", instrument:"Cornet", email:"roy@example.org", bands:"main|bigband"},
    {member_id:"m002", first_name:"Jess", last_name:"Lee", display_name:"Jess Lee", login_key:"jess.lee", instrument:"Cornet", email:"jess@example.org", bands:"main"},
    {member_id:"m003", first_name:"Sam", last_name:"Ng", display_name:"Sam Ng", login_key:"sam.ng", instrument:"Baritone", email:"sam@example.org"},
    {member_id:"m004", first_name:"Alex", last_name:"Tran", display_name:"Alex Tran", login_key:"alex.tran", instrument:"Soprano", email:"alex@example.org"},
    {member_id:"m005", first_name:"Sarah", last_name:"Pike", display_name:"Sarah Pike", login_key:"sarah.pike", instrument:"Horn", email:"sarah@example.org"},
    {member_id:"m006", first_name:"Dave", last_name:"Martin", display_name:"Dave Martin", login_key:"dave.martin", instrument:"Trombone", email:"dave@example.org"}
  ],
  Events: [
    {event_id:"e2026-03-15", event_type:"rehearsal", event_name:"Sunday Rehearsal", start_datetime:"2026-03-15 18:30", end_datetime:"2026-03-15 20:30", venue:"Bondi Pavilion", uniform:"Bring folder", map_url:"https://maps.google.com/?q=Bondi+Pavilion", notes:"Warm-up plus concert prep", program_id:"e2026-03-15"},
    {event_id:"e2026-03-22", event_type:"gig", event_name:"Bondi Brass at Marrickville Markets", start_datetime:"2026-03-22 12:00", end_datetime:"2026-03-22 14:00", venue:"Marrickville Markets", uniform:"Blue shirt", map_url:"https://maps.google.com/?q=Marrickville+Markets", notes:"Arrive 11:15", program_id:"e2026-03-22"},
    {event_id:"e2026-03-29", event_type:"rehearsal", event_name:"Sunday Rehearsal", start_datetime:"2026-03-29 18:30", end_datetime:"2026-03-29 20:30", venue:"Bondi Pavilion", uniform:"Bring folder", map_url:"https://maps.google.com/?q=Bondi+Pavilion", notes:"Street set run-through", program_id:"e2026-03-29"},
    {event_id:"e2026-04-04", event_type:"gig", event_name:"Stanmore Richard Gill Event", start_datetime:"2026-04-04 14:00", end_datetime:"2026-04-04 16:00", venue:"Stanmore Hall", uniform:"Concert black", map_url:"https://maps.google.com/?q=Stanmore+Hall", notes:"Large layout event", program_id:"e2026-04-04"}
  ],
  Program: [
    {program_id:"e2026-03-22", piece_order:1, piece_name:"Brass in Pocket", composer:"Hynde", arranger:""},
    {program_id:"e2026-03-22", piece_order:2, piece_name:"Middle of the Road", composer:"The Pretenders", arranger:""},
    {program_id:"e2026-03-22", piece_order:3, piece_name:"Birdland", composer:"Zawinul", arranger:""},
    {program_id:"e2026-03-15", piece_order:1, piece_name:"Rehearsal focus", composer:"", arranger:"Full market set plus endings"},
    {program_id:"e2026-04-04", piece_order:1, piece_name:"Fanfare", composer:"", arranger:"Opening with choir"}
  ],
  Pieces: [
    {piece_id:"p001", title:"Brass in Pocket", composer:"Hynde", arranger:""},
    {piece_id:"p002", title:"Birdland", composer:"Zawinul", arranger:""}
  ],
  RSVP: [
    {event_id:"e2026-03-22", member_id:"m001", status:"Y", comment:"All good"},
    {event_id:"e2026-03-22", member_id:"m002", status:"M", comment:"Might be late"},
    {event_id:"e2026-03-15", member_id:"m001", status:"Y", comment:""},
    {event_id:"e2026-03-29", member_id:"m001", status:"N", comment:"Away"},
    {event_id:"e2026-04-04", member_id:"m001", status:"Y", comment:"Happy to help"}
  ],
  BandChairs: [
    {chair_code:"COND", display_short:"Cond", chair_label:"Conductor", instrument:"Conductor", section:"Control", lane:"Conductor", default_x:500, default_y:60, order:1},
    {chair_code:"SOP", display_short:"Sop", chair_label:"Soprano Cornet", instrument:"Soprano Cornet", section:"Cornet", lane:"Cornet Front", default_x:430, default_y:170, order:10},
    {chair_code:"SC1", display_short:"SC1", chair_label:"Solo Cornet 1", instrument:"Solo Cornet 1", section:"Cornet", lane:"Cornet Front", default_x:500, default_y:170, order:20},
    {chair_code:"SC2", display_short:"SC2", chair_label:"Solo Cornet 2", instrument:"Solo Cornet 2", section:"Cornet", lane:"Cornet Front", default_x:570, default_y:170, order:30},
    {chair_code:"REP", display_short:"Rep", chair_label:"Repiano", instrument:"Repiano", section:"Cornet", lane:"Cornet Back", default_x:460, default_y:240, order:40},
    {chair_code:"2C1", display_short:"2C1", chair_label:"2nd Cornet 1", instrument:"2nd Cornet 1", section:"Cornet", lane:"Cornet Back", default_x:530, default_y:240, order:50},
    {chair_code:"H1", display_short:"H1", chair_label:"Horn 1", instrument:"Horn 1", section:"Horn", lane:"Horns", default_x:390, default_y:340, order:60},
    {chair_code:"H2", display_short:"H2", chair_label:"Horn 2", instrument:"Horn 2", section:"Horn", lane:"Horns", default_x:450, default_y:340, order:70},
    {chair_code:"BARI", display_short:"Bari", chair_label:"Baritone", instrument:"Baritone", section:"Euph/Baritone", lane:"Euphs & Baritones", default_x:560, default_y:340, order:80},
    {chair_code:"EUPH", display_short:"Euph", chair_label:"Euphonium", instrument:"Euphonium", section:"Euph/Baritone", lane:"Euphs & Baritones", default_x:620, default_y:340, order:90},
    {chair_code:"TB1", display_short:"Tb1", chair_label:"Trombone 1", instrument:"Trombone 1", section:"Trombone", lane:"Trombones", default_x:390, default_y:470, order:100},
    {chair_code:"TB2", display_short:"Tb2", chair_label:"Trombone 2", instrument:"Trombone 2", section:"Trombone", lane:"Trombones", default_x:460, default_y:470, order:110},
    {chair_code:"EBB", display_short:"Eb", chair_label:"Eb Bass", instrument:"Eb Bass", section:"Bass", lane:"Basses", default_x:560, default_y:480, order:120},
    {chair_code:"BBB", display_short:"Bb", chair_label:"Bb Bass", instrument:"Bb Bass", section:"Bass", lane:"Basses", default_x:630, default_y:480, order:130},
    {chair_code:"PERC1", display_short:"Perc", chair_label:"Percussion 1", instrument:"Percussion 1", section:"Percussion", lane:"Percussion", default_x:760, default_y:270, order:140}
  ],
  Assignments: [
    {event_id:"e2026-03-22", chair_code:"COND", member_id:"m001"},
    {event_id:"e2026-03-22", chair_code:"SOP", member_id:"m004"},
    {event_id:"e2026-03-22", chair_code:"SC1", member_id:"m002"},
    {event_id:"e2026-03-22", chair_code:"H1", member_id:"m005"},
    {event_id:"e2026-03-22", chair_code:"TB1", member_id:"m006"},
    {event_id:"e2026-03-22", chair_code:"BARI", member_id:"m003"},
    {event_id:"e2026-03-15", chair_code:"COND", member_id:"m001"},
    {event_id:"e2026-03-15", chair_code:"SC1", member_id:"m002"},
    {event_id:"e2026-03-15", chair_code:"H1", member_id:"m005"},
    {event_id:"e2026-03-29", chair_code:"COND", member_id:"m001"},
    {event_id:"e2026-04-04", chair_code:"COND", member_id:"m001"},
    {event_id:"e2026-04-04", chair_code:"SC1", member_id:"m002"},
    {event_id:"e2026-04-04", chair_code:"SC2", member_id:"m004"},
    {event_id:"e2026-04-04", chair_code:"H1", member_id:"m005"},
    {event_id:"e2026-04-04", chair_code:"TB1", member_id:"m006"},
    {event_id:"e2026-04-04", chair_code:"BARI", member_id:"m003"}
  ]
};

function getApiBase(){
  return (BBHUB_CONFIG.API_URL || "").trim();
}

export async function loadData(){
  const api = getApiBase();
  if(!api){
    return { source:"demo", members:demo.Members, rawEvents:demo.Events, events:demo.Events, program:demo.Program, pieces:demo.Pieces, rsvp:demo.RSVP, comments:[], bandChairs:demo.BandChairs, assignments:demo.Assignments, bands: demo.Bands };
  }
  const url = api.includes("?") ? `${api}&view=all` : `${api}?view=all`;
  const res = await fetch(url, { cache:"no-store" });
  if(!res.ok) throw new Error(`API failed (${res.status})`);
  const json = await res.json();
  console.log("API RESPONSE:", json);

  if(Object.prototype.hasOwnProperty.call(json, "ok")){
    if(!json.ok){
      throw new Error(json.error || "API returned error");
    }
  }

  const data = (json && typeof json === "object" && json.data && typeof json.data === "object") ? json.data : json;

  return {
    source:"api",
    members: data.Members || [],
    rawEvents: data.Events || [],
    events: data.Events || [],
    program: data.Program || [],
    pieces: data.Pieces || [],
    rsvp: data.RSVP || [],
    comments: data.Comments || [],
    bandChairs: data.BandChairs || data.Chairs || [],
    assignments: data.Assignments || [],
    bands: data.Bands || []
  };
}

export async function saveRsvpResponse(payload){
  const api = getApiBase();
  if(!api){
    return { ok:true, mode:"demo", message:"Saved locally in demo mode." };
  }

  const body = {
    action:"rsvp",
    ...payload
  };

  pushApiDebug({
    type:"request",
    endpoint: api,
    payload: sanitizeDebugPayload(body)
  });

  try{
    const formBody = new URLSearchParams();
    Object.entries(body).forEach(([k,v]) => {
      if(v === undefined || v === null) return;
      formBody.append(k, String(v));
    });

    const res = await fetch(api, {
      method:"POST",
      body: formBody
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}

    if(!res.ok){
      const message = json?.error || text || `HTTP ${res.status}`;
      pushApiDebug({ type:"response", channel:"form", ok:false, status:res.status, response: json || text || `HTTP ${res.status}` });
      pushApiDebug({ type:"error", ok:false, message });
      pushApiDebug({ type:"final", ok:false, message });
      return { ok:false, mode:"api", message };
    }

    pushApiDebug({ type:"response", channel:"form", ok:true, status:res.status, response: json || text || "OK" });

    const ok = json?.ok !== false && json?.success !== false && !json?.error;
    if(!ok){
      const message = json?.error || json?.message || text || "Save rejected by API";
      pushApiDebug({ type:"error", ok:false, message });
      pushApiDebug({ type:"final", ok:false, message });
      return { ok:false, mode:"api", message };
    }

    return { ok:true, mode:json?.mode || "api", message:json?.message || "Saved to server.", result: json || { ok:true } };
  }catch(err){
    const message = err?.message || String(err) || "Unable to save RSVP to server.";
    pushApiDebug({ type:"error", ok:false, message });
    pushApiDebug({ type:"final", ok:false, message });
    return { ok:false, mode:"api", message };
  }
}


export async function saveCommentResponse(payload){
  const api = getApiBase();
  if(!api){
    return { ok:true, mode:"demo", message:"Saved locally in demo mode." };
  }

  const body = {
    action:"comment",
    ...payload
  };

  pushApiDebug({
    type:"request",
    endpoint: api,
    payload: sanitizeDebugPayload(body)
  });

  try{
    const formBody = new URLSearchParams();
    Object.entries(body).forEach(([k,v]) => {
      if(v === undefined || v === null || v === "") return;
      formBody.append(k, String(v));
    });

    const res = await fetch(api, {
      method:"POST",
      body: formBody
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (_) {}

    if(!res.ok){
      const message = json?.error || text || `HTTP ${res.status}`;
      pushApiDebug({ type:"response", channel:"form", ok:false, status:res.status, response: json || text || `HTTP ${res.status}` });
      pushApiDebug({ type:"error", ok:false, message });
      pushApiDebug({ type:"final", ok:false, message });
      return { ok:false, mode:"api", message };
    }

    pushApiDebug({ type:"response", channel:"form", ok:true, status:res.status, response: json || text || "OK" });

    const ok = json?.ok !== false && json?.success !== false && !json?.error;
    if(!ok){
      const message = json?.error || json?.message || text || "Save rejected by API";
      pushApiDebug({ type:"error", ok:false, message });
      pushApiDebug({ type:"final", ok:false, message });
      return { ok:false, mode:"api", message };
    }

    return { ok:true, mode:json?.mode || "api", message:json?.message || "Saved to server.", result: json || { ok:true } };
  }catch(err){
    const message = err?.message || String(err) || "Unable to save comment to server.";
    pushApiDebug({ type:"error", ok:false, message });
    pushApiDebug({ type:"final", ok:false, message });
    return { ok:false, mode:"api", message };
  }
}
