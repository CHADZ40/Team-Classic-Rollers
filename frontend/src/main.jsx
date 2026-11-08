import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, RouterProvider, createBrowserRouter, useLocation, useParams, useSearchParams } from "react-router";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/jetbrains-mono";
import "lenis/dist/lenis.css";
import "./styles/site.css";
import { SiteDataProvider } from "./data/SiteData.jsx";
import { MemberSessionProvider } from "./data/MemberSession.jsx";
import Shell from "./components/Shell.jsx";
import Home from "./pages/Home.jsx";

const Team = lazy(() => import("./pages/Team.jsx"));
const Rankings = lazy(() => import("./pages/Rankings.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Learn = lazy(() => import("./pages/Learn.jsx"));
const About = lazy(() => import("./pages/About.jsx"));
const Submit = lazy(() => import("./pages/Submit.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Portal = lazy(() => import("./pages/Portal.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));

const page = (Component) => <Suspense fallback={<div className="page-loading" />}><Component /></Suspense>;

// Old addresses from the previous site keep working.
function LegacyMember() {
  const [params] = useSearchParams();
  const id = params.get("id");
  return <Navigate to={id ? `/members/${encodeURIComponent(id)}` : "/team"} replace />;
}
function LegacyTeam() {
  const { hash } = useLocation();
  return <Navigate to={{ pathname: "/team", hash }} replace />;
}
function MemberRoute() {
  const { id } = useParams();
  if (id.endsWith(".html")) return <Navigate to={`/members/${id.replace(/\.html$/, "")}`} replace />;
  return page(Profile);
}

const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/team", element: page(Team) },
      { path: "/rankings", element: page(Rankings) },
      { path: "/learn", element: page(Learn) },
      { path: "/about", element: page(About) },
      { path: "/submit", element: page(Submit) },
      { path: "/login", element: page(Login) },
      { path: "/portal", element: page(Portal) },
      { path: "/member-portal.html", element: <Navigate to="/portal" replace /> },
      { path: "/members/:id", element: <MemberRoute /> },
      { path: "/index.html", element: <Navigate to="/" replace /> },
      { path: "/team.html", element: <LegacyTeam /> },
      { path: "/rankings.html", element: <Navigate to="/rankings" replace /> },
      { path: "/learn.html", element: <Navigate to="/learn" replace /> },
      { path: "/about.html", element: <Navigate to="/about" replace /> },
      { path: "/member.html", element: <LegacyMember /> },
      { path: "*", element: page(NotFound) },
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <SiteDataProvider>
        <MemberSessionProvider>
          <RouterProvider router={router} />
        </MemberSessionProvider>
      </SiteDataProvider>
    </MotionConfig>
  </StrictMode>,
);
