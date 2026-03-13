const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Request failed: ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export function uploadAssignment({ assignmentFiles, userId, notes }) {
  const formData = new FormData();

  assignmentFiles.forEach((file) => {
    formData.append("assignments", file);
  });

  if (typeof notes === "string" && notes.trim()) {
    formData.append("notes", notes.trim());
  }

  return request("/api/uploads", {
    method: "POST",
    headers: userId ? { "x-user-id": userId } : undefined,
    body: formData,
  });
}

export function getAssignment(assignmentId) {
  return request(`/api/assignments/${assignmentId}`);
}

export function getAssignmentResults(assignmentId, format = "summary") {
  return request(`/api/assignments/${assignmentId}/results?format=${format}`);
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
};
