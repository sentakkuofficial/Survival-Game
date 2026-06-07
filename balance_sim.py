#!/usr/bin/env python3
"""
NEVERLASTING: GRAND SELECTION  —  balance_sim.py
=================================================
A Monte-Carlo *design tool* for tuning how deadly the game feels.

GitHub Pages can't run Python, so this is NOT part of the shipped game — the game
itself is index.html + style.css + game.js. This script lets you simulate thousands
of runs offline to answer: "Does a careless player die in 5-10 turns? Is reaching
Level 5 rare? Are deaths spread across many causes, or does one (e.g. starvation)
dominate?" Tune the CONFIG block below, re-run, and copy the good numbers into the
matching `CFG` object in game.js.

Usage:
    python3 balance_sim.py
    python3 balance_sim.py --runs 20000

The CONFIG values below mirror `CFG` in game.js (game.js is authoritative).
"""

import random, argparse
from collections import Counter

# ---- CONFIG (mirror of CFG in game.js) ----
CONFIG = {
    "max_hp": 100,
    "hunger_rate": 7,
    "starve_threshold": 85,
    "starve_dmg": 6,
    "bleed_rate": 13,
    "infection_step": 12,
    "burn_rate": 5,
    "danger_cool": 4,
    # ambush probability from danger
    "ambush_at50": 0.22, "ambush_at75": 0.45, "ambush_at90": 0.70,
    # how long each level lasts (turns) before its finale
    "level_len": {1: 6, 2: 6, 3: 7, 4: 7, 5: 6},
}

# ---- PLAYER PROFILES (the only real skill lever is reflex timing + nerve) ----
PROFILES = {
    "reckless": dict(perfect=0.08, good=0.25, timeout=0.35, forage=0.30, treat=0.20, ruthless=0.5),
    "average":  dict(perfect=0.22, good=0.42, timeout=0.12, forage=0.55, treat=0.55, ruthless=0.5),
    "skilled":  dict(perfect=0.45, good=0.43, timeout=0.00, forage=0.80, treat=0.85, ruthless=0.5),
}

def reflex(p):
    r = random.random()
    if r < p["perfect"]:
        return "perfect"
    if r < p["perfect"] + p["good"]:
        return "good"
    return "miss"

def ambush_chance(danger):
    if danger >= 90: return CONFIG["ambush_at90"]
    if danger >= 75: return CONFIG["ambush_at75"]
    if danger >= 50: return CONFIG["ambush_at50"]
    return max(0.0, (danger - 30) * 0.004)

class Run:
    def __init__(self):
        c = CONFIG
        self.hp = c["max_hp"]; self.hunger = 8; self.composure = 70; self.infection = 0
        self.danger = 10; self.food = 2; self.bandages = 2
        self.bleeding = False; self.infected = False; self.burned = 0
        self.level = 1; self.turn = 0; self.tin = 0
        self.dead = False; self.win = False; self.cause = None

    def hurt(self, n, cause):
        self.hp -= n
        if self.hp <= 0 and not self.dead:
            self.hp = 0; self.cause = cause; self.dead = True

    def end_turn(self):
        c = CONFIG
        if self.bleeding: self.hurt(c["bleed_rate"], "bleed")
        if self.burned > 0:
            self.hurt(c["burn_rate"], "fire"); self.burned -= 1
        if self.infected:
            self.infection += c["infection_step"]; self.hurt(2, "infection")
            if self.infection >= 100: self.cause = "infection"; self.dead = True
        self.hunger = min(100, self.hunger + c["hunger_rate"])
        if self.hunger >= 60 and self.food > 0:           # auto-eat from pack
            self.food -= 1; self.hunger = max(0, self.hunger - 42)
        if self.hunger >= c["starve_threshold"]:
            self.hurt(c["starve_dmg"], "starve")
        self.composure += (-6 if self.danger > 60 else 4)
        self.composure = max(0, min(100, self.composure))
        if self.composure <= 0 and self.danger >= 60:
            self.cause = "panic"; self.dead = True
        self.danger = max(0, self.danger - c["danger_cool"])

