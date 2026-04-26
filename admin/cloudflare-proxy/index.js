export default {
	async fetch(request) {
	  const url = "https://script.google.com/macros/s/AKfycbyKvIKKCgQYvv0fM6T4bX1hslKn3Xy4efkGSBm24pEmCZYPuRSqWt08TuwALkctJ-yJ/exec";
  
	  const corsHeaders = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type"
	  };
  
	  if (request.method === "OPTIONS") {
		return new Response(null, { headers: corsHeaders });
	  }
  
	  try {
		const response = await fetch(url, {
		  method: request.method,
		  headers: {
			"Content-Type": "application/json"
		  },
		  body: request.method === "POST" ? await request.text() : undefined
		});
  
		const text = await response.text();
  
		return new Response(text, {
		  status: response.status,
		  headers: {
			...corsHeaders,
			"Content-Type": "application/json"
		  }
		});
  
	  } catch (err) {
		return new Response(JSON.stringify({
		  ok: false,
		  error: err.message
		}), {
		  status: 500,
		  headers: {
			...corsHeaders,
			"Content-Type": "application/json"
		  }
		});
	  }
	}
  };

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
