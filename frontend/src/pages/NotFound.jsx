import { Link } from "react-router";
import { usePageMeta } from "../components/Shell.jsx";

const META = { title: "Gutter ball | Team Classic Rollers", description: "That page doesn't exist." };

export default function NotFound() {
  usePageMeta(META);
  return (
    <section className="page-head wrap">
      <p className="label label--accent">404</p>
      <h1 className="mega mega--page">Gutter ball</h1>
      <p className="lede">That page rolled off the lane. Let's get you back to the action.</p>
      <div className="actions"><Link to="/" viewTransition className="pill">Back to home</Link></div>
    </section>
  );
}
