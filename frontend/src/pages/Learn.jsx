import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { Lines, Reveal, Tile } from "../components/motion.jsx";
import { score } from "../lib/scorer.js";
import { SOCIALS } from "../lib/team.js";

const BASICS = [["10", "Frames in a game"], ["10", "Pins per rack"], ["12", "Strikes for a 300"], ["18.3", "Metres to the head pin"]];

const FRAME_TYPES = [
  { mark: "X", title: "Strike", copy: "All ten pins on your first roll. The frame scores 10 plus your next two rolls.", example: "X, then 7 and 2: the strike is worth 19." },
  { mark: "/", title: "Spare", copy: "All ten pins using both rolls. The frame scores 10 plus your next roll.", example: "7 and /, then 6: the spare is worth 16." },
  { mark: "8", title: "Open frame", copy: "Pins left standing after two rolls. You score exactly what you knocked down.", example: "5 and 3: the frame is worth 8." },
];

const TIPS = [
  ["Pick a comfortable ball", "A common starting point is about 10% of your body weight. Your thumb should slide out easily, with no squeezing."],
  ["Aim at the arrows", "Those seven arrows are much closer than the pins, so they're far easier to hit. Pick one and roll over it."],
  ["Keep your swing loose", "Let the weight of the ball do the work, like a pendulum. Throwing harder usually just means less control."],
  ["Finish facing your target", "Keep your shoulders square and follow through up towards your target. Your hand should end near your ear."],
  ["Stay behind the foul line", "Cross it and the roll scores zero. Lanes are also oiled past the line, so it's slippery as well."],
  ["Share the lanes", "If the bowler next to you is on the approach, let them go first. Then cheer the good shots. That's the Rollers way."],
];

const WORDS = [
  ["Turkey", "Three strikes in a row."],
  ["Hambone", "Four strikes in a row."],
  ["Perfect game", "Twelve strikes in a row, for a score of 300."],
  ["Pocket", "The sweet spot between the 1 and 3 pins for a right-hander, or the 1 and 2 pins for a left-hander."],
  ["Hook", "The curve a ball makes as it grips the lane on its way to the pins."],
  ["Split", "Pins left standing with a gap between them after the first roll. Tricky to spare."],
  ["Gutter ball", "A roll that drops into the channel beside the lane. It scores zero."],
  ["Open frame", "A frame with no strike or spare."],
  ["Clean game", "A game with a strike or spare in every frame, so no open frames."],
  ["Approach", "The area behind the foul line where you take your steps before releasing."],
];

// Rows of the pin deck, back to front, numbered the way bowlers number them.
const DECK = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

