import { BBHUB_CONFIG } from "./config.js";

const demo = {
  Members: [
    {member_id:"m001", first_name:"Roy", last_name:"Hill", display_name:"Roy Hill", login_key:"roy.hill", instrument:"Cornet", email:"roy@example.org"},
    {member_id:"m002", first_name:"Jess", last_name:"Lee", display_name:"Jess Lee", login_key:"jess.lee", instrument:"Cornet", email:"jess@example.org"},
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
    return { source:"demo", members:demo.Members, rawEvents:demo.Events, events:demo.Events, program:demo.Program, pieces:demo.Pieces, rsvp:demo.RSVP, bandChairs:demo.BandChairs, assignments:demo.Assignments };
  }
  const url = api.includes("?") ? `${api}&view=all` : `${api}?view=all`;
  const res = await fetch(url, { cache:"no-store" });
  if(!res.ok) throw new Error(`API failed (${res.status})`);
  const json = await res.json();
  return {
    source:"api",
    members: json.Members || [],
    rawEvents: json.Events || [],
    events: json.Events || [],
    program: json.Program || [],
    pieces: json.Pieces || [],
    rsvp: json.RSVP || [],
    bandChairs: json.BandChairs || [],
    assignments: json.Assignments || []
  };
}

export async function saveRsvpResponse(payload){
  const api = getApiBase();
  if(!api){
    return { ok:true, mode:"demo", message:"Saved locally in demo mode." };
  }

  const body = {
    action:"saveRsvp",
    mode:"saveRsvp",
    view:"saveRsvp",
    ...payload
  };

  let lastError = null;
  const attempts = [
    async () => {
      const res = await fetch(api, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(body)
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) {}
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return json || { ok:true, mode:"api-json", raw:text };
    },
    async () => {
      const form = new URLSearchParams();
      Object.entries(body).forEach(([k,v]) => form.set(k, String(v ?? "")));
      const res = await fetch(api, {
        method:"POST",
        headers:{ "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8" },
        body: form.toString()
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (_) {}
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return json || { ok:true, mode:"api-form", raw:text };
    }
  ];

  for(const attempt of attempts){
    try{
      const result = await attempt();
      const ok = result?.ok !== false && result?.success !== false && !result?.error;
      if(!ok) throw new Error(result?.error || result?.message || "Save rejected by API");
      return { ok:true, mode:result?.mode || "api", message:result?.message || "Saved to server.", result };
    }catch(err){
      lastError = err;
    }
  }

  return { ok:false, mode:"api", message:lastError?.message || "Unable to save RSVP to server." };
}
