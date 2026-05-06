export async function uploadResume(file) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        fileName: file.name,
        jobId: "mock-job-123",
      });
    }, 1000);
  });
}

export async function pollAnalysisStatus() {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        status: "done",
        result: {
          skills: ["React", "JavaScript", "Node.js", "MongoDB"],
          experienceYears: 3,
        },
      });
    }, 3000);
  });
}