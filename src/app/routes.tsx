import { createBrowserRouter } from "react-router-dom";
import MapPage from "../features/map/MapPage";
import Login from "../features/auth/Login";
import Register from "../features/auth/Register";
import AnalyticsPage from "../features/analytics/AnalyticsPage";
import RequireAuth from "./RequireAuth";

export const router = createBrowserRouter([
  { path: "/", element: <RequireAuth><MapPage /></RequireAuth> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "/analytics", element: <RequireAuth><AnalyticsPage /></RequireAuth> },
]);
