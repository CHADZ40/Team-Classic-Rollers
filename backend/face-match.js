// Pure face matching rules, kept apart from the routes so they can be tested on their own.
// Every embedding is a unit-length list of numbers, so a dot product is the cosine similarity.

const dot = (a, b) => {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += a[i] * b[i];
  return total;
};

function normalize(vector) {
  const length = Math.sqrt(dot(vector, vector)) || 1;
  return vector.map((value) => value / length);
}

function meanOf(vectors) {
  const sum = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) vector.forEach((value, i) => { sum[i] += value; });
  return normalize(sum);
}

// One score per registered person: their closest saved view of the face. Best first.
function rankPeople(embedding, people) {
  return people
    .map((person) => ({ memberId: person.memberId, score: Math.max(...person.embeddings.map((saved) => dot(embedding, saved))) }))
    .sort((a, b) => b.score - a.score);
}

// "strong" needs a clear lead over the runner-up, so lookalikes go to the admin instead.
function classify(ranked, { strong, unsure, margin }) {
  const [first, second] = ranked;
  if (!first || first.score < unsure) return "unknown";
  if (first.score >= strong && first.score - (second?.score ?? -1) >= margin) return "strong";
  return "unsure";
}

// Keeps the views that differ most from each other, which covers more head angles
// than keeping the first few frames of someone standing still.
function pickDiverse(embeddings, count) {
  if (embeddings.length <= count) return embeddings.slice();
  const center = meanOf(embeddings);
  const remaining = embeddings.slice();
  remaining.sort((a, b) => dot(b, center) - dot(a, center));
  const picked = [remaining.shift()];
  while (picked.length < count) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((candidate, i) => {
      const closest = Math.max(...picked.map((saved) => dot(candidate, saved)));
      if (closest < bestDistance) { bestDistance = closest; bestIndex = i; }
    });
    picked.push(remaining.splice(bestIndex, 1)[0]);
  }
  return picked;
}

// Counts recent strong sightings, so one lucky frame can never mark anyone present.
class Sightings {
  constructor({ needed, windowMs }) {
    this.needed = needed;
    this.windowMs = windowMs;
    this.seen = new Map();
  }

  add(memberId, now) {
    const recent = (this.seen.get(memberId) || []).filter((at) => now - at <= this.windowMs);
    recent.push(now);
    this.seen.set(memberId, recent);
    return recent.length;
  }

  isConfirmed(memberId) { return (this.seen.get(memberId) || []).length >= this.needed; }
  clear(memberId) { this.seen.delete(memberId); }
}

module.exports = { Sightings, classify, dot, meanOf, normalize, pickDiverse, rankPeople };
