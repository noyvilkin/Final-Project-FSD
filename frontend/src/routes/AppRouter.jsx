import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import MyProfile from "../pages/MyProfile";

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

      <Route path="*" element={<div>404</div>} />
    </Routes>
  );
}