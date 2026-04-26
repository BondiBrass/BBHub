
const KEY="bbhub_user";
export function loadUser(){ try{ return JSON.parse(localStorage.getItem(KEY)||"null"); }catch(_){ return null; } }
export function saveUser(u){ localStorage.setItem(KEY, JSON.stringify(u)); }
export function clearUser(){ localStorage.removeItem(KEY); }
export function findByLoginKey(members, loginKey){
  const k = String(loginKey || "").trim().toLowerCase();
  return (members || []).find(m => String(m.login_key || "").trim().toLowerCase() === k) || null;
}


let fontScale = parseFloat(localStorage.getItem("bbhub_font_scale")) || 1;

function applyFontScale() {
  document.documentElement.style.setProperty('--font-scale', fontScale);
  const lbl = document.getElementById("fontLabel");
  if (lbl) lbl.innerText = Math.round(fontScale*100)+"%";
}

function updateReadableLayout(){
  // optional hook for future adjustments; currently forces reflow for consistency
  document.body.offsetHeight;
}


function saveAndApply() {
  localStorage.setItem("bbhub_font_scale", fontScale);
  applyFontScale();
updateReadableLayout();
}

document.addEventListener("DOMContentLoaded", ()=>{
  applyFontScale();
updateReadableLayout();
  const plus = document.getElementById("fontPlus");
  const minus = document.getElementById("fontMinus");
  const reset = document.getElementById("fontReset");

  if (plus) plus.onclick = ()=>{ fontScale = Math.min(fontScale+0.1,2); saveAndApply(); };
  if (minus) minus.onclick = ()=>{ fontScale = Math.max(fontScale-0.1,0.8); saveAndApply(); };
  if (reset) reset.onclick = ()=>{ fontScale = 1; saveAndApply(); };
});
