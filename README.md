# 🩸 NEVERLASTING: Grand Selection

A dark, fast, **deadly survival roguelike** set in the *Neverlasting* universe. 600 contestants enter the Grand Selection. **15 survive.** You are **Ichido, Contestant #502** — bronze chain, white scarf, and one wrong choice away from being "retired."

> Every choice can end the run. Most do.

![type](https://img.shields.io/badge/type-roguelike-c0271f) ![build](https://img.shields.io/badge/build-none-7bbf57) ![deps](https://img.shields.io/badge/dependencies-zero-e0a93a) ![save](https://img.shields.io/badge/saves-LocalStorage-56c4b8)

## Play

No build step, no backend. Either open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

### GitHub Pages
Push these files to a repo → Settings → Pages → deploy from branch (`main`, `/root`). It's fully static.

## Files

| File | Role |
|------|------|
| `index.html` | Screens & markup (title, run, reflex bar, death, win, journal) |
| `style.css` | Dark survival-tournament aesthetic, danger meter, animations |
| `game.js` | The whole game: lethal survival engine **+** UI. The engine is DOM-free and exported so it can be balance-tested headless. |
| `balance_sim.py` | **Design tool** (not shipped to players) — a Monte-Carlo simulator to tune lethality. |

## What makes it deadly

- **No single "health" stat.** You track Vitality, Stamina, Hunger, Composure, and Infection — plus conditions that change what you can do: **Bleeding, Broken Arm, Limping, Poisoned, Burned, Panicked, Starving, Infected, Exhausted.** Limping means you can't sprint. A broken arm means no chain attacks. Untreated bleeding kills in a few turns.
- **Danger Meter (0–100).** Noise, fighting, lingering, helping, and bleeding all raise it. At high danger, hunters and syndicates **ambush** you mid-turn.
- **Enemy threat scaling (1–5).** A weak contestant is Threat 1; Vidar is Threat 5. Fight someone too strong unprepared and you will probably die.
- **Reflex strikes.** Combat, dodges, and sprints trigger a timing minigame — hit the lit zone (gold = perfect). This is skill, not a dice roll. *(Keyboard: `Space` to strike.)*
- **Timed choices.** "Acid rain begins falling. You have seconds." Real countdowns; freezing is the same as falling here.
- **Real betrayal.** Allies have Trust, Fear, Hunger, Loyalty, Selfishness, and Trauma. Hungry, scared, low-trust allies will steal your food, abandon you while you sleep, or use you as bait.
- **Emotional deaths.** Every death writes a short, specific log line — and saves it to your **Death Journal**.
- **5 levels:** RGB → Blind Trust → Acid Rain → Syndicate Hunt → Final Fifteen. The survivor count falls from 600 toward 15 as you climb.

## Dopamine / "one more run"

- **Legacy perks** unlock as you achieve milestones (reach Level 3, defeat Genji, betray an ally, win…) and can be equipped before the next run — LocalStorage-saved.
- **Death Journal** and **Ending Gallery** persist across runs.
- Brutal random events: ambushes, stolen food, Yellow Fang snares, a contestant begging for mercy, Miki saving you for a price, Asaki ordering you to leave someone behind.

## Tuning the difficulty (`balance_sim.py`)

GitHub Pages can't run Python, so this isn't part of the game — it's how the numbers were tuned. It simulates thousands of runs and reports survival curves and death-cause spread:

```bash
python3 balance_sim.py --runs 20000
```

It mirrors the `CFG` constants from `game.js`. Tune the `CONFIG` block, re-run until the curve feels right, then copy the values into `CFG` in `game.js` (which is authoritative). Current tuning targets, all met:

- a careless player dies in ~5–10 turns,
- deaths spread across blood loss, infection, fire/acid, syndicates, combat, and betrayal (no single cause dominates),
- reaching **Level 3** is earned, **Level 5** is rare, and **winning is very rare and extremely satisfying**.

## Adding content

Scenes live in `SCENES` (scripted level beats) and `EVENTS` (random pool) in `game.js`. Each choice is an object with a `label` and a `go(S, ctx)` function that mutates the run state `S` (use the `FX` helpers: `FX.bleed`, `FX.burn`, `FX.danger`, `FX.feed`, `FX.kills`, …) and returns `{log:[...]}`, optionally `{dead:true}` / `{win:true}`. Add `reflex:{label, size}` to a choice to gate it behind the timing minigame, or `timed:` seconds on a scene for a countdown.

---
Dark, tense, emotional, fast-paced. Reaching the Fifteen should feel like surviving, not winning.
