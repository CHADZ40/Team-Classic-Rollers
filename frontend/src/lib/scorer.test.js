import test from "node:test";
import assert from "node:assert/strict";
import { score } from "./scorer.js";

const games = [
  ["perfect game", Array(12).fill(10), 300, true],
  ["all spares of 5", Array(21).fill(5), 150, true],
  ["gutter game", Array(20).fill(0), 0, true],
  ["all nines", Array(10).fill([9, 0]).flat(), 90, true],
  ["dutch 200", [10, 5, 5, 10, 5, 5, 10, 5, 5, 10, 5, 5, 10, 5, 5, 10], 200, true],
  ["mixed 133", [1, 4, 4, 5, 6, 4, 5, 5, 10, 0, 1, 7, 3, 6, 4, 10, 2, 8, 6], 133, true],
  ["299", [...Array(11).fill(10), 9], 299, true],
  ["open tenth", [...Array(18).fill(0), 3, 4], 7, true],
  ["strike then open in tenth", [...Array(18).fill(0), 10, 3, 4], 17, true],
  ["spare then strike in tenth", [...Array(18).fill(0), 7, 3, 10], 20, true],
  ["strike waiting for bonus", [10, 3], 0, false],
  ["spare resolved, frame in progress", [5, 5, 3, 4], 20, false],
];

for (const [name, rolls, total, done] of games) {
  test(name, () => {
    const game = score(rolls);
    assert.equal(game.total, total);
    assert.equal(game.done, done);
  });
}

test("a later frame waits for an earlier open bonus", () => {
  const game = score([10, 10, 3]);
  assert.equal(game.frames[0].total, 23);
  assert.equal(game.frames[1].total, null);
});

test("pins standing in the tenth", () => {
  assert.equal(score([...Array(18).fill(0), 10, 3]).pinsLeft, 7);
  assert.equal(score([...Array(18).fill(0), 10, 10]).pinsLeft, 10);
  assert.equal(score([3]).pinsLeft, 7);
  const spare = score([...Array(18).fill(0), 7, 3]);
  assert.equal(spare.frames[9].marks[1], "/");
  assert.equal(spare.pinsLeft, 10);
});
