// Small animation building blocks used across the site.
import { useEffect, useRef, useState } from "react";
import {
  animate, motion, useAnimationFrame, useInView, useMotionValue, useReducedMotion,
  useScroll, useSpring, useTransform, useVelocity, wrap,
} from "motion/react";

export const EASE = [0.2, 0.8, 0.2, 1];

export function Reveal({ children, delay = 0, y = 28, className, as = "div" }) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </Tag>
  );
}

// Headline lines that slide up from behind a mask.
export function Lines({ lines, as = "h2", className, delay = 0, immediate = false }) {
  const Tag = as;
  // Watch the heading, not the lines: they start hidden behind their mask,
  // so they would never count as being on screen.
  const ref = useRef(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -6% 0px" });
  const show = immediate || seen;
  return (
    <Tag ref={ref} className={className} aria-label={lines.join(" ")}>
      {lines.map((line, i) => (
        <span className="line-mask" key={line + i} aria-hidden="true">
          <motion.span
            className="line"
            initial={{ y: "112%" }}
            animate={{ y: show ? "0%" : "112%" }}
            transition={{ duration: 1, delay: delay + i * 0.09, ease: EASE }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

export function Counter({ value, decimals = 0, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduced = useReducedMotion();
  const format = (v) => (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-US"));
  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return undefined;
    if (reduced) { el.textContent = format(value); return undefined; }
    const controls = animate(0, value, {
      duration: 1.5,
      ease: EASE,
      onUpdate: (v) => { el.textContent = format(v); },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, inView, reduced]);
  return <span ref={ref} className={className}>{format(reduced ? value : 0)}</span>;
}

// Panel with a soft light that follows the pointer.
export function Tile({ className = "", children, as: Tag = "div", ...props }) {
  const onPointerMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
  };
  return <Tag className={`tile ${className}`} onPointerMove={onPointerMove} {...props}>{children}</Tag>;
}

// Leans towards the pointer a little. Does nothing on touch screens.
export function Magnetic({ children, strength = 0.28 }) {
  const x = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(0, { stiffness: 220, damping: 18, mass: 0.4 });
  const onMove = (event) => {
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - box.left - box.width / 2) * strength);
    y.set((event.clientY - box.top - box.height / 2) * strength);
  };
  const reset = () => { x.set(0); y.set(0); };
  return (
    <motion.span className="magnetic" style={{ x, y }} onPointerMove={onMove} onPointerLeave={reset}>
      {children}
    </motion.span>
  );
}

// Ticker that speeds up, and reverses, with scroll velocity.
export function Marquee({ children, speed = 3 }) {
  const reduced = useReducedMotion();
  const base = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(velocity, [-1500, 0, 1500], [-4, 0, 4], { clamp: false });
  const x = useTransform(base, (v) => `${wrap(-25, 0, v)}%`);
  const direction = useRef(-1);
  useAnimationFrame((_, delta) => {
    if (reduced) return;
    const boost = factor.get();
    if (boost < -0.05) direction.current = 1;
    else if (boost > 0.05) direction.current = -1;
    base.set(base.get() + direction.current * (speed / 10) * (delta / 100) * (1 + Math.abs(boost)));
  });
  return (
    <div className="marquee" aria-hidden="true">
      <motion.div className="marquee-track" style={{ x }}>
        {[0, 1, 2, 3].map((i) => <span key={i}>{children}</span>)}
      </motion.div>
    </div>
  );
}

// Paragraph whose words light up as it scrolls through the viewport.
function Word({ word, range, progress }) {
  const opacity = useTransform(progress, range, [0.16, 1]);
  return <motion.span style={{ opacity }}>{word} </motion.span>;
}
export function ScrollWords({ text, className }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 45%"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className} aria-label={text}>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Word key={`${word}${i}`} word={word} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />
        ))}
      </span>
    </p>
  );
}

export function useIsTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => { setTouch(window.matchMedia("(hover: none), (pointer: coarse)").matches); }, []);
  return touch;
}
