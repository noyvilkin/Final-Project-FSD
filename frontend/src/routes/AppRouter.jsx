import ProtectedRoute from "./ProtectedRoute";
import MyProfile from "../pages/MyProfile";

<Route
  path="/profile"
  element={
    <ProtectedRoute>
      <MyProfile />
    </ProtectedRoute>
  }
/>