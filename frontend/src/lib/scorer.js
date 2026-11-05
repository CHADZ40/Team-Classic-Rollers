// Ten-pin scoring. Pure functions, covered by scorer.test.js.

// Where the game is: which frame is up and how many pins are standing.
function nextRoll(rolls) {
  let i = 0;
  for (let f = 0; f < 9; f += 1) {
    if (rolls[i] === undefined) return { frame: f, pinsLeft: 10, done: false };
    if (rolls[i] === 10) { i += 1; continue; }
    if (rolls[i + 1] === undefined) return { frame: f, pinsLeft: 10 - rolls[i], done: false };
    i += 2;
  }
  const [a, b, c] = rolls.slice(i);
  if (a === undefined) return { frame: 9, pinsLeft: 10, done: false };
  if (b === undefined) return { frame: 9, pinsLeft: a === 10 ? 10 : 10 - a, done: false };
  if (a !== 10 && a + b < 10) return { frame: 9, pinsLeft: 0, done: true };
  if (c === undefined) return { frame: 9, pinsLeft: a === 10 && b !== 10 ? 10 - b : 10, done: false };
  return { frame: 9, pinsLeft: 0, done: true };
}

export function score(rolls) {
  const frames = [];
  let i = 0;
  let running = 0;
  let open = false; // a frame can't total until every earlier frame has
  for (let f = 0; f < 10; f += 1) {
    const a = rolls[i];
    const b = rolls[i + 1];
    const c = rolls[i + 2];
    const frame = { marks: [], total: null };
    let value = null;
    if (f < 9) {
      if (a === 10) {
        frame.marks = ["", "X"];
        if (b !== undefined && c !== undefined) value = 10 + b + c;
        i += 1;
      } else {
        if (a !== undefined) frame.marks[0] = a === 0 ? "-" : String(a);
        if (b !== undefined) {
          frame.marks[1] = a + b === 10 ? "/" : b === 0 ? "-" : String(b);
          if (a + b === 10) { if (c !== undefined) value = 10 + c; } else value = a + b;
        }
        i += 2;
      }
    } else {
      const mark = (v, spare) => (spare ? "/" : v === 10 ? "X" : v === 0 ? "-" : String(v));
      if (a !== undefined) frame.marks[0] = mark(a, false);
      if (b !== undefined) frame.marks[1] = mark(b, a !== 10 && a + b === 10);
      if (c !== undefined) frame.marks[2] = mark(c, a === 10 && b !== 10 && b + c === 10);
      const needsThird = a === 10 || (a !== undefined && b !== undefined && a + b === 10);
      if (a !== undefined && b !== undefined && (!needsThird || c !== undefined)) value = a + b + (c || 0);
    }
    if (value === null) open = true;
    if (!open) { running += value; frame.total = running; }
    frames.push(frame);
  }
  return { frames, total: running, ...nextRoll(rolls) };
}
