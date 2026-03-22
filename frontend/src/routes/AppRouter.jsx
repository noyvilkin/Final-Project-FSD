import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import MyProfile from "../pages/MyProfile";
import AssignmentSubmission from "../pages/AssignmentSubmission";
import AssignmentResults from "../pages/AssignmentResults";
import AssignmentProcessing from "../pages/AssignmentProcessing";
import ResumeOptimization from "../pages/ResumeOptimization";
import OptimizationHistory from "../pages/OptimizationHistory";
import OptimizationRunDetail from "../pages/OptimizationRunDetail";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/profile" replace />} />

      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <MyProfile />
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

      <Route path="*" element={<div>404</div>} />
    </Routes>
  );
}