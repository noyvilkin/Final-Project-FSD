import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = typeof handler === "function" ? handler : null;
}

function toApiError(error) {
  const message =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    "Request failed";

  const apiError = new Error(message);
  apiError.status = error?.response?.status ?? 0;
  apiError.payload = error?.response?.data ?? null;
  return apiError;
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  return {
    ...config,
    withCredentials: true,
    headers: {
      ...(config.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const shouldHandleAuth = !error?.config?.skipAuthHandling;

    if (status === 401 && shouldHandleAuth && unauthorizedHandler) {
      unauthorizedHandler();
    }

    return Promise.reject(toApiError(error));
  }
);

async function request(path, options = {}) {
  const response = await apiClient.request({
    url: path,
    ...options,
  });

  return response.data;
}

export function signUp(payload) {
  return request("/api/auth/signup", {
    method: "POST",
    data: payload,
    skipAuthHandling: true,
  });
}

export function login(payload) {
  return request("/api/auth/login", {
    method: "POST",
    data: payload,
    skipAuthHandling: true,
  });
}

export function googleLogin(idToken) {
  return request("/api/auth/google", {
    method: "POST",
    data: { idToken },
    skipAuthHandling: true,
  });
}

export function refresh() {
  return request("/api/auth/refresh", {
    method: "POST",
    skipAuthHandling: true,
  });
}

export function logout() {
  return request("/api/auth/logout", {
    method: "POST",
    skipAuthHandling: true,
  });
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
    data: formData,
  });
}

export function getAssignment(assignmentId) {
  return request(`/api/assignments/${assignmentId}`);
}

export function getAssignmentResults(assignmentId, format = "summary") {
  return request(`/api/assignments/${assignmentId}/results?format=${format}`);
}

export function getAssignmentHistory(userId, { limit = 20, offset = 0 } = {}) {
  return request(
    `/api/assignments/user/${encodeURIComponent(userId)}?limit=${limit}&offset=${offset}`
  );
}

export function deleteAssignment(assignmentId, userId) {
  return request(
    `/api/assignments/${assignmentId}?userId=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
}

export function uploadResume(file, userId) {
  const formData = new FormData();
  formData.append("resume", file);

  if (userId) {
    formData.append("userId", userId);
  }

  return request("/api/resume/upload", {
    method: "POST",
    data: formData,
  });
}

export function optimizeResume({ userId, jobDescriptionText }) {
  return request("/api/resume/optimize", {
    method: "POST",
    data: { userId, jobDescriptionText },
  });
}

export function getResumeScore({ userId, jobDescriptionText }) {
  return request("/api/resume/score", {
    method: "POST",
    data: { userId, jobDescriptionText },
  });
}

export function getOptimizationHistory(userId) {
  return request(`/api/resume/history?userId=${encodeURIComponent(userId)}`);
}

export function getOptimizationRun(runId, userId) {
  return request(
    `/api/resume/history/${runId}?userId=${encodeURIComponent(userId)}`
  );
}

export async function getOptimizationArtifact(
  runId,
  userId,
  acceptedBullets = []
) {
  try {
    const response = await apiClient.post(
      `/api/resume/history/${runId}/artifact`,
      { userId, acceptedBullets },
      {
        responseType: "text",
      }
    );

    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

function parseContentDispositionFilename(header) {
  if (!header) return null;
  // Prefer RFC 5987 (filename*=UTF-8''...) then fall back to plain filename="...".
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* fall through */
    }
  }
  const plain = header.match(/filename="?([^"]+)"?/i);
  return plain ? plain[1] : null;
}

export async function getOptimizationArtifactDocx(
  runId,
  userId,
  acceptedBullets = []
) {
  try {
    const response = await apiClient.post(
      `/api/resume/history/${runId}/artifact`,
      { userId, acceptedBullets, format: "docx" },
      {
        responseType: "blob",
      }
    );

    return {
      blob: response.data,
      fileName: parseContentDispositionFilename(
        response.headers?.["content-disposition"]
      ),
    };
  } catch (error) {
    // With responseType "blob", error bodies arrive as a Blob — read it so we
    // can surface the backend's message (e.g. the re-upload prompt).
    if (error?.payload instanceof Blob) {
      let parsed = null;
      try {
        parsed = JSON.parse(await error.payload.text());
      } catch {
        parsed = null;
      }
      if (parsed) {
        const apiError = new Error(parsed.error || error.message);
        apiError.status = error.status;
        apiError.code = parsed.code;
        throw apiError;
      }
    }
    throw error;
  }
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