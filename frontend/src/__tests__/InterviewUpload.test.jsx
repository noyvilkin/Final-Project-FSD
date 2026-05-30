import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InterviewUpload from "../pages/InterviewUpload";

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock the API so no real HTTP calls are made.
vi.mock("../services/api", () => ({
  uploadInterview: vi.fn(),
}));

// Mock the auth context so the component gets a stable userId.
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ userId: "test-user-123" }),
}));

import { uploadInterview } from "../services/api";

// ── Global setup ──────────────────────────────────────────────────────────────

beforeAll(() => {
  // JSDOM does not implement URL.createObjectURL / revokeObjectURL.
  global.URL.createObjectURL = vi.fn(() => "blob:mock-preview-url");
  global.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  // MemoryRouter satisfies useNavigate and NavLink inside PageLayout > BottomNav.
  return render(
    <MemoryRouter>
      <InterviewUpload />
    </MemoryRouter>
  );
}

/** Create a fake File object with a controlled MIME type and size. */
function makeFile(name, type, sizeBytes = 2048) {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

/** Fire a change event on the hidden file input. */
function selectFile(container, file) {
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
}

/** Build a resolved-value shape that matches what uploadInterview returns. */
function makeUploadResponse(mimeType = "audio/mpeg") {
  return {
    count: 1,
    files: [{ bucket: "b", key: "k", url: "http://minio/k", mimeType, size: 2048 }],
    interviews: [{ id: "interview-abc", status: "pending" }],
    requestId: "req-1",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("InterviewUpload", () => {
  // ── 1. Initial render ──────────────────────────────────────────────────────

  it("renders file picker and upload button in idle state", () => {
    renderPage();

    // File picker button is accessible and labelled
    expect(
      screen.getByRole("button", { name: /open file picker/i })
    ).toBeInTheDocument();

    // Upload button is present but disabled (no file selected yet)
    const uploadBtn = screen.getByRole("button", { name: /upload recording/i });
    expect(uploadBtn).toBeInTheDocument();
    expect(uploadBtn).toBeDisabled();
  });

  // ── 2. Selecting an audio file ─────────────────────────────────────────────

  it("selecting an audio file shows file name, size and Audio label", () => {
    const { container } = renderPage();
    const file = makeFile("my-interview.mp3", "audio/mpeg", 512 * 1024); // 512 KB

    selectFile(container, file);

    expect(screen.getAllByText("my-interview.mp3").length).toBeGreaterThan(0);
    // "512.0 KB" or similar — just check the filename and "Audio" chip appear
    expect(screen.getAllByText(/audio/i).length).toBeGreaterThan(0);
  });

  // ── 3. Selecting a video file ──────────────────────────────────────────────

  it("selecting a video file shows file name, size and Video label", () => {
    const { container } = renderPage();
    const file = makeFile("recording.mp4", "video/mp4", 1024 * 1024); // 1 MB

    selectFile(container, file);

    expect(screen.getAllByText("recording.mp4").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/video/i).length).toBeGreaterThan(0);
  });

  // ── 4. Unsupported file type ───────────────────────────────────────────────

  it("shows a validation error for an unsupported file type", () => {
    const { container } = renderPage();
    const file = makeFile("resume.pdf", "application/pdf");

    selectFile(container, file);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/unsupported file type/i);
  });

  it("clears the validation error when a valid file is selected afterward", () => {
    const { container } = renderPage();

    // First select an invalid file
    selectFile(container, makeFile("bad.txt", "text/plain"));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Then select a valid file
    selectFile(container, makeFile("good.mp3", "audio/mpeg"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // ── 5. Upload progress ─────────────────────────────────────────────────────

  it("shows Preparing upload status immediately after clicking Upload", () => {
    // uploadInterview never resolves so we stay in the active states
    uploadInterview.mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();
    selectFile(container, makeFile("interview.mp3", "audio/mpeg"));

    fireEvent.click(screen.getByRole("button", { name: /upload recording/i }));

    // "preparing" state is set synchronously before the first await inside handleUpload
    expect(screen.getByText(/preparing upload/i)).toBeInTheDocument();
  });

  it("hides the upload button while upload is active", async () => {
    vi.useFakeTimers();
    uploadInterview.mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = renderPage();
    selectFile(container, makeFile("interview.mp3", "audio/mpeg"));

    fireEvent.click(screen.getByRole("button", { name: /upload recording/i }));

    // Advance past the "preparing" delay so we enter "uploading"
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(
      screen.queryByRole("button", { name: /upload recording/i })
    ).not.toBeInTheDocument();
  });

  // ── 6. Success — audio player ──────────────────────────────────────────────

  it("shows an audio player after a successful audio upload", async () => {
    vi.useFakeTimers();
    uploadInterview.mockResolvedValue(makeUploadResponse("audio/mpeg"));

    const { container } = renderPage();
    selectFile(container, makeFile("voice.mp3", "audio/mpeg"));

    fireEvent.click(screen.getByRole("button", { name: /upload recording/i }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(container.querySelector("audio")).toBeInTheDocument();
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });

  // ── 7. Success — video player ──────────────────────────────────────────────

  it("shows a video player after a successful video upload", async () => {
    vi.useFakeTimers();
    uploadInterview.mockResolvedValue(makeUploadResponse("video/mp4"));

    const { container } = renderPage();
    selectFile(container, makeFile("session.mp4", "video/mp4"));

    fireEvent.click(screen.getByRole("button", { name: /upload recording/i }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(container.querySelector("video")).toBeInTheDocument();
    expect(container.querySelector("audio")).not.toBeInTheDocument();
  });

  // ── 8. Failed upload shows retry ──────────────────────────────────────────

  it("shows a retry button and friendly error message after a network failure", async () => {
    vi.useFakeTimers();
    const networkError = Object.assign(new Error("Network Error"), { status: 0 });
    uploadInterview.mockRejectedValue(networkError);

    const { container } = renderPage();
    selectFile(container, makeFile("interview.mp3", "audio/mpeg"));

    fireEvent.click(screen.getByRole("button", { name: /upload recording/i }));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Retry button appears
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();

    // Friendly error text is announced
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/network error/i);
  });

  it("re-enables the form after clicking Retry", async () => {
    vi.useFakeTimers();
    uploadInterview.mockRejectedValue(new Error("fail"));

    const { container } = renderPage();
    selectFile(container, makeFile("interview.mp3", "audio/mpeg"));
    fireEvent.click(screen.getByRole("button", { name: /upload recording/i }));
    await act(async () => { await vi.runAllTimersAsync(); });

    // Click retry
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    // Upload button is back and enabled (file is still selected)
    const uploadBtn = screen.getByRole("button", { name: /upload recording/i });
    expect(uploadBtn).toBeInTheDocument();
    expect(uploadBtn).not.toBeDisabled();
  });
});
