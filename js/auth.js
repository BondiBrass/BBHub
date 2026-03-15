
const KEY="bbhub_user";
export function loadUser(){ try{ return JSON.parse(localStorage.getItem(KEY)||"null"); }catch(_){ return null; } }
export function saveUser(u){ localStorage.setItem(KEY, JSON.stringify(u)); }
export function clearUser(){ localStorage.removeItem(KEY); }
export function findByLoginKey(members, loginKey){
  const k = String(loginKey || "").trim().toLowerCase();
  return (members || []).find(m => String(m.login_key || "").trim().toLowerCase() === k) || null;
}
