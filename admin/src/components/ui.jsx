// Shared building blocks: toasts, dialogs, confirmations, counters and photos.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { fullPhoto, thumbPhoto } from "../lib/api.js";

export const EASE = [0.2, 0.8, 0.2, 1];
export const SPRING = { type: "spring", stiffness: 320, damping: 32 };

const Feedback = createContext(null);
export const useFeedback = () => useContext(Feedback);

export function Modal({ onClose, sheet = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return createPortal(
    <motion.dialog
      ref={ref}
      className={sheet ? "sheet" : undefined}
      data-lenis-prevent
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === ref.current) onClose(); }}
      initial={sheet ? { x: 80, opacity: 0 } : { y: 22, opacity: 0, scale: 0.97 }}
      animate={sheet ? { x: 0, opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
      exit={sheet ? { x: 80, opacity: 0 } : { y: 14, opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, ease: EASE }}
    >
      {children}
    </motion.dialog>,
    document.body,
  );
}

function ConfirmBody({ title, body, confirm, cancel, danger, typed, onAnswer }) {
  const [word, setWord] = useState("");
  const locked = Boolean(typed) && word.trim() !== typed;
  return (
    <form className="dialog-body" onSubmit={(event) => { event.preventDefault(); if (!locked) onAnswer(true); }}>
      <h2 className="dialog-title">{title}</h2>
      <p className="dim">{body}</p>
      {typed && (
        <label className="field">Type {typed} to confirm
          <input data-typed autoComplete="off" value={word} onChange={(event) => setWord(event.target.value)} autoFocus />
        </label>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onAnswer(false)}>{cancel}</button>
        <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} data-yes disabled={locked}>{confirm}</button>
      </div>
    </form>
  );
}

export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [question, setQuestion] = useState(null);
  const timer = useRef(0);

  const showToast = useCallback((text, isError = false) => {
    clearTimeout(timer.current);
    setToast({ text, isError, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), isError ? 6000 : 3500);
  }, []);

  // Says exactly what will happen. `typed` makes the admin type a word for the riskiest actions.
  const confirmAction = useCallback((options) => new Promise((resolve) => {
    setQuestion({ cancel: "Cancel", ...options, resolve });
  }), []);

  // Runs an action and reports the outcome, so every button behaves the same way.
  const run = useCallback(async (action, success) => {
    try {
      const result = await action();
      if (success) showToast(typeof success === "function" ? success(result) : success);
      return { ok: true, result };
    } catch (failure) {
      showToast(failure.message, true);
      return { ok: false };
    }
  }, [showToast]);

  const answer = (value) => { question?.resolve(value); setQuestion(null); };
  const value = useMemo(() => ({ toast: showToast, confirmAction, run }), [showToast, confirmAction, run]);

  return (
    <Feedback.Provider value={value}>
      {children}
      <AnimatePresence>
        {question && <Modal key="confirm" onClose={() => answer(false)}><ConfirmBody {...question} onAnswer={answer} /></Modal>}
      </AnimatePresence>
      {createPortal(
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              className={`toast${toast.isError ? " is-error" : ""}`}
              role="status"
              initial={{ opacity: 0, y: 18, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 10, x: "-50%" }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Feedback.Provider>
  );
}

// A button that shows it's busy and can't be pressed twice.
export function ActionButton({ onAction, busyText, children, className = "btn btn-primary", disabled, ...props }) {
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const click = async (event) => {
    setBusy(true);
    try { await onAction(event); } finally { if (live.current) setBusy(false); }
  };
  return <button type="button" className={className} disabled={disabled || busy} onClick={click} {...props}>{busy ? (busyText || "Working…") : children}</button>;
}

export function Counter({ value, decimals = 0 }) {
  const ref = useRef(null);
  const previous = useRef(0);
  const reduced = useReducedMotion();
  const format = (v) => (decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-US"));
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (reduced) { el.textContent = format(value); return undefined; }
    const controls = animate(previous.current, value, { duration: 0.9, ease: EASE, onUpdate: (v) => { el.textContent = format(v); } });
    previous.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);
  return <span ref={ref}>{format(0)}</span>;
}

export function Photo({ path, alt = "", ...props }) {
  return (
    <img
      src={thumbPhoto(path)}
      alt={alt}
      loading="lazy"
      onError={(event) => { const full = fullPhoto(path); if (!event.currentTarget.src.endsWith(encodeURI(full))) event.currentTarget.src = full; }}
      {...props}
    />
  );
}

export function PageHead({ eyebrow, title, intro, children }) {
  return (
    <motion.div className="head" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro && <p className="sub">{intro}</p>}
      </div>
      {children}
    </motion.div>
  );
}

export function Tabs({ id, label, value, onChange, options }) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {value === option.value && <motion.span layoutId={`tab-${id}`} className="tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export const Loading = () => <p className="empty">Loading…</p>;
