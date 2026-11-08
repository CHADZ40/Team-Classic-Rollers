const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Sightings, classify, dot, normalize, pickDiverse, rankPeople } = require("./face-match");

const limits = { strong: 0.5, unsure: 0.3, margin: 0.08 };
const scored = (...scores) => scores.map((score, i) => ({ memberId: String(i), score }));

test("rankPeople scores each person by their closest saved view", () => {
  const face = normalize([1, 0]);
  const people = [
    { memberId: "far", embeddings: [normalize([0, 1])] },
    { memberId: "near", embeddings: [normalize([0, 1]), normalize([1, 0.01])] },
  ];
  const ranked = rankPeople(face, people);
  assert.equal(ranked[0].memberId, "near");
  assert.ok(ranked[0].score > 0.99);
});

test("a high score with a clear lead is strong", () => {
  assert.equal(classify(scored(0.7, 0.2), limits), "strong");
  assert.equal(classify(scored(0.7), limits), "strong");
});

test("a lookalike close behind the best match goes to the admin", () => {
  assert.equal(classify(scored(0.7, 0.65), limits), "unsure");
});

test("a middling score goes to the admin and a low one is unknown", () => {
  assert.equal(classify(scored(0.4, 0.1), limits), "unsure");
  assert.equal(classify(scored(0.2, 0.1), limits), "unknown");
  assert.equal(classify([], limits), "unknown");
});

test("one sighting can't confirm anyone, and old sightings expire", () => {
  const sightings = new Sightings({ needed: 3, windowMs: 8000 });
  assert.equal(sightings.add("a", 0), 1);
  assert.equal(sightings.add("a", 1000), 2);
  assert.equal(sightings.isConfirmed("a"), false);
  assert.equal(sightings.add("a", 2000), 3);
  assert.equal(sightings.isConfirmed("a"), true);
  assert.equal(sightings.add("a", 20000), 1);
  sightings.clear("a");
  assert.equal(sightings.isConfirmed("a"), false);
});

test("pickDiverse prefers different angles over repeats", () => {
  const same = normalize([1, 0, 0]);
  const views = [same, same, same, same, normalize([0.7, 0.7, 0]), normalize([0.7, 0, 0.7])];
  const picked = pickDiverse(views, 3);
  assert.equal(picked.length, 3);
  assert.ok(picked.some((view) => dot(view, normalize([0.7, 0.7, 0])) > 0.99));
  assert.ok(picked.some((view) => dot(view, normalize([0.7, 0, 0.7])) > 0.99));
});

test("pickDiverse returns everything when there are few views", () => {
  assert.equal(pickDiverse([[1, 0]], 8).length, 1);
});
