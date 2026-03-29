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