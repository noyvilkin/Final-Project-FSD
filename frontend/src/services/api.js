const API_BASE = "http://localhost:5173"; 

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("token");

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : "",
    },
  });

  if (res.status === 401) {
    // פה בעתיד נוסיף refresh token
    console.log("Unauthorized - need refresh token");
  }

  return res;
}