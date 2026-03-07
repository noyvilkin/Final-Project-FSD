import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import MyProfile from "../pages/MyProfile";
import AssignmentSubmission from "../pages/AssignmentSubmission";
import AssignmentResults from "../pages/AssignmentResults";
import AssignmentProcessing from "../pages/AssignmentProcessing";

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

      <Route path="*" element={<div>404</div>} />
    </Routes>
  );
}