def simulate(profile):
    p = PROFILES[profile]
    S = Run()
    guard = 0
    while not S.dead and not S.win and guard < 300:
        guard += 1
        S.turn += 1
        # ambush?
        if S.turn > 1 and random.random() < ambush_chance(S.danger):
            threat = min(5, 1 + S.level)  # threat scales with level
            resolve_combat(S, p, threat, fac=(S.level >= 3))
        else:
            S.tin += 1
            if S.tin > CONFIG["level_len"][S.level]:
                # finale: reflex-gated, lethal on a miss in late levels
                finale(S, p)
                if not S.dead:
                    if S.level >= 5:
                        S.win = True
                    else:
                        S.level += 1; S.tin = 0
            else:
                normal_turn(S, p)
        if not S.dead and not S.win:
            S.end_turn()
    return S

def resolve_combat(S, p, threat, fac=False):
    g = reflex(p)
    win = g == "perfect" or (g == "good" and threat <= 3)
    if win:
        S.danger = max(0, S.danger - 12)
        return
    dmg = 10 + threat * 7
    S.hurt(dmg, "syndicate" if fac else "combat")
    S.bleeding = True
    S.danger = min(100, S.danger + 12)

def normal_turn(S, p):
    """Average over the kinds of beats/events: some forage, some hurt, some raise danger."""
    roll = random.random()
    # urgent/timed beat?  (acid, grate, snare) — chance to be caught out
    if roll < 0.22:
        if random.random() < p["timeout"]:
            S.hurt(random.randint(28, 55), random.choice(["acid", "fire", "combat"]))
            S.burned = 2; return
        g = reflex(p)
        if g == "miss":
            S.hurt(random.randint(20, 38), random.choice(["acid", "fire"])); S.burned = 1
        else:
            S.danger = max(0, S.danger - 6)
        return
    # foraging opportunity
    if roll < 0.45:
        if random.random() < p["forage"]:
            S.food += 2; S.hunger = max(0, S.hunger - 30)
        else:
            S.danger += 6
        return
    # wound / infection tick event
    if roll < 0.62 and (S.bleeding or S.burned):
        if random.random() < p["treat"] and S.bandages > 0:
            S.bandages -= 1; S.bleeding = False
        else:
            S.infected = True
        return
    # plain risky exploration
    S.danger = min(100, S.danger + random.randint(-6, 12))
    if random.random() < 0.18:
        S.hurt(random.randint(8, 18), "combat"); S.bleeding = True

def finale(S, p):
    """Level finales are reflex-gated and increasingly lethal."""
    g = reflex(p)
    lethal_miss = {1: 0.0, 2: 0.08, 3: 0.32, 4: 0.6, 5: 0.55}[S.level]
    if g == "perfect":
        return
    if g == "good" and S.level <= 4:
        S.hurt(random.randint(18, 30), "combat"); S.bleeding = True
        return
    # miss
    if random.random() < lethal_miss:
        S.cause = "combat" if S.level >= 4 else "acid"; S.dead = True
    else:
        S.hurt(random.randint(25, 45), "acid" if S.level == 3 else "combat"); S.bleeding = True

def report(profile, runs):
    turns = []; levels = Counter(); causes = Counter(); wins = 0; l3 = 0; l5 = 0
    for _ in range(runs):
        S = simulate(profile)
        turns.append(S.turn); levels[S.level] += 1
        if S.win: wins += 1
        else: causes[S.cause or "?"] += 1
        if S.level >= 3 or S.win: l3 += 1
        if S.level >= 5 or S.win: l5 += 1
    turns.sort()
    med = turns[len(turns)//2]; mean = sum(turns)/len(turns)
    print(f"\n== {profile.upper()} (N={runs}) ==")
    print(f"turns survived: median {med}, mean {mean:.1f}, min {turns[0]}, p90 {turns[int(len(turns)*0.9)]}")
    print(f"reached L3+: {l3/runs*100:.1f}%   reached L5+: {l5/runs*100:.1f}%   WIN: {wins/runs*100:.1f}%")
    print(f"death level dist: {dict(sorted(levels.items()))}")
    cz = "  ".join(f"{k}:{v/runs*100:.0f}%" for k, v in causes.most_common())
    print(f"death causes: {cz}")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()
    if args.seed is not None: random.seed(args.seed)
    print("NEVERLASTING: GRAND SELECTION — balance simulation")
    print("Targets: careless dies in ~5-10 turns | L3 = earned | L5 = rare | winning = very rare")
    for prof in ("reckless", "average", "skilled"):
        report(prof, args.runs)
    print("\nTune CONFIG above, then mirror good values into `CFG` in game.js.")
