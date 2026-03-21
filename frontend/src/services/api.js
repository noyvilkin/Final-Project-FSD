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

// ── Resume Upload (PDF → Professional DNA) ─────────────────────────

export function uploadResume(file, userId) {
  const formData = new FormData();
  formData.append("resume", file);
  if (userId) formData.append("userId", userId);

  return request("/api/resume/upload", {
    method: "POST",
    body: formData,
  });
}

// ── Resume Optimization ─────────────────────────────────────────────

export function optimizeResume({ userId, jobDescriptionText }) {
  return request("/api/resume/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, jobDescriptionText }),
  });
}

export function getResumeScore({ userId, jobDescriptionText }) {
  return request("/api/resume/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, jobDescriptionText }),
  });
}

// ── Optimization History ────────────────────────────────────────────

export function getOptimizationHistory(userId) {
  return request(`/api/resume/history?userId=${encodeURIComponent(userId)}`);
}

export function getOptimizationRun(runId, userId) {
  return request(
    `/api/resume/history/${runId}?userId=${encodeURIComponent(userId)}`
  );
}

export async function getOptimizationArtifact(runId, userId) {
  const response = await fetch(
    `${API_BASE_URL}/api/resume/history/${runId}/artifact?userId=${encodeURIComponent(userId)}`,
    { credentials: "include" }
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch artifact: ${response.status}`);
  }
  return response.text();
}

export function deleteOptimizationRun(runId, userId) {
  return request(
    `/api/resume/history/${runId}?userId=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
};
