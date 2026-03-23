import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import MyProfile from "../pages/MyProfile";
import ResumeUploadPage from "../pages/ResumeUploadPage";

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
      <Route path="/resume-upload" element={<ResumeUploadPage />} />
      <Route path="*" element={<div>404</div>} />
    </Routes>
  );
}