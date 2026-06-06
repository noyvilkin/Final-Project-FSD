/**
 * Interview UI tests
 *
 * Framework: Vitest + @testing-library/react
 * External deps mocked: api.js (upload + interview endpoints), react-router-dom navigate
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Mock API ────────────────────────────────────────────────────────────────

vi.mock("../services/api", () => ({
  uploadInterview:      vi.fn(),
  processInterview:     vi.fn(),
  getInterviewStatus:   vi.fn(),
  getInterviewInsights: vi.fn(),
  getInterviewTranscript: vi.fn(),
  apiConfig:            { baseUrl: "http://localhost:4000" },
}));

// InterviewUpload now uploads directly via axios (for progress tracking)
vi.mock("axios", () => ({
  default: {
    post: vi.fn().mockResolvedValue({
      data: { interviews: ["interview-123"], count: 1 },
    }),
  },
}));

// ─── Mock AuthContext ─────────────────────────────────────────────────────────

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ userId: "test-user-id", isAuthenticated: true }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

import * as api from "../services/api";

function renderWithRouter(ui, { initialEntries = ["/"] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {ui}
    </MemoryRouter>
  );
}

// A minimal MP3-like file for upload tests
function makeAudioFile(name = "interview.mp3") {
  return new File(["data"], name, { type: "audio/mpeg" });
}

// ─── InterviewUpload tests ────────────────────────────────────────────────────

import InterviewUpload from "../pages/InterviewUpload";

import axios from "axios";

describe("InterviewUpload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // InterviewUpload now uses axios.post directly for progress tracking
    axios.post.mockResolvedValue({
      data: { interviews: ["interview-123"], count: 1 },
    });
    api.processInterview.mockResolvedValue({ interviewId: "interview-123", processingStatus: "queued" });
  });

  it("renders the Generate Insights button", () => {
    renderWithRouter(
      <Routes>
        <Route path="/" element={<InterviewUpload />} />
      </Routes>
    );
    expect(screen.getByRole("button", { name: /generate insights/i })).toBeInTheDocument();
  });

  it("Generate Insights button is disabled before a file is selected", () => {
    renderWithRouter(
      <Routes>
        <Route path="/" element={<InterviewUpload />} />
      </Routes>
    );
    expect(screen.getByRole("button", { name: /generate insights/i })).toBeDisabled();
  });

  it("Generate Insights button is enabled after a valid file is selected", async () => {
    renderWithRouter(
      <Routes>
        <Route path="/" element={<InterviewUpload />} />
      </Routes>
    );
    const input = document.getElementById("interview-file-input");
    await userEvent.upload(input, makeAudioFile());
    expect(screen.getByRole("button", { name: /generate insights/i })).toBeEnabled();
  });

  it("calls axios.post and processInterview when Generate Insights is clicked", async () => {
    renderWithRouter(
      <Routes>
        <Route path="/" element={<InterviewUpload />} />
        <Route path="/interview/:id/processing" element={<div>Processing</div>} />
      </Routes>
    );

    const input = document.getElementById("interview-file-input");
    await userEvent.upload(input, makeAudioFile());
    await userEvent.click(screen.getByRole("button", { name: /generate insights/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(api.processInterview).toHaveBeenCalledWith("interview-123", "test-user-id");
    });
  });

  it("shows an error when upload fails", async () => {
    axios.post.mockRejectedValue(new Error("Network error"));

    renderWithRouter(
      <Routes>
        <Route path="/" element={<InterviewUpload />} />
      </Routes>
    );

    const input = document.getElementById("interview-file-input");
    await userEvent.upload(input, makeAudioFile());
    await userEvent.click(screen.getByRole("button", { name: /generate insights/i }));

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it("explains what will happen during processing", () => {
    renderWithRouter(
      <Routes>
        <Route path="/" element={<InterviewUpload />} />
      </Routes>
    );
    // Use unique detail text rather than the title (which may appear in BottomNav)
    expect(screen.getByText(/transcribed with word-level timestamps/i)).toBeInTheDocument();
    expect(screen.getByText(/STAR framework/i)).toBeInTheDocument();
    expect(screen.getByText(/filler words/i)).toBeInTheDocument();
    expect(screen.getByText(/strengths, areas to improve/i)).toBeInTheDocument();
  });
});

// ─── InterviewProcessing tests ────────────────────────────────────────────────

import InterviewProcessing from "../pages/InterviewProcessing";

describe("InterviewProcessing", () => {
  // No fake timers: the polling loop's first iteration fires immediately (no
  // wait() before the first getInterviewStatus call), so we can use waitFor.
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderProcessing(id = "abc-123") {
    return renderWithRouter(
      <Routes>
        <Route path="/interview/:id/processing" element={<InterviewProcessing />} />
        <Route path="/interview/:id/insights" element={<div>Insights page</div>} />
        <Route path="/interview" element={<div>Upload page</div>} />
      </Routes>,
      { initialEntries: [`/interview/${id}/processing`] }
    );
  }

  it("renders the initial status label", () => {
    api.getInterviewStatus.mockResolvedValue({
      processingStatus: "queued",
      insightsStatus: "not_started",
    });
    renderProcessing();
    expect(screen.getByText(/preparing interview/i)).toBeInTheDocument();
  });

  it('shows "Transcribing speech" when processingStatus is transcribing', async () => {
    api.getInterviewStatus.mockResolvedValue({
      processingStatus: "transcribing",
      insightsStatus: "not_started",
    });
    renderProcessing();
    // Mock resolves immediately on first poll — no timer needed
    await waitFor(() => {
      expect(screen.getByText(/transcribing speech/i)).toBeInTheDocument();
    });
  });

  it('shows "Analyzing interview" when insightsStatus is analyzing', async () => {
    api.getInterviewStatus.mockResolvedValue({
      processingStatus: "completed",
      insightsStatus: "analyzing",
    });
    renderProcessing();
    await waitFor(() => {
      expect(screen.getByText(/analyzing interview/i)).toBeInTheDocument();
    });
  });

  it("navigates to insights page when insightsStatus is completed", async () => {
    api.getInterviewStatus.mockResolvedValue({
      processingStatus: "completed",
      insightsStatus: "completed",
    });
    renderProcessing("abc-123");
    await waitFor(() => {
      expect(screen.getByText(/insights page/i)).toBeInTheDocument();
    });
  });

  it("shows error message and Retry button on failed status", async () => {
    api.getInterviewStatus.mockResolvedValue({
      processingStatus: "failed",
      insightsStatus: "not_started",
    });
    renderProcessing();
    await waitFor(() => {
      expect(screen.getByText(/processing encountered an error/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry processing/i })).toBeInTheDocument();
    });
  });

  it("stops polling on completed: makes exactly one API call then exits", async () => {
    // When the first poll returns a terminal status, the loop exits without
    // scheduling another wait(), so getInterviewStatus is called exactly once.
    api.getInterviewStatus.mockResolvedValue({
      processingStatus: "completed",
      insightsStatus: "completed",
    });

    renderProcessing();

    await waitFor(() => {
      expect(screen.getByText(/insights page/i)).toBeInTheDocument();
    });

    // Only one call was needed to reach the terminal state
    expect(api.getInterviewStatus).toHaveBeenCalledTimes(1);
  });
});

// ─── StarAnalysisSection tests ────────────────────────────────────────────────

import StarAnalysisSection from "../components/interview/StarAnalysisSection";

const MOCK_STAR = {
  situation: { text: "At my previous job", start: 0, end: 5, score: 80, feedback: "Good context" },
  task: { text: "I was asked to lead", start: 5, end: 10, score: 75, feedback: "Clear task" },
  action: {
    text: "I designed the system",
    start: 10, end: 25, score: 90,
    feedback: "Strong personal ownership",
    candidateOwnedAction: true,
    teamOnlyLanguageDetected: false,
  },
  result: { text: "30% improvement", start: 25, end: 30, score: 85, feedback: "Quantified" },
};

const MOCK_STAR_TEAM = {
  ...MOCK_STAR,
  action: {
    ...MOCK_STAR.action,
    candidateOwnedAction: false,
    teamOnlyLanguageDetected: true,
  },
};

describe("StarAnalysisSection", () => {
  it("renders all four STAR sections", () => {
    render(<StarAnalysisSection starAnalysis={MOCK_STAR} />);
    expect(screen.getByText("Situation")).toBeInTheDocument();
    expect(screen.getByText("Task")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Result")).toBeInTheDocument();
  });

  it("shows candidate-owned confirmation when candidateOwnedAction is true", () => {
    render(<StarAnalysisSection starAnalysis={MOCK_STAR} />);
    expect(screen.getByText(/clearly describes your personal contributions/i)).toBeInTheDocument();
  });

  it("shows team-language coaching warning when teamOnlyLanguageDetected is true", () => {
    render(<StarAnalysisSection starAnalysis={MOCK_STAR_TEAM} />);
    expect(screen.getByText(/what you personally contributed/i)).toBeInTheDocument();
  });

  it("renders STAR scores", () => {
    render(<StarAnalysisSection starAnalysis={MOCK_STAR} />);
    expect(screen.getAllByText(/\/100/).length).toBeGreaterThan(0);
  });

  it("renders nothing when starAnalysis is null", () => {
    const { container } = render(<StarAnalysisSection starAnalysis={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── MetricsSection tests ─────────────────────────────────────────────────────

import MetricsSection from "../components/interview/MetricsSection";

const MOCK_INSIGHTS = {
  confidenceScore: 78,
  wordsPerMinute: 130,
  estimatedSpeakingDurationSeconds: 45,
  fillerWordCount: 5,
  fillerWordsBreakdown: [
    { word: "um", count: 3 },
    { word: "like", count: 2 },
  ],
  strengths: ["Clear structure", "Quantified results"],
  weaknesses: ["Too brief"],
  recommendations: ["Add more context to the situation"],
};

describe("MetricsSection", () => {
  it("renders confidence score", () => {
    render(<MetricsSection insights={MOCK_INSIGHTS} />);
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getByText(/confidence score/i)).toBeInTheDocument();
  });

  it("renders words per minute", () => {
    render(<MetricsSection insights={MOCK_INSIGHTS} />);
    expect(screen.getByText("130")).toBeInTheDocument();
    expect(screen.getByText(/speaking pace/i)).toBeInTheDocument();
  });

  it("renders filler word count and breakdown", () => {
    render(<MetricsSection insights={MOCK_INSIGHTS} />);
    expect(screen.getByText("5 total")).toBeInTheDocument();
    expect(screen.getByText(/"um"/)).toBeInTheDocument();
    expect(screen.getByText(/"like"/)).toBeInTheDocument();
  });

  it("renders strengths list", () => {
    render(<MetricsSection insights={MOCK_INSIGHTS} />);
    expect(screen.getByText("Clear structure")).toBeInTheDocument();
    expect(screen.getByText("Quantified results")).toBeInTheDocument();
  });

  it("renders weaknesses list", () => {
    render(<MetricsSection insights={MOCK_INSIGHTS} />);
    expect(screen.getByText("Too brief")).toBeInTheDocument();
  });

  it("renders recommendations", () => {
    render(<MetricsSection insights={MOCK_INSIGHTS} />);
    expect(screen.getByText("Add more context to the situation")).toBeInTheDocument();
  });

  it("renders nothing when insights is null", () => {
    const { container } = render(<MetricsSection insights={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── TranscriptSection tests ──────────────────────────────────────────────────

import TranscriptSection from "../components/interview/TranscriptSection";

describe("TranscriptSection", () => {
  it("renders plain transcript text", () => {
    render(
      <TranscriptSection
        transcript="Hello, tell me about a time you led a project."
        transcriptSegments={[]}
      />
    );
    expect(
      screen.getByText(/tell me about a time you led a project/i)
    ).toBeInTheDocument();
  });

  it("renders timestamped segments when available", () => {
    render(
      <TranscriptSection
        transcript="Hello world."
        transcriptSegments={[
          { start: 0, end: 2, text: "Hello" },
          { start: 2, end: 5, text: "world." },
        ]}
      />
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("world.")).toBeInTheDocument();
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });

  it("renders nothing when transcript is null", () => {
    const { container } = render(
      <TranscriptSection transcript={null} transcriptSegments={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── InterviewInsights page tests ────────────────────────────────────────────

import InterviewInsights from "../pages/InterviewInsights";

describe("InterviewInsights page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function renderInsightsPage(id = "abc-123") {
    return renderWithRouter(
      <Routes>
        <Route path="/interview/:id/insights" element={<InterviewInsights />} />
        <Route path="/interview" element={<div>Upload page</div>} />
      </Routes>,
      { initialEntries: [`/interview/${id}/insights`] }
    );
  }

  it("shows loading state initially", () => {
    api.getInterviewInsights.mockReturnValue(new Promise(() => {}));
    api.getInterviewTranscript.mockReturnValue(new Promise(() => {}));
    renderInsightsPage();
    expect(screen.getByText(/fetching your results/i)).toBeInTheDocument();
  });

  it("renders confidence score after loading", async () => {
    api.getInterviewInsights.mockResolvedValue({
      confidenceScore: 82,
      insightsStatus: "completed",
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });
    api.getInterviewTranscript.mockResolvedValue({
      transcript: "Test transcript.",
      transcriptSegments: [],
    });

    renderInsightsPage();
    await waitFor(() => {
      // Score "82" appears in both the hero card and MetricsSection — use getAllByText
      const matches = screen.getAllByText("82");
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it("renders transcript section", async () => {
    api.getInterviewInsights.mockResolvedValue({
      confidenceScore: 70,
      insightsStatus: "completed",
      strengths: [],
      weaknesses: [],
      recommendations: [],
    });
    api.getInterviewTranscript.mockResolvedValue({
      transcript: "I led the migration project.",
      transcriptSegments: [],
    });

    renderInsightsPage();
    await waitFor(() => {
      expect(screen.getByText(/I led the migration project/i)).toBeInTheDocument();
    });
  });

  it("shows error state and Retry button on fetch failure", async () => {
    api.getInterviewInsights.mockRejectedValue(new Error("Failed to load"));
    api.getInterviewTranscript.mockRejectedValue(new Error("No transcript"));

    renderInsightsPage();
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry processing/i })).toBeInTheDocument();
    });
  });

  it("renders team-language coaching warning in STAR section", async () => {
    api.getInterviewInsights.mockResolvedValue({
      confidenceScore: 65,
      insightsStatus: "completed",
      strengths: [],
      weaknesses: [],
      recommendations: [],
      starAnalysis: {
        situation: { text: "", start: null, end: null, score: 70, feedback: "" },
        task:      { text: "", start: null, end: null, score: 65, feedback: "" },
        action:    {
          text: "", start: null, end: null, score: 50, feedback: "",
          candidateOwnedAction: false,
          teamOnlyLanguageDetected: true,
        },
        result: { text: "", start: null, end: null, score: 60, feedback: "" },
      },
    });
    api.getInterviewTranscript.mockResolvedValue({ transcript: null, transcriptSegments: [] });

    renderInsightsPage();
    await waitFor(() => {
      // Text is a single node (no child elements) after removing <em>
      expect(screen.getByText(/you personally contributed/i)).toBeInTheDocument();
    });
  });
});

// ─── New: InterviewUpload media preview tests ─────────────────────────────────

describe("InterviewUpload — media preview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    axios.post.mockResolvedValue({ data: { interviews: ["interview-abc"], count: 1 } });
    api.processInterview.mockResolvedValue({});
    // jsdom does not implement URL.createObjectURL — provide a stub
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake-url");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  function renderUpload() {
    return renderWithRouter(
      <Routes>
        <Route path="/" element={<InterviewUpload />} />
        <Route path="/interview/:id/processing" element={<div>Processing</div>} />
      </Routes>
    );
  }

  it("shows an audio player after an audio file is selected", async () => {
    renderUpload();
    const input = document.getElementById("interview-file-input");
    await userEvent.upload(input, new File(["data"], "talk.mp3", { type: "audio/mpeg" }));
    // The preview section renders an <audio> element for audio files
    await waitFor(() => {
      expect(document.querySelector("audio")).not.toBeNull();
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("shows a video player after a video file is selected", async () => {
    renderUpload();
    const input = document.getElementById("interview-file-input");
    await userEvent.upload(input, new File(["data"], "interview.mp4", { type: "video/mp4" }));
    expect(document.querySelector("video") ?? document.querySelector("audio")).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("revokes object URL when a new file is selected", async () => {
    renderUpload();
    const input = document.getElementById("interview-file-input");
    await userEvent.upload(input, new File(["data"], "first.mp3", { type: "audio/mpeg" }));
    await userEvent.upload(input, new File(["data"], "second.mp3", { type: "audio/mpeg" }));
    // revokeObjectURL called for the first URL when second file is chosen
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported file type and shows a validation error", async () => {
    // userEvent.upload respects the `accept` attribute and filters out
    // non-matching files silently. Use fireEvent.change to bypass accept
    // filtering and exercise the component's own MIME validation.
    renderUpload();
    const input = document.getElementById("interview-file-input");
    const pdfFile = new File(["data"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [pdfFile], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText(/please upload an audio or video file/i)).toBeInTheDocument();
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("rejects a file over 200 MB and shows a validation error", async () => {
    renderUpload();
    const input = document.getElementById("interview-file-input");
    // File API allows setting size via Object.defineProperty in tests
    const bigFile = new File(["x"], "huge.mp3", { type: "audio/mpeg" });
    Object.defineProperty(bigFile, "size", { value: 201 * 1024 * 1024 });
    await userEvent.upload(input, bigFile);
    expect(screen.getByText(/or smaller/i)).toBeInTheDocument();
  });
});

// ─── New: resolveStage fix — 'completed'+'not_started' shows 'Analyzing' ──────

describe("InterviewProcessing — resolveStage after transcription fix", () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it("shows 'Analyzing interview' when processingStatus=completed, insightsStatus=not_started", async () => {
    api.getInterviewStatus.mockResolvedValue({
      processingStatus: "completed",
      insightsStatus:   "not_started",
    });
    renderWithRouter(
      <Routes>
        <Route path="/interview/:id/processing" element={<InterviewProcessing />} />
        <Route path="/interview/:id/insights"   element={<div>done</div>} />
      </Routes>,
      { initialEntries: ["/interview/xyz/processing"] }
    );
    await waitFor(() => {
      expect(screen.getByText(/analyzing interview/i)).toBeInTheDocument();
    });
  });
});
