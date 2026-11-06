import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Outlet, RouterProvider, createBrowserRouter } from "react-router";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/jetbrains-mono";
import "lenis/dist/lenis.css";
import "./styles/admin.css";
import { getToken } from "./lib/api.js";
import { AdminDataProvider } from "./data/store.jsx";
import { FeedbackProvider, Loading } from "./components/ui.jsx";
import Shell from "./components/Shell.jsx";
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";

const Requests = lazy(() => import("./pages/Requests.jsx"));
const Players = lazy(() => import("./pages/Players.jsx"));
const Introductions = lazy(() => import("./pages/Introductions.jsx"));
const News = lazy(() => import("./pages/News.jsx"));
const Content = lazy(() => import("./pages/Content.jsx"));
const Accounts = lazy(() => import("./pages/Accounts.jsx"));
const Activity = lazy(() => import("./pages/Activity.jsx"));

const page = (Component) => <Suspense fallback={<Loading />}><Component /></Suspense>;

function RequireAdmin() {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <AdminDataProvider><Shell /></AdminDataProvider>;
}

const go = (to) => <Navigate to={to} replace />;

const router = createBrowserRouter([
  {
    element: <FeedbackProvider><Outlet /></FeedbackProvider>,
    children: [
      { path: "/login", element: <Login /> },
      {
        element: <RequireAdmin />,
        children: [
          { path: "/dashboard", element: <Home /> },
          { path: "/request", element: page(Requests) },
          { path: "/players", element: page(Players) },
          { path: "/introductions", element: page(Introductions) },
          { path: "/news", element: page(News) },
          { path: "/content", element: page(Content) },
          { path: "/member-accounts", element: page(Accounts) },
          { path: "/logs", element: page(Activity) },
        ],
      },
      // Addresses from the previous admin keep working.
      { path: "/login.html", element: go("/login") },
      { path: "/dashboard.html", element: go("/dashboard") },
      { path: "/players.html", element: go("/players") },
      { path: "/news.html", element: go("/news") },
      { path: "/content.html", element: go("/content") },
      { path: "/member-accounts.html", element: go("/member-accounts") },
      { path: "*", element: go("/dashboard") },
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
);
