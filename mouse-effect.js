(() => {
  if (window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
  const glow = document.createElement("div");
  glow.className = "mouse-glow";
  glow.setAttribute("aria-hidden", "true");
  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(glow);
  });
  let raf = 0;
  let x = -500;
  let y = -500;
  window.addEventListener("mousemove", (event) => {
    x = event.clientX;
    y = event.clientY;
    if (!glow.isConnected && document.body) document.body.appendChild(glow);
    if (raf) return;
    raf = requestAnimationFrame(() => {
      glow.style.left = `${x}px`;
      glow.style.top = `${y}px`;
      glow.classList.add("is-visible");
      raf = 0;
    });
  }, { passive: true });
  document.addEventListener("mouseleave", () => glow.classList.remove("is-visible"));
  document.addEventListener("mouseenter", () => glow.classList.add("is-visible"));
})();