function PinDeck({ standing }) {
  return (
    <div className="deck" aria-hidden="true">
      {DECK.map((row) => (
        <div className="deck-row" key={row[0]}>
          {row.map((pin) => (
            <motion.i key={pin} animate={{ opacity: pin <= standing ? 1 : 0.12, scale: pin <= standing ? 1 : 0.7 }} transition={{ type: "spring", stiffness: 420, damping: 22, delay: (10 - pin) * 0.012 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Scorer() {
  const [rolls, setRolls] = useState([]);
  const game = useMemo(() => score(rolls), [rolls]);
  const add = (pins) => setRolls((current) => [...current, pins]);
  const fullRack = game.pinsLeft === 10;
  return (
    <div className="scorer">
      <div className="sheet" role="group" aria-label="Scoresheet">
        {game.frames.map((frame, f) => (
          <div className="sf" key={f} data-current={!game.done && game.frame === f}>
            <span className="sf-no">{f + 1}</span>
            <span className="sf-rolls">
              {(f === 9 ? [0, 1, 2] : [0, 1]).map((n) => (
                <span key={n}>
                  <AnimatePresence>
                    {frame.marks[n] && (
                      <motion.b key={frame.marks[n]} initial={{ scale: 1.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
                        {frame.marks[n]}
                      </motion.b>
                    )}
                  </AnimatePresence>
                </span>
              ))}
            </span>
            <span className="sf-total">{frame.total ?? ""}</span>
          </div>
        ))}
      </div>
      <div className="scorer-body">
        <PinDeck standing={game.done ? 0 : game.pinsLeft} />
        <div>
          <div className="pad" role="group" aria-label="Pins knocked down">
            {Array.from({ length: 11 }, (_, n) => (
              <button key={n} type="button" disabled={game.done || n > game.pinsLeft} aria-label={`${n} pins`} onClick={() => add(n)}>{n}</button>
            ))}
            <button type="button" className="pad-mark" disabled={game.done} aria-label={fullRack ? "Strike" : "Spare"} onClick={() => add(game.pinsLeft)}>{fullRack ? "X" : "/"}</button>
          </div>
          <div className="scorer-foot">
            <p role="status" data-testid="scorer-status">
              {game.done ? <>Final score: <b>{game.total}</b></>
                : rolls.length ? <>Frame {game.frame + 1}. Score so far: <b>{game.total}</b></>
                  : "Tap the pins you knocked down in frame 1."}
            </p>
            <div className="scorer-tools">
              {game.done && <Link to={`/submit?games=1&scores=${game.total}`} viewTransition className="pill pill--sm">Submit this game</Link>}
              <button type="button" className="pill pill--ghost pill--sm" disabled={!rolls.length} onClick={() => setRolls((current) => current.slice(0, -1))}>Undo</button>
              <button type="button" className="pill pill--ghost pill--sm" onClick={() => setRolls([])}>New game</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Learn() {
  return (
    <>
      <section className="page-head wrap">
        <p className="label label--accent">Learn the game</p>
        <Lines as="h1" className="mega mega--page" lines={["Bowling,", "made simple"]} immediate />
        <Reveal><p className="lede">Everything a new bowler needs, in plain language. Read it once before your first game and you'll know more than most people on the lanes.</p></Reveal>
        <nav className="toc" aria-label="On this page">
          {[["basics", "The basics"], ["scoring", "Scoring"], ["calculator", "Score calculator"], ["first-game", "Your first game"], ["words", "Bowling words"]].map(([id, label]) => (
            <Link key={id} to={`#${id}`} className="chip chip--plain">{label}</Link>
          ))}
        </nav>
      </section>

      <section className="section wrap" id="basics">
        <p className="label label--accent">The basics</p>
        <Lines lines={["The game in", "30 seconds"]} className="display" />
        <Reveal><p className="lede">A game has ten frames. In each frame you get up to two rolls to knock down ten pins. Knock them all down and you earn bonus pins from your next rolls. That bonus is why great games climb so fast, all the way to a perfect 300.</p></Reveal>
        <div className="grid-4 gap-top">
          {BASICS.map(([value, label], i) => (
            <Reveal key={label} delay={i * 0.07}><Tile className="pad-lg full"><p className="stat">{value}</p><p className="dim">{label}</p></Tile></Reveal>
          ))}
        </div>
      </section>

      <section className="section wrap" id="scoring">
        <p className="label label--accent">Scoring</p>
        <Lines lines={["Three kinds", "of frame"]} className="display" />
        <div className="grid-3 gap-top">
          {FRAME_TYPES.map((type, i) => (
            <Reveal key={type.title} delay={i * 0.08}>
              <Tile className="pad-lg full mark-tile">
                <span className="mark">{type.mark}</span>
                <h3 className="tile-title">{type.title}</h3>
                <p className="dim">{type.copy}</p>
                <p className="example">{type.example}</p>
              </Tile>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <Tile className="pad-lg gap-sm">
            <h3 className="tile-title">The tenth frame is special</h3>
            <p className="dim">Strike or spare in the tenth and you get extra rolls to finish your bonus: two more after a strike, one more after a spare. That's why a perfect game takes 12 strikes, not 10.</p>
          </Tile>
        </Reveal>
      </section>

      <section className="section wrap" id="calculator">
        <p className="label label--accent">Try it</p>
        <Lines lines={["Score calculator"]} className="display" />
        <Reveal><p className="lede">Tap the pins you knocked down on each roll. It handles every bonus for you, so you can check a game or practise reading a scoresheet.</p></Reveal>
        <Reveal className="gap-top"><Scorer /></Reveal>
      </section>

      <section className="section wrap" id="first-game">
        <p className="label label--accent">Your first game</p>
        <Lines lines={["Six tips that", "really help"]} className="display" />
        <ol className="tips gap-top">
          {TIPS.map(([title, copy], i) => (
            <Reveal as="li" key={title} delay={(i % 3) * 0.06}>
              <span className="tip-no">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="tile-title">{title}</h3>
              <p className="dim">{copy}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="section wrap" id="words">
        <p className="label label--accent">Talk like a bowler</p>
        <Lines lines={["Words you'll hear"]} className="display" />
        <dl className="glossary gap-top">
          {WORDS.map(([word, meaning]) => (
            <Reveal key={word}><dt>{word}</dt><dd>{meaning}</dd></Reveal>
          ))}
        </dl>
      </section>

      <section className="band-wrap">
        <div className="band band--single">
          <div>
            <p className="label">Next step</p>
            <Lines lines={["Ready to roll", "with us?"]} className="display" />
            <p className="band-copy">The best way to learn is at the lanes, with teammates in your corner.</p>
            <a className="pill pill--dark" href={SOCIALS[0].href} target="_blank" rel="noopener noreferrer">Message us on Facebook</a>
          </div>
          <img className="band-mascot" src="/assets/opt/mascot.webp" alt="" loading="lazy" />
        </div>
      </section>
    </>
  );
}
