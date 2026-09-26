import { Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProtectedRoute from "./components/ProtectedRoute";
import WorkspacePage from "./pages/WorkspacePage";
import HistoryPage from "./pages/HistoryPage";

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/"
          element={<Navigate to="/workspace" replace />}
        />

        <Route
          path="/workspace"
          element={<WorkspacePage />}
        />

        <Route
          path="/history"
          element={<HistoryPage />}
        />
      </Route>

      {/* Unknown Routes */}
      <Route
        path="*"
        element={<Navigate to="/workspace" replace />}
      />
    </Routes>
  );
}

export default App;