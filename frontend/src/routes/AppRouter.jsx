import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "../context/AuthContext";
import Home from "../pages/Home";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import MyProfile from "../pages/MyProfile";
import ResumeUploadPage from "../pages/ResumeUploadPage";
import AssignmentSubmission from "../pages/AssignmentSubmission";
import AssignmentResults from "../pages/AssignmentResults";
import AssignmentProcessing from "../pages/AssignmentProcessing";
import ResumeOptimization from "../pages/ResumeOptimization";
import OptimizationHistory from "../pages/OptimizationHistory";
import OptimizationRunDetail from "../pages/OptimizationRunDetail";
import InterviewUpload from "../pages/InterviewUpload";
import InterviewProcessing from "../pages/InterviewProcessing";
import InterviewInsights from "../pages/InterviewInsights";

function PublicRoute({ children }) {
  const { isAuthenticated, isAuthLoading } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        Checking your session...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <Signup />
          </PublicRoute>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <MyProfile />
          </ProtectedRoute>
        }
      />

      <Route path="/resume-upload" element={<ResumeUploadPage />} />

      <Route
        path="/interview"
        element={
          <ProtectedRoute>
            <InterviewUpload />
          </ProtectedRoute>
        }
      />

      <Route
        path="/assignment"
        element={
          <ProtectedRoute>
            <AssignmentSubmission />
          </ProtectedRoute>
        }
      />

      <Route
        path="/assignment/:id/results"
        element={
          <ProtectedRoute>
            <AssignmentResults />
          </ProtectedRoute>
        }
      />

      <Route
        path="/assignment/:id/processing"
        element={
          <ProtectedRoute>
            <AssignmentProcessing />
          </ProtectedRoute>
        }
      />

      <Route
        path="/assignment/processing"
        element={
          <ProtectedRoute>
            <AssignmentProcessing />
          </ProtectedRoute>
        }
      />

      <Route
        path="/cv"
        element={
          <ProtectedRoute>
            <ResumeOptimization />
          </ProtectedRoute>
        }
      />

      <Route
        path="/cv/history"
        element={
          <ProtectedRoute>
            <OptimizationHistory />
          </ProtectedRoute>
        }
      />

      <Route
        path="/cv/history/:runId"
        element={
          <ProtectedRoute>
            <OptimizationRunDetail />
          </ProtectedRoute>
        }
      />

      <Route
        path="/interview/:id/processing"
        element={
          <ProtectedRoute>
            <InterviewProcessing />
          </ProtectedRoute>
        }
      />

      <Route
        path="/interview/:id/insights"
        element={
          <ProtectedRoute>
            <InterviewInsights />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}