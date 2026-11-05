import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Counter, Lines, Reveal, ScrollWords, Tile } from "../components/motion.jsx";
import { useContent, useSiteData } from "../data/SiteData.jsx";
import { SOCIALS, activeMembers } from "../lib/team.js";

const VALUES = [
  ["Teamwork", "Bowling looks like a solo sport until you've had a teammate in your corner. We celebrate every improvement together."],
  ["Discipline", "Good games come from good habits. We train with purpose and trust the work when the pressure is on."],
  ["Competition", "We love a challenge. We compete hard, respect our opponents and take the lesson from every result."],
  ["Pride", "The temple on our crest is a promise. Wherever we bowl, we bowl for each other and for Cambodia."],
];

const LIFE = [
  ["Train", "Build a game you can trust", "Focused practice on consistency, technique and confidence, so your best frames stop being a surprise."],
  ["Compete", "Test it when it counts", "Take your game to tournaments and represent the team. Every result goes on the board."],
  ["Grow", "See your progress", "Your own profile tracks your games, pins and average, with a goal that rises as you do."],
];

export default function About() {
  const { data } = useSiteData();
  const title = useContent("aboutTitle", "Built for the love of the game");
  const description = useContent("aboutDescription", "We're a Cambodian bowling team that treats every frame as a chance to get better, and every teammate as family.");
  const heading = useContent("aboutHeading", "More than a bowling team");
  const body = useContent("aboutBody", "Team Classic Rollers brings Cambodian bowlers together to train, compete and improve. You'll find us working on spares, learning from each other and cheering just as loudly for a teammate's first strike as for a tournament win.");
  const body2 = useContent("aboutBody2", "We care about discipline, respect, teamwork and steady progress. Whether you're chasing your next tournament or still learning to read a scoresheet, there's a place for you here and people ready to help you grow.");

  const art = useRef(null);
  const { scrollYProgress } = useScroll({ target: art, offset: ["start end", "end start"] });
  const artY = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);

  return (
    <>
      <section className="page-head wrap">
        <p className="label label--accent">About us</p>
        <h1 className="mega mega--page mega--long">{title}</h1>
        <Reveal><p className="lede">{description}</p></Reveal>
      </section>

      <section className="wrap">
        <div className="about-art" ref={art}>
          <motion.img style={{ y: artY }} src="/assets/opt/banner.webp" alt="Team Classic Rollers banner with Angkor Wat, bowling pins and the team crest" />
        </div>
      </section>

      <section className="section wrap manifesto">
        <p className="label label--accent">{heading}</p>
        <ScrollWords className="manifesto-text" text={body} />
        <Reveal><p className="lede">{body2}</p></Reveal>
      </section>

      <section className="wrap">
        <div className="grid-4">
          <Tile className="pad-lg"><p className="stat">3</p><p className="dim">Squads: A, B and C</p></Tile>
          <Tile className="pad-lg"><p className="stat"><Counter value={activeMembers(data).length} /></p><p className="dim">Bowlers on the roster</p></Tile>
          <Tile className="pad-lg"><p className="stat">10+</p><p className="dim">Tournaments and counting</p></Tile>
          <Tile className="pad-lg"><p className="stat">1</p><p className="dim">Family, on and off the lanes</p></Tile>
        </div>
      </section>

      <section className="section wrap">
        <p className="label label--accent">What we stand for</p>
        <Lines lines={["How the", "Rollers play"]} className="display" />
        <ol className="values gap-top">
          {VALUES.map(([name, copy], i) => (
            <Reveal as="li" key={name}>
              <span className="tip-no">{String(i + 1).padStart(2, "0")}</span>
              <h3>{name}</h3>
              <p className="dim">{copy}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="section wrap section--flush-top">
        <p className="label label--accent">Life on the team</p>
        <Lines lines={["What being a", "Roller means"]} className="display" />
        <div className="grid-3 gap-top">
          {LIFE.map(([tag, title2, copy], i) => (
            <Reveal key={tag} delay={i * 0.08}>
              <Tile className="pad-lg full">
                <p className="label label--accent">{tag}</p>
                <h3 className="tile-title">{title2}</h3>
                <p className="dim">{copy}</p>
              </Tile>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="band-wrap">
        <div className="band band--single">
          <div>
            <p className="label">Come say hello</p>
            <Lines lines={["Your lane", "is open"]} className="display" />
            <p className="band-copy">New bowler or seasoned competitor, send us a message and tell us about your game.</p>
            <a className="pill pill--dark" href={SOCIALS[0].href} target="_blank" rel="noopener noreferrer">Message us on Facebook</a>
          </div>
          <img className="band-mascot" src="/assets/opt/mascot.webp" alt="" loading="lazy" />
        </div>
      </section>
    </>
  );
}
