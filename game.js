/* =====================================================================
   NEVERLASTING: GRAND SELECTION  —  a deadly survival roguelike
   600 enter. 15 survive. You are Ichido, Contestant #502.
   Engine is DOM-free where possible so it can be balance-tested headless.
   ===================================================================== */
"use strict";

/* ----------------------------- TUNING ------------------------------ */
/* These constants are mirrored in balance_sim.py for offline tuning.   */
const CFG = {
  maxHp: 100, maxComp: 100,
  hungerRate: 7,          // hunger gained per turn
  starveThreshold: 85,    // hunger at which Starving begins
  bleedRate: 13,          // hp lost per turn while Bleeding
  poisonRate: 9,
  burnRate: 5,
  infectionStep: 12,      // infection gained per turn while Infected
  starveDmg: 6,
  exhaustDmg: 4,
  dangerCool: 4,          // danger lost per turn naturally
  // ambush probability from danger
  ambushBase: 0.0, ambushAt50: 0.22, ambushAt75: 0.45, ambushAt90: 0.7,
  // survivor curve targets at the START of each level (600 -> 15)
  survAtLevel: {1:600, 2:430, 3:255, 4:120, 5:34},
};

/* ----------------------------- RNG -------------------------------- */
let RNG = Math.random;                 // swappable for seeded sim
const rnd = () => RNG();
const chance = p => rnd() < p;
const randint = (a,b) => a + Math.floor(rnd()*(b-a+1));
const pick = arr => arr[Math.floor(rnd()*arr.length)];
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

/* --------------------------- EFFECTS ------------------------------ */
function hurt(S,n,cause){ S.hp -= n; if(S.hp<=0){ S.hp=0; if(!S.dead){ S.cause=cause; } } }
function heal(S,n){ S.hp=clamp(S.hp+n,0,S.maxhp); }
function kill(S,cause,ctx){ if(S.dead) return; S.dead=true; S.cause=cause; if(ctx)S.ctx={...S.ctx,...ctx}; }
const FX = {
  bleed:(S)=>{ S.cond.add('Bleeding'); S.bleedRate=Math.max(S.bleedRate||0, CFG.bleedRate); },
  stopBleed:(S)=>{ S.cond.delete('Bleeding'); S.bleedRate=0; },
  infect:(S)=>{ S.cond.add('Infected'); },
  poison:(S)=>{ S.cond.add('Poisoned'); },
  burn:(S,t=2)=>{ S.cond.add('Burned'); S.burnTurns=Math.max(S.burnTurns||0,t); },
  breakArm:(S)=>{ S.cond.add('Broken Arm'); },
  limp:(S)=>{ S.cond.add('Limping'); },
  panic:(S,n=22)=>{ S.composure=clamp(S.composure-n,0,S.maxcomp); if(S.composure<=25)S.cond.add('Panicked'); },
  calm:(S,n=14)=>{ S.composure=clamp(S.composure+n,0,S.maxcomp); if(S.composure>35)S.cond.delete('Panicked'); },
  danger:(S,n)=>{ S.danger=clamp(S.danger+n,0,100); },
  feed:(S,n)=>{ S.hunger=clamp(S.hunger-n,0,100); if(S.hunger<CFG.starveThreshold)S.cond.delete('Starving'); },
  stam:(S,n)=>{ S.stamina=clamp(S.stamina+n,0,100); if(S.stamina>0)S.cond.delete('Exhausted'); },
  kills:(S,n)=>{ S.survivors=Math.max(15,S.survivors-n); },
};

/* ----------------------------- PERKS ------------------------------ */
/* Legacy unlocks (stored in LocalStorage). Equip up to 2 before a run. */
const PERKS = {
  pain_tolerant:{ name:"Pain Tolerant", desc:"+25 max Vitality.", apply:S=>{S.maxhp+=25;S.hp+=25;}, unlock:"Reach Level 2" },
  field_dressing:{ name:"Field Dressing", desc:"Start with 2 bandages; bleeding bleeds slower.", apply:S=>{S.bandages+=2;S.bleedMod=-4;}, unlock:"Reach Level 3" },
  iron_lung:{ name:"Iron Lung", desc:"Hunger rises 35% slower.", apply:S=>{S.hungerRate=Math.round(CFG.hungerRate*0.65);}, unlock:"Survive a syndicate ambush" },
  scarred_veteran:{ name:"Scarred Veteran", desc:"+25 max Composure; start calmer.", apply:S=>{S.maxcomp+=25;S.composure+=25;}, unlock:"Reach Level 4" },
  chainmaster:{ name:"Chainmaster", desc:"Reflex strikes are far more forgiving.", apply:S=>{S.reflexBonus=0.22;}, unlock:"Defeat Genji" },
  cold_survivor:{ name:"Cold Survivor", desc:"Betrayal & sacrifice barely shake you. +ruthless options.", apply:S=>{S.cold=true;}, unlock:"Betray an ally to survive" },
  marked_502:{ name:"The 502 Will", desc:"Once per run, cheat death at 1 HP.", apply:S=>{S.cheatDeath=1;}, unlock:"Win the Grand Selection" },
};

/* --------------------------- DEATH LINES --------------------------- */
const DEATHS = {
  bleed:["The copper chain slipped from {ich}'s red hands. He had stopped feeling them turns ago. He sat down in the dust to rest his eyes, and never opened them.",
         "{ich} pressed the wound the way Saara taught him. It wasn't enough. The white scarf went red, then black, then still."],
  starve:["{ich} hadn't eaten in days. When the band finally came within reach, his arm wouldn't answer. The world thinned to a white ring and closed.",
          "Hunger is patient. It waited until {ich} was alone, then folded him quietly into the cold ground."],
  infection:["The cut on {ich}'s arm had gone the color of old meat. The fever made the arena beautiful and far away. He smiled at something no one else could see.",
             "{ich} burned from the inside out. By the end he was calling for people who weren't in the tournament anymore."],
  fire:["{ich} chose the open field. The acid found his back first. He kept running on instinct long after running stopped mattering.",
        "The flames climbed the wreckage faster than {ich} climbed out of it."],
  acid:["{ich} tried to carry {ally} through the acid rain. His legs gave out first. {ally} kept screaming his name until the rain swallowed both of them.",
        "{ich} pushed across the open field as the sky wept poison. Halfway, his knees stopped being knees."],
  combat:["{ich} swung the chain too late. {enemy}'s blow crushed the air from his ribs before he could breathe.",
          "{enemy} was simply stronger. {ich} understood that in the half-second before the end. He still tried.",
          "The chain found {enemy} — and {enemy} found {ich} first."],
  syndicate:["{ich} promised himself he'd hear them coming. {fac} made no sound at all. The white scarf was the only thing they left.",
             "{fac} didn't fight {ich}. They harvested him, the way the strong always harvest the kind."],
  betrayal:["{ally} promised to keep watch. By morning the food was gone, the fire was out, and the hunters had found {ich}.",
            "{ich} turned to {ally} for help. {ally} had already chosen to live, and the price of that was him.",
            "{ally} used {ich} as bait and didn't look back. The last thing he heard was an apology that wasn't one."],
  exhaustion:["{ich} hadn't slept since the bands. His body simply stopped negotiating and lay down where it stood.",
              "Exhaustion is a kind of drowning on dry land. {ich} went under without a splash."],
  panic:["The fear got there before the enemy did. {ich} froze, and freezing is the same as falling here.",
         "{ich}'s mind broke before his body did. He was somewhere else entirely when the end came for the shell he left behind."],
  sacrifice:["{ich} could not leave {ally}. Everyone agreed that was admirable, right up until it killed them both.",
             "He'd been told a hundred times: carry no one. {ich} carried {ally} anyway, all the way down."],
  fall:["The drop didn't look like much. The landing disagreed.","{ich} trusted the wreckage to hold. It did not."],
  wounds:["Too many small wrongs. {ich} had survived each one and could not survive their sum.","{ich} ran out of body before he ran out of will."],
};
function deathLine(S){
  const cause = S.cause||'wounds';
  const lines = DEATHS[cause]||DEATHS.wounds;
  const ally = (S.ctx&&S.ctx.ally) || (S.allies.find(a=>a.alive)?.name) || "the others";
  const enemy = (S.ctx&&S.ctx.enemy) || "the contestant";
  const fac = (S.ctx&&S.ctx.fac) || "the syndicate";
  return pick(lines).replace(/{ich}/g,"Ichido").replace(/{ally}/g,ally).replace(/{enemy}/g,enemy).replace(/{fac}/g,fac);
}

/* --------------------------- ENDINGS ------------------------------ */
function computeEnding(S){
  if(S.composure<=20) return {id:"bloodstained", title:"Bloodstained Victor",
    text:"Ichido is among the Fifteen. He should feel something. He doesn't. The arena took that too."};
  if(S.flags.betrayed) return {id:"alone", title:"Alone at the Top",
    text:"He survived by spending the people who trusted him. The crowd cheers a name he no longer recognizes."};
  if(S.flags.savedAlly) return {id:"carried", title:"He Carried Them",
    text:"Ichido limps into the Fifteen with someone alive beside him. In a place built to make people monsters, he stayed Ichido."};
  return {id:"survivor", title:"Survivor #502",
    text:"Bronze chain. White scarf. Still breathing. Of six hundred, fifteen remain — and one of them is Ichido."};
}

/* ----------------------------- ALLIES ----------------------------- */
function mkAlly(name, o={}){
  return Object.assign({ name, trust:55, fear:30, hunger:20, loyalty:50, selfish:randint(25,55), trauma:randint(10,40), alive:true }, o);
}
// betrayal pressure: high fear/hunger/selfish, low trust/loyalty -> likely to turn
function betrayalRisk(a){
  return clamp((a.fear*0.4 + a.hunger*0.35 + a.selfish*0.4 + a.trauma*0.2 - a.trust*0.5 - a.loyalty*0.45)/55, 0, 1);
}

/* --------------------------- LEVELS ------------------------------- */
const LEVELS = [
  {n:1, name:"RGB", color:"#5ad1c4", len:6},
  {n:2, name:"Blind Trust", color:"#d6a44e", len:6},
  {n:3, name:"Acid Rain", color:"#9ad15a", len:7},
  {n:4, name:"Syndicate Hunt", color:"#d15a7a", len:7},
  {n:5, name:"Final Fifteen", color:"#e0492f", len:6},
];
// ordered scripted beats per level: [intro, ...mid, finale]
const BEATS = {
  1:["l1_intro","l1_bandsteal","l1_alliance","l1_finale"],
  2:["l2_intro","l2_kyo_test","l2_watch","l2_finale"],
  3:["l3_intro","l3_firstrain","l3_shelter","l3_finale"],
  4:["l4_intro","l4_yellowfang","l4_genji","l4_finale"],
  5:["l5_intro","l5_desperate","l5_asaki","l5_finale"],
};

/* --------------------------- SCENES ------------------------------- */
/* Each scene: {title, text, timed?, choices:[{label, req?, reqText?, reflex?, go}]}.
   go(S,ctx) mutates S and returns {log:[...], dead?, win?}. ctx.grade for reflex.   */
function R(...lines){ return {log:lines}; }   // helper to return a log
const SCENES = {

  /* ---------------- LEVEL 1 — RGB ---------------- */
  l1_intro:(S)=>({
    title:"Contestant #502", flavor:"Level 1 · RGB",
    text:"Six hundred numbers stitched to six hundred chests. A voice from nowhere: secure three matching color bands or be 'retired.' The boy to your left is already eyeing the band on your wrist. The bronze chain is cold against your forearm.",
    choices:[
      {label:"Drift to the edge of the crowd and read the field before anyone reads you.",
        go:S=>{ FX.calm(S,8); FX.danger(S,-5); return R("You melt toward the wall. Patience is a weapon no one searches you for.");}},
      {label:"Snatch the distracted boy's red band now, while the panic is loud enough to hide it.",
        go:S=>{ if(chance(0.7)){ S.bands.r++; FX.danger(S,14); return R("Your fingers are faster than his fear. Red band — yours. But someone two rows back saw."); }
                FX.danger(S,22); FX.panic(S,10); return R("He spins. You miss. Now he knows your face, and so do the three behind him.");}},
      {label:"Announce loudly that you'll trade protection for bands — bait the desperate to come to you.",
        go:S=>{ FX.danger(S,20); if(chance(0.5)){ S.flags.recruiter=true; return R("Two trembling contestants drift over. Useful — and loud. Eyes turn your way.");}
                return R("Only predators answer that kind of call. You feel them marking your position."); }},
    ]
  }),
  l1_bandsteal:(S)=>({
    title:"The Band Pit", flavor:"Level 1 · RGB",
    text:"A dead contestant's bands glint at the bottom of a concrete drainage pit. Two others circle the rim, deciding if you're competition or prey.",
    choices:[
      {label:"Drop in fast, grab the green band, and chain-whip the rim to scatter the circlers.", req:S=>!S.cond.has('Broken Arm'), reqText:"arm is broken",
        reflex:{label:"CRACK THE CHAIN", size:0.9},
        go:(S,c)=>{ if(c.grade==='perfect'){ S.bands.g++; FX.danger(S,8); FX.kills(S,1); return R("The chain sings off the concrete. They flinch back. You climb out grinning, green band in fist.");}
          if(c.grade==='good'){ S.bands.g++; FX.danger(S,16); return R("You get the band, but the whip goes wide. They'll remember you measured them and missed."); }
          FX.danger(S,24); hurt(S,18,'combat'); FX.bleed(S); S.ctx={enemy:"a scavenger"}; return R("You overreach. One of them drops in after you and opens your shoulder before you climb free."); }},
      {label:"Wait for the circlers to fight each other, then take the spoils.",
        go:S=>{ FX.danger(S,4); if(chance(0.55)){ S.bands.g++; S.bands.b++; FX.kills(S,1); return R("Patience pays in blood that isn't yours. You collect two bands from the loser."); }
          FX.danger(S,10); return R("They don't fight. They notice you waiting and decide you're the easier meal. You slip away with nothing."); }},
      {label:"Leave it. Bands you can replace; a reputation as a pit-fighter you can't.",
        go:S=>{ FX.calm(S,6); FX.danger(S,-6); return R("You walk. Somewhere behind you a scream says you chose right."); }},
    ]
  }),
  l1_alliance:(S)=>({
    title:"An Offered Hand", flavor:"Level 1 · RGB",
    text:"A wiry girl with a blue band and steady eyes falls into step beside you. 'Saara,' she says. 'You've got a blue I need and the sense not to die yet. Partners?' Her smile doesn't quite reach her eyes.",
    choices:[
      {label:"Accept, but keep the chain hand free and your bands where you can feel them.",
        go:S=>{ S.allies.push(mkAlly("Saara",{trust:45,selfish:55,loyalty:45})); FX.calm(S,6); return R("Saara nods. An alliance built on mutual suspicion is the only honest kind in here."); }},
      {label:"Refuse and watch her reaction — a real ally wouldn't flinch at a no.",
        go:S=>{ if(chance(0.5)){ FX.danger(S,6); return R("Her smile drops like a mask. 'Your funeral,' she says, and is gone. You believe her.");}
          S.allies.push(mkAlly("Saara",{trust:60,loyalty:60})); return R("She laughs, genuinely. 'Smart. Fine — earn it.' Oddly, you trust her more now."); }},
      {label:"Take her blue band by force while her hand is extended.",
        go:S=>{ if(chance(0.45)){ S.bands.b++; FX.danger(S,18); S.flags.coldstart=true; return R("You break her wrist-lock and run with the band. The arena rewards the ruthless. Your hands won't stop shaking."); }
          hurt(S,16,'combat'); FX.bleed(S); FX.danger(S,20); S.ctx={enemy:"Saara"}; return R("She was ready for it. A blade you didn't see opens your forearm. She vanishes with her band and your blood."); }},
    ]
  }),
  l1_finale:(S)=>({
    title:"Three Bands", flavor:"Level 1 · RGB",
    text:"The cull is closing. You need three matching bands NOW or the floor where you stand goes live. The crowd is a churning trade-floor of theft and murder.",
    timed:13,
    onTimeout:S=>{ hurt(S,40,'combat'); FX.panic(S,30); FX.bleed(S); return R("You hesitate one breath too long. The floor sparks. You dive clear, but the cull takes a piece of you with it."); },
    choices:[
      {label:"Spend everything: trade your spare bands and a promise to complete a matching set fast.",
        go:S=>{ const have=Math.max(S.bands.r,S.bands.g,S.bands.b); if(have>=2 || S.flags.recruiter){ FX.danger(S,6); FX.kills(S,randint(2,4)); return R("You force a matching set together in the chaos. The floor stays dark under your feet. You live to Level 2.");}
          FX.danger(S,14); hurt(S,22,'combat'); FX.kills(S,randint(2,4)); return R("You scrape a set together at the last instant, bleeding for every band. Barely — barely — you advance."); }},
      {label:"Rip a complete set off the nearest weaker contestant and let the floor take them.",
        reflex:{label:"SEIZE THE SET", size:0.75},
        go:(S,c)=>{ FX.danger(S,16); if(c.grade!=='miss'){ FX.kills(S,randint(3,5)); if(!S.cold)FX.panic(S,14); S.flags.l1_kill=true; return R("You tear the bands free and step back. The floor takes them instead of you. You don't watch. You can't stop hearing it.");}
          hurt(S,30,'combat'); FX.bleed(S); FX.kills(S,randint(2,4)); return R("They cling harder than you expected. You win the bands and a deep wound, half a second before the floor goes live."); }},
    ]
  }),

  /* ---------------- LEVEL 2 — BLIND TRUST ---------------- */
  l2_intro:(S)=>({
    title:"The Pairing", flavor:"Level 2 · Blind Trust",
    text:"New rule: you're shackled — figuratively — to a 'partner' chosen by the arena. Yours is Kyo: small, maybe fourteen, hands that won't stop shaking. 'I can't fight,' he whispers. 'But I can hear things coming. Please don't leave me.'",
    choices:[
      {label:"Promise to protect him, and mean it. Give him your spare food.",
        go:S=>{ S.allies.push(mkAlly("Kyo",{trust:80,loyalty:80,selfish:10,fear:55})); S.food=Math.max(0,S.food-1); FX.calm(S,10); S.flags.protectKyo=true; return R("Kyo's shoulders drop an inch. 'Okay,' he breathes. 'Okay.' Something in you steadies too."); }},
      {label:"Keep him close but make it clear: the moment he's a liability, he's on his own.",
        go:S=>{ S.allies.push(mkAlly("Kyo",{trust:45,loyalty:60,fear:60})); return R("Kyo nods too fast. He heard the threat under the deal. He'll be loyal — and terrified, which makes people unpredictable."); }},
      {label:"Plan, quietly, to use him as an early-warning system and bait if needed.",
        go:S=>{ S.allies.push(mkAlly("Kyo",{trust:30,loyalty:40,fear:65})); S.flags.usingKyo=true; if(!S.cold)FX.panic(S,8); return R("You smile and lie. He believes you. The plan sits in your chest like a swallowed stone."); }},
    ]
  }),
  l2_kyo_test:(S)=>({
    title:"What Kyo Heard", flavor:"Level 2 · Blind Trust",
    text:()=>{ const k=S.allies.find(a=>a.name==='Kyo'&&a.alive); return (k?"Kyo grabs your sleeve. 'Three of them. Behind the tankers. They haven't seen us — yet.'":"You hear them first: three contestants behind the tankers, hunting in a pack."); },
    choices:[
      {label:"Set an ambush: chain across the gap, drop the first one, panic the rest.",
        req:S=>!S.cond.has('Broken Arm'), reqText:"arm is broken",
        reflex:{label:"TRIP THE LEAD", size:0.8},
        go:(S,c)=>{ if(c.grade==='perfect'){ FX.kills(S,2); FX.danger(S,6); return R("The lead hunter hits your chain at a sprint and the night does the rest. The other two scatter. Clean.");}
          if(c.grade==='good'){ FX.kills(S,1); FX.danger(S,14); hurt(S,8,'combat'); return R("You drop one but take a glancing blow before the others run."); }
          FX.danger(S,22); hurt(S,22,'combat'); FX.bleed(S); S.ctx={enemy:"a pack hunter"}; return R("The chain snags. All three reach you. You and Kyo barely break loose, both bleeding."); }},
      {label:"Slip away quietly using Kyo's hearing to thread between them.",
        go:S=>{ const k=S.allies.find(a=>a.name==='Kyo'&&a.alive); if(chance(k?0.8:0.55)){ FX.danger(S,-8); FX.calm(S,6); return R("Kyo's ears map a path through the dark. You ghost past them, breath held. His trust in you climbs."); }
          FX.danger(S,16); hurt(S,10,'combat'); return R("A loose pipe betrays you. You break contact, but not before one of them tags you."); }},
      {label:"Shove Kyo toward them as a distraction and run.", req:S=>true,
        go:S=>{ const k=S.allies.find(a=>a.name==='Kyo'&&a.alive); if(k){ k.alive=false; S.flags.betrayed=true; S.ctx={ally:"Kyo"}; if(!S.cold)FX.panic(S,30); FX.danger(S,-10); FX.kills(S,1); return R("You shove him. He doesn't even cry out — just looks at you. You run from the look more than the hunters. (Cold Survivor path unlocked in legacy.)"); }
          FX.danger(S,12); return R("There's no one to sacrifice. You just run, and the running costs you."); }},
    ]
  }),
  l2_watch:(S)=>({
    title:"Someone Must Sleep", flavor:"Level 2 · Blind Trust",
    text:"Two days without sleep. Your hands shake as badly as Kyo's now. Someone has to keep watch while the other rests — and watch means trusting them with your unconscious body.",
    choices:[
      {label:"Sleep, and trust your ally to keep watch.",
        go:S=>{ const a=pick(S.allies.filter(x=>x.alive))||null; FX.stam(S,55); FX.calm(S,12);
          if(a){ a.hunger+=20; const risk=betrayalRisk(a); if(chance(risk*0.8)){ // betrayal while sleeping
              if(chance(0.5)){ S.food=0; S.bandages=0; FX.danger(S,30); a.alive=false; a.left=true; S.flags.betrayed=true; S.ctx={ally:a.name};
                return R(`You wake to a dead fire and empty hands. ${a.name} is gone, and so is everything that kept you alive.`);}
              kill(S,'betrayal',{ally:a.name}); return R(`You never wake up the same way you fell asleep.`);
            } a.trust=clamp(a.trust+8,0,100); return R(`You wake whole. ${a.name} kept their word. In here, that's almost a miracle.`); }
          // alone
          if(chance(0.45)){ FX.danger(S,20); hurt(S,18,'combat'); return R("No one to watch. You wake to hands already on you and fight free, bleeding."); }
          return R("You sleep alone and lucky. The arena didn't find you tonight."); }},
      {label:"Force yourself to stay awake another night. Let the others rest.",
        go:S=>{ FX.stam(S,-20); FX.panic(S,8); const a=pick(S.allies.filter(x=>x.alive)); if(a){a.trust=clamp(a.trust+12,0,100);a.loyalty=clamp(a.loyalty+10,0,100);} 
          if(S.stamina<=0) return R("You hold the watch — and pay for it. Your body is past empty now."); return R("You burn yourself down to keep them safe. They notice. It buys real loyalty — and costs you a piece of your reserves."); }},
      {label:"Tie your wrist to your ally's so neither can move without waking the other.",
        go:S=>{ const a=pick(S.allies.filter(x=>x.alive)); FX.stam(S,40); FX.calm(S,6); if(a){a.trust=clamp(a.trust+5,0,100);} return R("Crude, but it works. You both half-sleep, ready to bolt. Not rest — but not death either."); }},
    ]
  }),
  l2_finale:(S)=>({
    title:"The Liability", flavor:"Level 2 · Blind Trust",
    text:"The gate to Level 3 is a narrow grate that slams on a timer. Kyo trips and twists his ankle thirty feet from it. He looks up at you. The grate begins to lower.",
    timed:11,
    onTimeout:S=>{ const k=S.allies.find(a=>a.name==='Kyo'); if(k)k.alive=false; hurt(S,30,'combat'); FX.panic(S,25); S.ctx={ally:"Kyo"}; return R("You freeze between the boy and the gate. The grate clips you as you dive — and Kyo is on the wrong side of it forever."); },
    choices:[
      {label:"Sprint back, haul Kyo up, and throw him under the grate ahead of you.",
        req:S=>!S.cond.has('Limping'), reqText:"you're limping — you can't sprint",
        reflex:{label:"BEAT THE GRATE", size:0.7},
        go:(S,c)=>{ const k=S.allies.find(a=>a.name==='Kyo'); if(c.grade!=='miss'){ if(k){k.trust=100;k.loyalty=100;} S.flags.savedAlly=true; FX.calm(S,15); FX.stam(S,-25); return R("You get a fist in his collar and hurl him clear, then roll under as the grate bites the floor where your spine was. Kyo is sobbing your name. You made it. Both of you.");}
          if(k)k.alive=false; hurt(S,28,'acid'); FX.bleed(S); S.ctx={ally:"Kyo"}; if(!S.cold)FX.panic(S,25); return R("You're a half-second slow. You make it under; Kyo's hand misses yours by inches as the grate comes down. You'll hear that sound for the rest of the run."); }},
      {label:"Leave him. He's dead weight and you know it. Live.",
        go:S=>{ const k=S.allies.find(a=>a.name==='Kyo'); if(k){k.alive=false;k.left=true;} S.flags.betrayed=true; S.ctx={ally:"Kyo"}; if(!S.cold)FX.panic(S,28); else FX.panic(S,8); FX.danger(S,-8); return R("You turn and go. Kyo doesn't beg. That's worse. The grate closes on the sound of him not begging."); }},
      {label:"Jam the chain into the grate's track to buy seconds for you both.",
        req:S=>!S.cond.has('Broken Arm'), reqText:"arm is broken",
        go:S=>{ const k=S.allies.find(a=>a.name==='Kyo'); if(chance(0.6)){ if(k){k.trust=100;k.loyalty=100;} S.flags.savedAlly=true; FX.danger(S,8); return R("The chain screams against the track and holds — just long enough. You both spill through. The chain is mangled but you are not."); }
          if(k)k.alive=false; hurt(S,20,'combat'); FX.breakArm(S); S.ctx={ally:"Kyo"}; return R("The grate wins the contest with your chain — and nearly takes your arm with it. You make it; Kyo does not."); }},
    ]
  }),

  /* ---------------- LEVEL 3 — ACID RAIN ---------------- */
  l3_intro:(S)=>({
    title:"The Sky Turns", flavor:"Level 3 · Acid Rain",
    text:"The arena's ceiling clouds over wrong — yellow-grey, sweating. A drop lands on the concrete and hisses a hole in it. The rule is unspoken and obvious: when it rains, anything exposed dies.",
    choices:[
      {label:"Map every overhang, pipe, and wreck you can shelter under before the first storm.",
        go:S=>{ S.flags.mappedShelter=true; FX.calm(S,8); FX.stam(S,-10); return R("You spend precious energy learning the bones of the place. Knowledge of where to hide may be worth more than the chain here."); }},
      {label:"Hoard rainwater catchers and rags to neutralize splashes — prep over position.",
        go:S=>{ S.bandages++; S.flags.acidRags=true; FX.danger(S,4); return R("You rig rag-wraps soaked in runoff. Crude armor against the sky. It won't save you in the open — but a splash won't end you."); }},
      {label:"Push deep into the arena now while it's dry to claim the only solid bunker.",
        go:S=>{ FX.danger(S,16); if(chance(0.55)){ S.flags.bunker=true; FX.calm(S,6); return R("You reach a sealed maintenance bunker first and claim it. Others will come for it. Let them.");}
          FX.danger(S,10); hurt(S,12,'combat'); return R("Someone else had the same idea, and got there first. You're driven off, into the open, as the sky begins to sweat."); }},
    ]
  }),
  l3_firstrain:(S)=>({
    title:"It Begins", flavor:"Level 3 · Acid Rain",
    text:"A siren you feel in your teeth. The first true downpour is seconds away and you're caught in the open yard. Steam is already rising where the early drops land.",
    timed:9,
    onTimeout:S=>{ hurt(S, S.flags.acidRags?28:55,'acid'); FX.burn(S,3); FX.panic(S,25); return R("You move too late. The rain finds you in the open. Skin, then more than skin. You survive — barely — and the burns won't forgive you soon."); },
    choices:[
      {label:"Sprint for the pipe-stack overhang.", req:S=>!S.cond.has('Limping')&&!S.cond.has('Exhausted'), reqText:"you can't sprint right now",
        reflex:{label:"RUN!", size:0.78},
        go:(S,c)=>{ FX.stam(S,-20); if(c.grade!=='miss'){ FX.danger(S,-6); FX.calm(S,4); return R("You hit the overhang as the sky opens. The rain hammers the metal an inch from your face. You're shaking, but whole.");}
          hurt(S,30,'acid'); FX.burn(S); return R("You almost make it. The leading edge of the storm catches your shoulder and back. You reach shelter wearing the proof."); }},
      {label:"Dive under the half-crushed truck right beside you and pull metal over yourself.",
        go:S=>{ if(chance(S.flags.mappedShelter?0.85:0.6)){ FX.calm(S,4); return R("You wedge under the chassis and drag a door-panel across the gap. The rain rages; you don't. Smart."); }
          hurt(S,22,'acid'); FX.burn(S); return R("The truck's belly has a hole you didn't see. The rain pours through onto your legs before you scramble deeper."); }},
      {label:"Grab the contestant frozen next to you and shelter together under your rags.",
        go:S=>{ FX.danger(S,6); if(S.flags.acidRags && chance(0.6)){ S.allies.push(mkAlly("a stranger",{trust:50,loyalty:40})); FX.calm(S,8); return R("You throw half your rags over a stranger and haul them under cover. They owe you their skin now. An ally, bought in acid.");}
          hurt(S,26,'acid'); FX.burn(S); if(!S.cold)FX.panic(S,10); return R("There isn't enough cover for two. You both get burned, and they shove you into the worst of it to save themselves."); }},
    ]
  }),
  l3_shelter:(S)=>({
    title:"The Long Storm", flavor:"Level 3 · Acid Rain",
    text:"The rain won't stop. Your shelter is cramped, the air is poison-sour, and your stomach has folded in on itself. Outside, the downpour eats everything that moves.",
    choices:[
      {label:"Wait it out. Ration what you have and let the danger cool.",
        go:S=>{ FX.danger(S,-16); FX.feed(S,-5); FX.calm(S,6); FX.stam(S,15); if(S.cond.has('Bleeding')&&S.bandages>0){S.bandages--;FX.stopBleed(S);return R("You wait, and bind your wounds in the dark. The storm's fury becomes a kind of safety. Bleeding stopped.");} return R("You wait. Hunger gnaws, but the hunters can't reach you through the rain. The danger bleeds away."); }},
      {label:"Risk a dash to a swollen body nearby for its ration pack between rain-pulses.",
        timed:8,
        onTimeout:S=>{ hurt(S,35,'acid'); FX.burn(S); return R("You misjudge the pulse. The rain returns while you're reaching, and reaching becomes the last thing that hand does well."); },
        go:S=>{ if(chance(0.5)){ S.food+=2; FX.feed(S,40); FX.danger(S,10); return R("You time the lull perfectly, snatch the pack, and fold back into cover. Real food. Your body nearly weeps."); }
          hurt(S,30,'acid'); FX.burn(S); FX.danger(S,8); return R("The lull is shorter than you bet your life on. You get the pack and a coat of acid for it."); }},
      {label:"Treat your wounds with acid-runoff — agonizing, but it kills infection.",
        req:S=>S.cond.has('Infected')||S.cond.has('Bleeding'), reqText:"no wounds to treat",
        go:S=>{ FX.panic(S,12); if(chance(0.7)){ S.cond.delete('Infected'); S.infection=0; if(S.bandages>0){S.bandages--;FX.stopBleed(S);} return R("You scream into your own arm as the runoff cauterizes the rot. But the wound is clean now. You bought turns."); }
          hurt(S,18,'fire'); FX.burn(S); return R("Too much runoff. You trade infection for a chemical burn that may be no better."); }},
    ]
  }),
  l3_finale:(S)=>({
    title:"Across the Drowning Yard", flavor:"Level 3 · Acid Rain",
    text:()=>{ const k=S.allies.find(a=>a.alive); return "The only exit is across a wide yard, and the rain is constant now — no more lulls. "+(k?`${k.name} can't run as fast as you. `:"")+"The acid will catch anything not already at the door. You have one timed window when the spray thins.";},
    timed:10,
    onTimeout:S=>{ hurt(S,60,'acid'); FX.burn(S,3); FX.panic(S,30); return R("You wait for a perfect window that never comes. When you finally break for it, the rain is total. You reach the door wearing most of the storm."); },
    choices:[
      {label:"Run flat-out alone the instant the spray thins. Carry no one.",
        req:S=>!S.cond.has('Limping'), reqText:"you're limping",
        reflex:{label:"DEAD SPRINT", size:0.72},
        go:(S,c)=>{ const k=S.allies.find(a=>a.alive); FX.stam(S,-25); if(c.grade!=='miss'){ if(k && !S.flags.cold){ /*leaving them*/ } FX.calm(S,2); let r="You cross in a streak of motion and hit the door as the spray slams back down behind you. Alive."; if(k){k.alive=false;k.left=true;S.flags.betrayed=true;S.ctx={ally:k.name}; if(!S.cold)FX.panic(S,18); r+=` You didn't look back at ${k.name}. You couldn't afford to.`;} return R(r);}
          hurt(S,40,'acid'); FX.burn(S,2); return R("Your timing is off by a heartbeat. The rain catches your legs at the midpoint. You crawl the last yards on burning hands."); }},
      {label:"Carry your ally across, slower but together — and pray your timing is perfect.",
        req:S=>S.allies.some(a=>a.alive) && !S.cond.has('Broken Arm'), reqText:"no one to carry / arm broken",
        reflex:{label:"CARRY THEM", size:0.6},
        go:(S,c)=>{ const k=S.allies.find(a=>a.alive); FX.stam(S,-35); if(c.grade==='perfect'){ S.flags.savedAlly=true; FX.calm(S,16); return R(`You sling ${k?k.name:"them"} across your back and run like the dead are chasing. You hit the door together as the sky comes down. You carried them. You actually did.`);}
          if(c.grade==='good'){ S.flags.savedAlly=true; hurt(S,28,'acid'); FX.burn(S); FX.bleed(S); return R(`You both make it — but the rain taxes you for the weight. You're burned and bleeding, and ${k?k.name:"they"} are alive because of it.`);}
          if(k){k.alive=false;S.ctx={ally:k.name};} kill(S,'acid',{ally:k?k.name:undefined}); return R("You're too slow under the weight. The rain takes you both in the middle of the yard."); }},
      {label:"Hide and wait for the rain to end naturally, accepting the danger of staying.",
        go:S=>{ FX.danger(S,30); if(chance(0.4)){ FX.calm(S,4); return R("You gamble on the storm ending. It does — but you've been here far too long, and something out there has your scent now."); }
          hurt(S,20,'syndicate'); FX.bleed(S); FX.danger(S,20); S.ctx={fac:"a hunter"}; return R("Waiting was the wrong verb. While the sky emptied, a hunter found your hole and nearly emptied you."); }},
    ]
  }),

  /* ---------------- LEVEL 4 — SYNDICATE HUNT ---------------- */
  l4_intro:(S)=>({
    title:"The Wolves Arrive", flavor:"Level 4 · Syndicate Hunt",
    text:"The free-for-all is over. Three syndicates have entered the cull to harvest survivors: Yellow Fang's scavengers, the Red Menace's brutes, and the silent Black Shadow. You are no longer a contestant. You are inventory.",
    choices:[
      {label:"Go to ground completely — no fires, no fights, move only when you must.",
        go:S=>{ FX.danger(S,-20); FX.stam(S,-10); FX.feed(S,-5); return R("You become a rumor. It costs comfort and calories, but the wolves can't hunt what leaves no trace."); }},
      {label:"Pick off a lone Yellow Fang scout for their gear and intel.", reflex:{label:"AMBUSH THE SCOUT", size:0.7},
        go:(S,c)=>{ S.ctx={enemy:"a Yellow Fang scout",fac:"Yellow Fang"}; if(c.grade==='perfect'){ S.food+=2;S.bandages++; S.flags.killedScout=true; FX.kills(S,1); FX.danger(S,10); return R("You take the scout before a sound escapes. Gear, food, and a map of Fang patrols. Predator, briefly.");}
          if(c.grade==='good'){ hurt(S,16,'combat'); FX.bleed(S); S.flags.killedScout=true; FX.danger(S,18); return R("You win, but messily. The scout marks you with a blade before going down. Now Yellow Fang has your blood-scent."); }
          hurt(S,38,'combat'); FX.bleed(S); FX.danger(S,30); return R("Scouts are scouts because they're hard to surprise. It nearly guts you and escapes screaming your number to the pack."); }},
      {label:"Try to make contact with Miki, the Black Shadow operative rumored to spare the worthy.",
        go:S=>{ FX.danger(S,12); if(chance(0.5)){ S.flags.metMiki=true; return R("You leave the right signs in the right places. Something in the dark watches you and... doesn't kill you. Yet."); }
          FX.danger(S,18); return R("You signal into the dark and the dark signals back — wrong people. You spend the night losing a tail you should never have invited."); }},
    ]
  }),
  l4_yellowfang:(S)=>({
    title:"Yellow Fang's Net", flavor:"Level 4 · Syndicate Hunt",
    text:"You walk into a corridor strung with tripwire and bone-charms — a Yellow Fang killbox. Three of them at the far end haven't noticed you. Threat: 4. There's a vent above and a dead contestant's body at your feet with something useful clipped to its belt.",
    choices:[
      {label:"Ghost back out the way you came, slow and silent. Don't take the bait.",
        go:S=>{ if(chance(S.flags.killedScout?0.55:0.72)){ FX.danger(S,-6); FX.calm(S,4); return R("Inch by inch, you withdraw. The bone-charms stay silent. You were never here."); }
          FX.danger(S,24); hurt(S,18,'syndicate'); FX.bleed(S); S.ctx={fac:"Yellow Fang"}; return R("A charm clicks under your heel. The corridor erupts. You break free into the vents, but not unmarked."); }},
      {label:"Cut the dead contestant's smoke-charge free and blow the killbox.", reflex:{label:"TIME THE CHARGE", size:0.68},
        go:(S,c)=>{ S.ctx={fac:"Yellow Fang"}; if(c.grade==='perfect'){ FX.kills(S,3); FX.danger(S,-10); S.flags.brokeFang=true; return R("You roll the charge down the corridor and duck the vent. The killbox kills its makers. The arena gets quieter by three.");}
          if(c.grade==='good'){ FX.kills(S,2); hurt(S,20,'syndicate'); FX.burn(S); FX.danger(S,8); return R("The blast lands late. You take two of them and a faceful of heat for it."); }
          hurt(S,45,'syndicate'); FX.burn(S,3); FX.bleed(S); FX.danger(S,20); return R("The charge cooks off in your hand. You survive the killbox and nearly die to your own plan."); }},
      {label:"Charge them head-on with the chain — Threat 4, no preparation.",
        req:S=>!S.cond.has('Broken Arm')&&!S.cond.has('Limping'), reqText:"too injured to charge",
        go:S=>{ S.ctx={enemy:"Yellow Fang hunters",fac:"Yellow Fang"}; if(chance(0.18)){ FX.kills(S,3); hurt(S,30,'combat'); FX.bleed(S); FX.breakArm(S); return R("Insane. Glorious. You wade through all three and live, but your chain arm is shattered and you are painted in blood, mostly not yours."); }
          kill(S,'syndicate',{enemy:"Yellow Fang",fac:"Yellow Fang"}); return R("Three trained hunters in a prepared killbox. Courage is not a counter to that math."); }},
    ]
  }),
  l4_genji:(S)=>({
    title:"Genji of the Iron Leg", flavor:"Level 4 · Syndicate Hunt",
    text:"He's waiting for you on the only bridge: Genji, the Red Menace enforcer, one leg replaced with a piston of black iron. 'Five hundred and two,' he says, almost kind. 'You've come further than most cattle.' Threat: 4. There is no way around him.",
    choices:[
      {label:"Wrap the copper chain around Genji's iron leg and pull — risking your arm if he counters.",
        req:S=>!S.cond.has('Broken Arm'), reqText:"your chain arm is broken — you can't",
        reflex:{label:"CHAIN THE LEG", size:0.62},
        go:(S,c)=>{ S.ctx={enemy:"Genji"}; if(c.grade==='perfect'){ FX.kills(S,1); S.flags.killedGenji=true; FX.danger(S,8); FX.calm(S,6); return R("The chain bites the joint and you HEAVE. The iron leg screams, locks, and Genji goes off the bridge with it. You keep your arm. You earned that.");}
          if(c.grade==='good'){ FX.kills(S,1); S.flags.killedGenji=true; hurt(S,26,'combat'); FX.breakArm(S); FX.bleed(S); return R("You take him down — but his counter catches your forearm and the iron does what iron does. Genji falls. So does your arm.");}
          kill(S,'combat',{enemy:"Genji"}); return R("You commit a fraction too early. Genji's iron leg crushes your ribs before the chain even tightens."); }},
      {label:"Bait his charge and let the rotten bridge-planks under his weight do the work.",
        reflex:{label:"DODGE THE CHARGE", size:0.7},
        go:(S,c)=>{ S.ctx={enemy:"Genji"}; if(c.grade!=='miss'){ if(chance(0.7)){ S.flags.killedGenji=true; FX.kills(S,1); FX.stam(S,-15); return R("You sidestep the piston-charge at the last instant. The bridge can't hold a charging iron leg. The planks give. Genji doesn't get up.");} hurt(S,20,'combat'); FX.bleed(S); return R("You dodge, but he recovers on the bridge's edge and tags you as he passes. At least you're past him.");}
          kill(S,'combat',{enemy:"Genji"}); return R("You read the charge wrong. The iron leg finds you mid-bridge and the river finds you after."); }},
      {label:"Refuse to fight — offer him intel on a bigger target to let you pass.",
        go:S=>{ if(S.flags.metMiki||S.flags.brokeFang||chance(0.4)){ FX.danger(S,6); return R("You trade him something true about Black Shadow's movements. Genji studies you, then steps aside. 'Run, cattle.' You run."); }
          hurt(S,28,'combat'); FX.bleed(S); FX.danger(S,16); S.ctx={enemy:"Genji"}; return R("'I don't barter with cattle,' Genji says, and the iron leg moves before the sentence ends. You escape, broken in places."); }},
    ]
  }),
  l4_finale:(S)=>({
    title:"Vidar in the Dark", flavor:"Level 4 · Syndicate Hunt",
    text:"The exit to the Final Fifteen lies behind a figure you've heard whispered about: Vidar. Black Shadow's apex. He doesn't draw a weapon. He doesn't need to. Threat: 5. You cannot win this. You can only survive it.",
    timed:12,
    onTimeout:S=>{ if(S.cheatDeath){S.cheatDeath=0;S.hp=1;FX.bleed(S);return R("Vidar's hand closes on your throat — and something in you refuses. You twist free at the cost of everything, alive by a thread.");} kill(S,'syndicate',{enemy:"Vidar",fac:"Black Shadow"}); return R("You hesitate before a Threat 5. Hesitation is all the opening Vidar ever needs."); },
    choices:[
      {label:"Don't fight. Drop the chain, show your throat, and gamble that Vidar respects survivors.",
        go:S=>{ S.ctx={enemy:"Vidar",fac:"Black Shadow"}; if(S.flags.metMiki || S.flags.killedGenji){ FX.calm(S,10); FX.danger(S,-20); S.flags.sparedByVidar=true; return R("Vidar tilts his head. 'Miki spoke of you.' / 'You felled Genji.' He steps aside like a closing door reopening. 'Go. Become the Fifteen. Amuse me.'"); }
          if(chance(0.35)){ FX.danger(S,-10); return R("Vidar regards the bared throat for a long, long moment. Then, bored: 'Not today.' You back through the door on shaking legs."); }
          kill(S,'syndicate',{enemy:"Vidar",fac:"Black Shadow"}); return R("Vidar finds your surrender uninteresting. Uninteresting things are removed."); }},
      {label:"Throw everything into one chain strike and sprint past in the opening.", reflex:{label:"ALL OR NOTHING", size:0.5},
        req:S=>!S.cond.has('Broken Arm'), reqText:"arm is broken — you have nothing to throw",
        go:(S,c)=>{ S.ctx={enemy:"Vidar",fac:"Black Shadow"}; if(c.grade==='perfect'){ hurt(S,30,'combat'); FX.bleed(S); FX.danger(S,10); return R("The chain actually CONNECTS — Vidar's eyebrow rises a millimeter, which from him is awe. You're past the door before he resets, bleeding from the price of touching a legend.");}
          if(S.cheatDeath){S.cheatDeath=0;S.hp=1;FX.bleed(S);FX.breakArm(S);return R("He breaks you in one motion — but the 502 Will drags you through the door at 1 HP, arm hanging wrong.");}
          kill(S,'combat',{enemy:"Vidar"}); return R("You attack a Threat 5 head-on. Vidar lets you commit, then ends it with the economy of a man swatting a fly."); }},
      {label:"Slip into the maintenance crawlspace you spotted and bypass him entirely.",
        req:S=>!S.cond.has('Limping'), reqText:"limping — too slow for the crawlspace",
        go:S=>{ if(chance(S.flags.mappedShelter?0.6:0.45)){ FX.danger(S,-8); FX.stam(S,-15); return R("You fold into the crawlspace and worm past in the dark. When you emerge on the far side, Vidar is simply... gone. You don't question it."); }
          S.ctx={enemy:"Vidar"}; if(S.cheatDeath){S.cheatDeath=0;S.hp=1;return R("Vidar's hand is waiting at the crawlspace's mouth. The 502 Will tears you free at the final inch.");} kill(S,'syndicate',{enemy:"Vidar"}); return R("Vidar was already at the other end. He always is. The dark closes."); }},
    ]
  }),

  /* ---------------- LEVEL 5 — FINAL FIFTEEN ---------------- */
  l5_intro:(S)=>({
    title:"What's Left", flavor:"Level 5 · Final Fifteen",
    text:()=>`Fewer than ${S.survivors} remain of six hundred. The arena shrinks by the hour, herding the last desperate survivors together. There are no weak contestants left — only people who have done what you have done to be here. Everyone is a Threat now.`,
    choices:[
      {label:"Find high ground, treat every wound you can, and let the desperate kill each other.",
        go:S=>{ FX.danger(S,-10); if(S.bandages>0&&S.cond.has('Bleeding')){S.bandages--;FX.stopBleed(S);} FX.calm(S,8); FX.kills(S,randint(2,4)); return R("You take the water tower and watch the final hunt thin itself out below. Patience, one last time."); }},
      {label:"Hunt proactively — in the Final Fifteen, the watcher becomes prey.",
        reflex:{label:"FIRST STRIKE", size:0.66},
        go:(S,c)=>{ S.ctx={enemy:"a finalist"}; if(c.grade!=='miss'){ FX.kills(S,randint(1,2)); FX.danger(S,12); return R("You decide the math: better the hunter. You take a finalist who was about to take someone else.");}
          hurt(S,30,'combat'); FX.bleed(S); FX.danger(S,18); return R("Everyone left is dangerous. Your target was faster than your read. You break off, bleeding."); }},
      {label:"Try to broker a temporary truce among the last few to outlast the arena's shrink.",
        go:S=>{ FX.danger(S,8); if(S.composure>50 && chance(0.55)){ S.flags.truce=true; FX.calm(S,6); return R("Improbably, your voice still carries weight. A brittle truce holds — for now. Allies of convenience in the last hour."); }
          if(!S.cold)FX.panic(S,10); return R("Trust died several levels ago. Your offer is met with a thrown blade. The truce idea dies with the contestant who lunged."); }},
    ]
  }),
  l5_desperate:(S)=>({
    title:"The Begging", flavor:"Level 5 · Final Fifteen",
    text:"A contestant you don't know collapses in front of you, hands empty, weeping. 'Please. I have a kid outside. I won't fight you. Just let me follow you to the end.' Behind their tears, you can't tell if it's true.",
    choices:[
      {label:"Let them follow. Even now, refuse to become the thing the arena wants.",
        go:S=>{ const a=mkAlly("the beggar",{trust:40,loyalty:30,selfish:60,fear:70,trauma:60}); S.allies.push(a); FX.calm(S,12); if(betrayalRisk(a)>0.6 && chance(0.5)){ FX.danger(S,20); return R("You let them follow. Your composure steadies — but you've taken a frightened, hungry stranger to your back in the deadliest hour. That math rarely closes well.");} return R("You let them follow. It's a foolish, human thing to do. It's the reason you're still you."); }},
      {label:"Refuse coldly and move on. You can't afford passengers in the Fifteen.",
        go:S=>{ if(S.cold){return R("You step over them without slowing. Nothing in you protests anymore. Maybe that's the cost of the chain.");} FX.panic(S,12); FX.danger(S,-4); return R("You leave them weeping. It's the right call. It doesn't feel like one. The look follows you."); }},
      {label:"Demand proof — make them give up their hidden weapon first.",
        go:S=>{ if(chance(0.55)){ S.flags.foundBlade=true; return R("'I knew it,' you say, as they reluctantly surrender the blade they'd hidden. The begging was bait. You walk away armed and alive."); }
          hurt(S,24,'combat'); FX.bleed(S); S.ctx={enemy:"the false beggar"}; if(!S.cold)FX.panic(S,8); return R("There was a blade — and they used it the instant they were found out. You win, barely, and learn the lesson again: everyone here lies."); }},
    ]
  }),
  l5_asaki:(S)=>({
    title:"Asaki's Ultimatum", flavor:"Level 5 · Final Fifteen",
    text:()=>{ const a=S.allies.find(x=>x.alive); return `Asaki drops down beside you — all spiked hair and razor grin, a Black Shadow blade in each hand. 'Five-oh-two. I like you, so here's a gift: the gate's that way. But it only opens for fourteen plus me.' She nods at ${a?a.name:"the open ground"}. ${a?`'Your little stray doesn't make the count. Leave them, or I make the count myself.'`:`'Lucky you travel light.'`}`; },
    choices:[
      {label:"Leave your ally behind as Asaki demands.", req:S=>S.allies.some(a=>a.alive), reqText:"you travel alone",
        go:S=>{ const a=S.allies.find(x=>x.alive); if(a){a.alive=false;a.left=true;} S.flags.betrayed=true; S.ctx={ally:a?a.name:undefined}; if(!S.cold)FX.panic(S,26); else FX.panic(S,6); FX.calm(S,4); return R(`You step through. ${a?a.name:"They"} doesn't follow. Asaki claps you on the shoulder like a friend. 'Smart. See? You belong here.' You hate that she's right.`); }},
      {label:"Refuse — put the chain between Asaki and your ally.", req:S=>S.allies.some(a=>a.alive), reqText:"you travel alone",
        reflex:{label:"STAND YOUR GROUND", size:0.55},
        go:(S,c)=>{ S.ctx={enemy:"Asaki"}; if(c.grade==='perfect'){ S.flags.savedAlly=true; FX.calm(S,14); FX.danger(S,10); return R("You move faster than she expected — fast enough that her grin turns genuine. 'Oh, I LIKE you.' She backs off, laughing. 'Keep your stray. Earn it.' You both pass.");}
          if(c.grade==='good'){ const a=S.allies.find(x=>x.alive); S.flags.savedAlly=true; hurt(S,30,'combat'); FX.bleed(S); return R("You can't beat Asaki — but you make protecting them cost her more than it's worth. She leaves, bored. You're bleeding; they're alive.");}
          if(S.cheatDeath){S.cheatDeath=0;S.hp=1;return R("Asaki opens you up in a blink — the 502 Will keeps your heart beating where it shouldn't. She's already gone.");} kill(S,'combat',{enemy:"Asaki"}); return R("You raise the chain against a Black Shadow blade-dancer for someone else's life. It is the most Ichido thing you have ever done. It is the last."); }},
      {label:"Travel alone and simply walk through the gate.", req:S=>!S.allies.some(a=>a.alive), reqText:"someone is with you",
        go:S=>{ FX.calm(S,6); return R("You came this far alone. You step through alone. Asaki shrugs and lets you pass."); }},
    ]
  }),
  l5_finale:(S)=>({
    title:"The Fifteenth Place", flavor:"Level 5 · Final Fifteen",
    text:()=>`The arena has shrunk to a single lit circle. ${Math.max(15,S.survivors)} stand. When the count hits fifteen, it stops — forever. You are one body away. The contestant across from you knows it too.`,
    timed:14,
    onTimeout:S=>{ if(S.cheatDeath){S.cheatDeath=0;S.hp=1;FX.bleed(S);return R("You wait too long and they're on you — the 502 Will is the only reason you cross the line at all, painting it red.");} kill(S,'combat',{enemy:"the last contestant"}); return R("In the final circle, the one who moves second dies. You moved second."); },
    choices:[
      {label:"Strike first with everything left in the chain.", req:S=>!S.cond.has('Broken Arm'), reqText:"arm is broken",
        reflex:{label:"THE LAST STRIKE", size:0.6},
        go:(S,c)=>{ S.ctx={enemy:"the last contestant"}; if(c.grade!=='miss'){ FX.kills(S,1); return {win:true, log:["The chain finds them before they find you. The count hits fifteen. The lights stop. Silence — then a roar from a crowd you'll never see.","You are Survivor #502."]};}
          if(S.cheatDeath){S.cheatDeath=0;S.hp=1;FX.bleed(S);return R("They beat your strike — but you don't fall. Not yet. The 502 Will buys one more breath.");} kill(S,'combat',{enemy:"the last contestant"}); return R("Your last strike is a hair slow. In the final circle, a hair is everything."); }},
      {label:"Let them commit, then use their momentum and the chain together.",
        reflex:{label:"COUNTER", size:0.55},
        go:(S,c)=>{ S.ctx={enemy:"the last contestant"}; if(c.grade==='perfect'){ FX.kills(S,1); return {win:true, log:["You wait. They lunge. You step aside and the chain does the rest. The count stops at fifteen.","Bronze chain. White scarf. Still breathing."]};}
          if(c.grade==='good'){ hurt(S,35,'combat'); FX.bleed(S); FX.kills(S,1); return {win:true, log:["The counter half-works. You both fall — but only one of you gets up, swaying, into the Fifteen.","You win. You will be a long time deciding whether it was worth it."]};}
          if(S.cheatDeath){S.cheatDeath=0;S.hp=1;return R("The counter fails — the 502 Will refuses the ending by an inch.");} kill(S,'combat',{enemy:"the last contestant"}); return R("You misread the lunge. The counter becomes the killing blow — theirs."); }},
    ]
  }),
};

/* ----------------------- RANDOM EVENTS ---------------------------- */
/* Eligible by level range; chosen when the queue calls for a 'rand'.  */
const EVENTS = [
  { id:"ev_food_stolen", lvl:[1,5], cond:S=>S.allies.some(a=>a.alive), w:3, scene:(S)=>({
    title:"Lighter Than It Should Be", text:()=>{ const a=pick(S.allies.filter(x=>x.alive)); return `You reach for your ration and find air. ${a.name} won't meet your eyes.`; },
    choices:[
      {label:"Confront them — demand it back, hand on the chain.",
        go:S=>{ const a=pick(S.allies.filter(x=>x.alive)); if(!a) return R("There's no one to confront. The food is just gone."); const risk=betrayalRisk(a);
          if(chance(risk)){ a.alive=false;a.left=true;S.flags.betrayed=true;S.ctx={ally:a.name};FX.danger(S,16);if(!S.cold)FX.panic(S,15);return R(`${a.name} bolts rather than face you, taking the food into the dark. One less back to trust.`);}
          a.trust=clamp(a.trust-10,0,100);S.food=Math.max(0,S.food)+1;FX.feed(S,15);return R(`${a.name} flinches and hands it back. 'I was starving,' they whisper. So are you. You let it go — this once.`);}},
      {label:"Say nothing, but never sleep near them again.",
        go:S=>{ const a=pick(S.allies.filter(x=>x.alive)); if(a){a.trust=clamp(a.trust-5,0,100);a.selfish+=10;} FX.feed(S,-5); FX.calm(S,-6); return R("You let it pass and file it away. Hunger gnaws; so does the knowledge."); }},
    ]})},
  { id:"ev_scream", lvl:[2,5], w:3, scene:(S)=>({
    title:"A Scream, Close By", text:"A scream tears the dark — young, terrified, maybe someone you could save. Or bait. The arena uses both.",
    choices:[
      {label:"Go toward it. You can't not.",
        go:S=>{ FX.danger(S,18); if(chance(0.5)){ S.allies.push(mkAlly("a rescued contestant",{trust:65,loyalty:55})); FX.calm(S,8); return R("It's real. You reach a cornered contestant and chain their attacker off them. They cling to you, gasping thanks. An ally, earned."); }
          hurt(S,22,'syndicate'); FX.bleed(S); S.ctx={fac:"hunters"}; return R("It's bait. The scream was a recording. The trap is not. You break free bleeding, cursing your own decency."); }},
      {label:"Move away from the sound, fast and quiet.",
        go:S=>{ FX.danger(S,-6); if(!S.cold)FX.panic(S,8); return R("You go the other way. The scream cuts off behind you. You don't look back. You're getting good at not looking back."); }},
    ]})},
  { id:"ev_infect", lvl:[2,5], cond:S=>S.cond.has('Bleeding')||S.cond.has('Burned'), w:2, scene:(S)=>({
    title:"The Wound Talks", text:"Your wound has gone hot and yellow at the edges. Infection. Untreated, it will cook you from the inside within a few turns.",
    choices:[
      {label:"Sear it shut with a heated blade — agony now to live later.",
        go:S=>{ FX.panic(S,14); hurt(S,8,'fire'); if(chance(0.8)){ S.cond.delete('Infected'); S.infection=0; FX.stopBleed(S); return R("You bite down on the chain and sear the wound. The scream you swallow nearly chokes you. But it's clean."); } FX.infect(S); return R("Your hand shakes too much. You burn yourself without closing it. Now you're burned AND infected."); }},
      {label:"Wrap it and hope your body wins the race.", req:S=>S.bandages>0, reqText:"no bandages",
        go:S=>{ S.bandages--; if(chance(0.55)){ FX.stopBleed(S); S.cond.delete('Infected'); return R("Clean wrap, clean luck. The heat fades. You bought your body the time it needed."); } FX.infect(S); return R("The wrap isn't enough. The infection sets in deeper. The clock is ticking now."); }},
      {label:"Ignore it and push on.",
        go:S=>{ FX.infect(S); FX.danger(S,4); return R("No time, no tools. You walk it off and pretend the heat in your arm is just exertion. It is not."); }},
    ]})},
  { id:"ev_trap", lvl:[3,5], w:2, scene:(S)=>({
    title:"Yellow Fang Snare", text:"Your foot brushes a wire a heartbeat before it pulls taut. A Yellow Fang snare — designed to hang you for collection.",
    timed:7,
    onTimeout:S=>{ hurt(S,30,'syndicate'); FX.bleed(S); FX.danger(S,20); S.ctx={fac:"Yellow Fang"}; return R("You freeze. The snare doesn't. It hauls you off your feet and leaves you swinging, bleeding, until you saw yourself free with the chain — having announced your location to everyone."); },
    choices:[
      {label:"Cut the wire with the chain before it fully tensions.", reflex:{label:"CUT IT", size:0.8},
        go:(S,c)=>{ if(c.grade!=='miss'){ FX.danger(S,4); FX.calm(S,4); return R("The chain shears the wire clean. The snare collapses, harmless. You breathe again."); } hurt(S,24,'syndicate'); FX.bleed(S); FX.danger(S,16); S.ctx={fac:"Yellow Fang"}; return R("Too slow. The snare yanks before you cut. You hit the ground hard, then crawl free, marked and bleeding."); }},
      {label:"Drop and roll out of the snare's radius.", req:S=>!S.cond.has('Broken Arm'), reqText:"can't, arm's broken",
        go:S=>{ if(chance(0.6)){ FX.stam(S,-10); return R("You hit the dirt and roll clear as the snare snaps shut on empty air."); } hurt(S,18,'syndicate'); FX.bleed(S); S.ctx={fac:"Yellow Fang"}; return R("The snare catches your ankle as you roll. You tear free, but it takes skin and blood with it."); }},
    ]})},
  { id:"ev_forage", lvl:[1,4], w:3, scene:(S)=>({
    title:"Something Edible", text:"A fallen contestant's pack lies half-open — a dented can, a few protein bars. Food. Real food, out here worth more than gold.",
    choices:[
      {label:"Eat your fill now and pocket the rest.",
        go:S=>{ S.food+=2; FX.feed(S,40); FX.calm(S,5); return R("You eat until the worst of the hunger lets go, and stow the rest. Your hands stop shaking for the first time in a while."); }},
      {label:"Take it all and ration hard for the lean turns ahead.",
        go:S=>{ S.food+=3; FX.feed(S,14); return R("Discipline over comfort. You take a few bites and hoard the rest. Future-you may live because of this."); }},
    ]})},
  { id:"ev_water", lvl:[1,5], w:2, scene:(S)=>({
    title:"Clean Water", text:"A cracked pipe drips genuinely clean water into a basin. Out here that's worth more than bands — and exactly why it might be watched.",
    choices:[
      {label:"Drink deep and fill what you can, fast.",
        go:S=>{ FX.feed(S,20); FX.stam(S,18); FX.calm(S,6); if(chance(0.25)){ FX.danger(S,18); return R("You drink your fill — and feel eyes settle on you mid-gulp. You leave quickly, but the watering hole bought you a watcher."); } return R("Cold, clean, real. For a moment the arena almost feels survivable. You move on stronger."); }},
      {label:"Watch it from cover first to see who else it belongs to.",
        go:S=>{ FX.danger(S,-4); FX.stam(S,-5); if(chance(0.6)){ FX.feed(S,12); return R("Patience confirms it's clear. You drink in peace and slip away unseen."); } FX.calm(S,-4); return R("Your patience costs you — someone else claims it while you wait, and you leave thirsty but alive."); }},
    ]})},
  { id:"ev_perk_cache", lvl:[2,5], w:1, scene:(S)=>({
    title:"A Dead Veteran's Cache", text:"A long-dead contestant — a real veteran, by the scars — left a sealed kit jammed in a vent. Reaching it means putting your arm somewhere you can't see.",
    choices:[
      {label:"Reach in blind and take whatever's there.",
        go:S=>{ if(chance(0.7)){ const r=randint(0,2); if(r===0){S.bandages+=2;FX.stopBleed(S);} else if(r===1){S.food+=2;FX.feed(S,30);} else {FX.calm(S,20);} FX.danger(S,4); return R("Your fingers close on supplies. The veteran's last gift to a stranger. You're better off for it."); }
          hurt(S,16,'poison'); FX.poison(S); return R("Something in the vent bites — a contestant's cruel last trap, a poisoned needle on the latch. The kit was bait."); }},
      {label:"Leave it. Blind reaches are how careful people die.",
        go:S=>{ FX.calm(S,4); return R("You leave the veteran's cache for someone with less to lose. Discipline is its own supply."); }},
    ]})},
  { id:"ev_miki", lvl:[4,5], cond:S=>!S.flags.mikiDebt, w:1, scene:(S)=>({
    title:"Miki's Price", text:"You're a breath from death — cornered, bleeding — when a blade flashes past you and your attacker drops. Miki lowers her weapon, warm-eyed and unreadable. 'I save people I find interesting,' she says. 'Interesting people owe me.'",
    choices:[
      {label:"Accept the debt. Live now, pay later.",
        go:S=>{ heal(S,30); FX.stopBleed(S); S.flags.mikiDebt=true; S.flags.metMiki=true; FX.calm(S,10); return R("'Done,' you rasp. Miki binds your worst wound with startling gentleness. 'Try to be worth it,' she says, and is gone. You'll see her again. You're sure of it."); }},
      {label:"Refuse to be in anyone's debt — limp away on your own.",
        go:S=>{ FX.danger(S,8); if(!S.cold)FX.calm(S,4); return R("'I pay my own way,' you manage. Miki laughs, delighted. 'There it is.' She lets you go — interested for free, which may be more dangerous."); }},
    ]})},
  { id:"ev_rest", lvl:[1,5], cond:S=>S.stamina<40, w:2, scene:(S)=>({
    title:"A Pocket of Quiet", text:"You find a genuinely defensible nook — one entrance, good sightlines. A chance to actually rest, if you dare spend the time.",
    choices:[
      {label:"Take a real rest. Recover.",
        go:S=>{ FX.stam(S,45); FX.calm(S,12); FX.danger(S,-12); if(S.cond.has('Bleeding')&&S.bandages>0){S.bandages--;FX.stopBleed(S);} return R("You let your body uncoil. Stamina returns; the shaking eases. For a few breaths, you are just a tired boy, not prey."); }},
      {label:"Rest light, half-awake, ready to move.",
        go:S=>{ FX.stam(S,22); FX.calm(S,5); return R("You doze with one eye open and the chain in your fist. Less rest, but no risk of being caught flat."); }},
    ]})},
  { id:"ev_band_theft", lvl:[1,2], cond:S=>S.allies.some(a=>a.alive), w:2, scene:(S)=>({
    title:"Gone in the Night", text:()=>{const a=pick(S.allies.filter(x=>x.alive));return `You wake before dawn. ${a.name} is crouched over your gear, hand frozen mid-reach.`;},
    choices:[
      {label:"Grab their wrist before they can run.",
        go:S=>{ const a=pick(S.allies.filter(x=>x.alive)); if(!a)return R("You wake to nothing taken — this time."); if(chance(betrayalRisk(a))){a.alive=false;a.left=true;S.flags.betrayed=true;S.ctx={ally:a.name};FX.danger(S,12);return R(`${a.name} wrenches free and bolts into the dark with whatever they could carry.`);} a.trust=clamp(a.trust-15,0,100);a.loyalty=clamp(a.loyalty-10,0,100);return R(`${a.name} freezes. 'I— I wasn't—' You both know they were. Something between you is broken now.`);}},
      {label:"Pretend to still be asleep and watch what they do.",
        go:S=>{ const a=pick(S.allies.filter(x=>x.alive)); if(a){if(chance(betrayalRisk(a))){S.food=Math.max(0,S.food-1);a.selfish+=12;return R(`Through slit eyes you watch ${a.name} pocket your food and settle back as if nothing happened. You'll remember this.`);} a.trust=clamp(a.trust+10,0,100);return R(`${a.name} hesitates... then puts your gear back and returns to watch. Maybe you can trust them. Maybe.`);} return R("Nothing happens. Just nerves."); }},
    ]})},
  { id:"ev_vidar_sight", lvl:[4,5], cond:S=>!S.flags.sparedByVidar, w:1, scene:(S)=>({
    title:"A Shape in the Smoke", text:"Across the ruined yard, a figure stands utterly still amid the chaos — and the chaos bends around him. Vidar. He hasn't looked your way. Yet.",
    choices:[
      {label:"Freeze and let him pass. Don't even breathe.",
        go:S=>{ FX.panic(S,10); if(chance(0.7)){FX.danger(S,-6);return R("You become stone. His gaze sweeps past like a lighthouse beam and moves on. You start breathing again a full minute later.");} FX.danger(S,26);return R("His head turns. For one eternal second Vidar looks at you — then dismisses you as not worth the walk. Somehow that's worse."); }},
      {label:"Use the distraction of his presence to loot the panicking crowd.",
        go:S=>{ FX.danger(S,14); if(chance(0.55)){S.food+=1;S.bandages++;return R("While everyone watches the apex predator, you pick the panic clean. Supplies, taken under Vidar's very nose.");} hurt(S,16,'combat');FX.bleed(S);return R("Someone else had the same cold idea and fought you for the scraps. You win little and bleed for it."); }},
    ]})},
  { id:"ev_corpse", lvl:[2,5], w:2, scene:(S)=>({
    title:"The Quiet Dead", text:"A contestant lies where they fell, days gone. Their pack is intact. So, possibly, is whatever killed them — somewhere close.",
    choices:[
      {label:"Search the body fast and move on.",
        go:S=>{ FX.danger(S,6); const r=randint(0,2); if(r===0){S.food+=2;FX.feed(S,20);} else if(r===1){S.bandages+=2;} else {FX.feed(S,8);} if(chance(0.3)){FX.infect(S);return R("You take what you can — but the body's rot gets into a cut on your hand. You'll regret the haste.");} return R("Supplies, claimed. The dead don't need them, and you very much do."); }},
      {label:"Leave it — a fresh untouched pack is bait as often as not.",
        go:S=>{ FX.calm(S,3); FX.danger(S,-4); return R("You've seen too many 'lucky finds' close like jaws. You leave the dead their dignity and keep your skin."); }},
    ]})},
  { id:"ev_redmenace", lvl:[4,5], w:1, scene:(S)=>({
    title:"Red Menace Patrol", text:"Heavy bootsteps in formation — a Red Menace patrol sweeping the corridor, methodical and unhurried. They haven't seen you. The only cover is a reeking drainage tunnel.",
    choices:[
      {label:"Take the tunnel. Filth over death.",
        go:S=>{ if(chance(0.75)){FX.danger(S,-10);if(chance(0.3))FX.infect(S);return R("You fold into the muck and breathe through your sleeve as boots pass inches away. Disgusting. Alive.");} hurt(S,14,'syndicate');S.ctx={fac:"Red Menace"};return R("The tunnel dead-ends; you double back into a straggler. You break free, marked."); }},
      {label:"Set the chain as a tripline and take the rear man.", req:S=>!S.cond.has('Broken Arm'), reqText:"arm is broken", reflex:{label:"SILENT TAKEDOWN", size:0.62},
        go:(S,c)=>{ S.ctx={enemy:"a Red Menace brute",fac:"Red Menace"}; if(c.grade==='perfect'){FX.kills(S,1);S.food+=1;S.flags.survivedSyndicate=true;FX.danger(S,8);return R("You take the rear man silent and clean, drag him into the dark, and melt away with his rations before the patrol notices the gap.");} hurt(S,30,'syndicate');FX.bleed(S);FX.danger(S,20);if(c.grade==='miss')FX.breakArm(S);return R("The brute is too strong to take quietly. The struggle draws the patrol. You escape leaving blood and noise behind you."); }},
    ]})},
];

/* ------------------------ AMBUSH SCENES --------------------------- */
function ambushScene(S){
  // threat scales with level
  const lvl=S.level;
  const pool = [
    {min:1, threat:2, name:"an armed contestant", fac:null},
    {min:2, threat:3, name:"a Daichi user", fac:null},
    {min:3, threat:4, name:"a Yellow Fang scout", fac:"Yellow Fang"},
    {min:4, threat:4, name:"a Red Menace brute", fac:"Red Menace"},
    {min:4, threat:5, name:"a Black Shadow killer", fac:"Black Shadow"},
  ].filter(p=>p.min<=lvl);
  const e = pick(pool);
  S._ambush = e;
  return {
    title:"AMBUSH", flavor:`Threat ${e.threat}`,
    text:`Your noise and your blood drew them. ${e.name.charAt(0).toUpperCase()+e.name.slice(1)} steps from cover, already moving. No time to think — only to act.`,
    choices:[
      {label:`Meet them with the chain.`, req:S=>!S.cond.has('Broken Arm'), reqText:"arm is broken — you can't swing",
        reflex:{label:"CHAIN STRIKE", size: 0.92-e.threat*0.1},
        go:(S,c)=>{ S.ctx={enemy:e.name,fac:e.fac}; const win = c.grade==='perfect' || (c.grade==='good'&&e.threat<=3);
          if(win){ FX.kills(S,1); FX.danger(S,-12); if(e.threat>=4)S.flags.survivedSyndicate=true; return R(`You read the strike and the chain answers. ${e.name} drops. You drag in a breath that tastes like living.`);}
          const dmg = 10+e.threat*7; hurt(S,dmg, e.fac?'syndicate':'combat'); FX.bleed(S);
          if(S.hp<=0) return R(`You weren't fast enough for a Threat ${e.threat}.`);
          FX.danger(S,12); if(e.threat>=4 && chance(0.4)) FX.breakArm(S);
          return R(`You trade blows and break contact, badly hurt. A Threat ${e.threat} is not something you simply out-muscle.`);}},
      {label:`Run. Burn stamina to break line of sight.`, req:S=>!S.cond.has('Limping')&&S.stamina>10, reqText:"can't run (limping/exhausted)",
        reflex:{label:"FLEE", size:0.8},
        go:(S,c)=>{ S.ctx={enemy:e.name,fac:e.fac}; FX.stam(S,-25); if(c.grade!=='miss'){ FX.danger(S,-8); return R(`You throw yourself through wreckage and tight gaps, lungs burning, until the ${e.name} loses you. Free — for now.`);}
          const dmg=8+e.threat*5; hurt(S,dmg,e.fac?'syndicate':'combat'); FX.bleed(S); FX.danger(S,10); return R(`They're faster than you hoped. You escape, but ${e.name} opens you up as you go.`);}},
      {label:`Surrender your supplies to buy your life.`, req:S=>S.food>0||S.bandages>0, reqText:"you have nothing to give",
        go:S=>{ S.ctx={enemy:e.name,fac:e.fac}; const give=(S.food>0)+(S.bandages>0); S.food=0;S.bandages=0; FX.danger(S,-6);
          if(e.threat>=5 && chance(0.6)){ if(S.cheatDeath){S.cheatDeath=0;S.hp=1;FX.bleed(S);return R(`A Threat 5 takes your supplies AND turns on you — only the 502 Will keeps you breathing.`);} kill(S,e.fac?'syndicate':'combat',{enemy:e.name,fac:e.fac}); return R(`A Threat 5 takes your offering, and then takes you anyway. Mercy isn't in their training.`);}
          if(!S.cold)FX.panic(S,8); return R(`You drop everything and back away, palms open. ${e.name} scoops up your supplies and lets you live. You're alive, and you have nothing.`);}},
      {label:`Take the hit and stagger on — no defense, just endure it.`,
        go:S=>{ S.ctx={enemy:e.name,fac:e.fac}; const dmg=12+e.threat*6; hurt(S,dmg,e.fac?'syndicate':'combat'); FX.bleed(S); FX.danger(S,8);
          if(S.hp<=0) return R(`You take a Threat ${e.threat} blow with your body and nothing else. It is exactly as bad as it sounds.`);
          if(!S.cold)FX.panic(S,10); return R(`You eat the blow, reel, and keep moving on pure refusal. Bleeding, but breathing.`);}},
    ]
  };
}

/* ---------------------- RUN / STATE MGMT -------------------------- */
function newRun(perkIds=[]){
  const S = {
    hp:CFG.maxHp, maxhp:CFG.maxHp, maxcomp:CFG.maxComp,
    stamina:100, hunger:8, composure:70, infection:0,
    bleedRate:0, burnTurns:0, hungerRate:CFG.hungerRate, bleedMod:0, reflexBonus:0, cold:false, cheatDeath:0,
    cond:new Set(),
    danger:10, survivors:600, level:1, turn:0, turnInLevel:0, queue:[],
    bands:{r:0,g:0,b:0}, bandages:2, food:2,
    allies:[], flags:{}, usedEvents:new Set(),
    perks:new Set(perkIds),
    dead:false, win:false, cause:null, ctx:{}, ending:null, log:[],
  };
  perkIds.forEach(p=>{ if(PERKS[p]) PERKS[p].apply(S); });
  // bleedMod applies to bleedRate when bleeding starts
  buildLevelQueue(S);
  return S;
}
function buildLevelQueue(S){
  const lvl=S.level; const beats=BEATS[lvl]; const len=LEVELS[lvl-1].len;
  const q=[{beat:beats[0]}];
  const mid=beats.slice(1,beats.length-1).map(id=>({beat:id}));
  const randomsNeeded=Math.max(0, len - beats.length);
  const fillers=[...mid, ...Array(randomsNeeded).fill(0).map(()=>({rand:true}))];
  shuffle(fillers);
  q.push(...fillers, {beat:beats[beats.length-1]});
  S.queue=q; S.turnInLevel=0;
}
function ambushChance(S){
  const d=S.danger;
  if(d>=90) return CFG.ambushAt90;
  if(d>=75) return CFG.ambushAt75;
  if(d>=50) return CFG.ambushAt50;
  return CFG.ambushBase + Math.max(0,(d-30))*0.004;
}
function getScene(id,S){ const s=SCENES[id]; return typeof s==='function'?s(S):s; }
function resolveText(t){ return typeof t==='function'?t():t; }

function pickRandomEvent(S){
  const elig = EVENTS.filter(e=> S.level>=e.lvl[0] && S.level<=e.lvl[1] && (!e.cond||e.cond(S)) && !S.usedEvents.has(e.id));
  const poolWeighted=[]; (elig.length?elig:EVENTS.filter(e=>S.level>=e.lvl[0]&&S.level<=e.lvl[1]&&(!e.cond||e.cond(S)))).forEach(e=>{ for(let i=0;i<(e.w||1);i++)poolWeighted.push(e); });
  if(!poolWeighted.length) return null;
  const e=pick(poolWeighted); S.usedEvents.add(e.id); return e.scene(S);
}

// returns {scene} or {win:true}
function nextScene(S){
  if(S.dead) return null;
  S.turn++; S.turnInLevel = (S.turnInLevel||0);
  // ambush preempt (not on very first turn)
  if(S.turn>1 && chance(ambushChance(S))) { return ambushScene(S); }
  if(!S.queue.length){
    // advance level
    if(S.level>=5){ S.win=true; S.ending=computeEnding(S); return {win:true}; }
    S.level++; S.survivors=Math.min(S.survivors, (CFG.survAtLevel[S.level]||S.survivors)+randint(-8,8)); buildLevelQueue(S);
  }
  const item=S.queue.shift();
  S.turnInLevel++;
  if(item.beat) return getScene(item.beat,S);
  // random
  return pickRandomEvent(S) || getScene(BEATS[S.level][1],S);
}

// applies a chosen choice's outcome + end-of-turn tick. returns {log, dead, win}
function resolveChoice(S, scene, choiceIndex, grade){
  const choice = scene.choices[choiceIndex];
  let res;
  if(choice){
    res = choice.go(S, {grade}) || {};
  } else if(scene.onTimeout){
    res = scene.onTimeout(S) || {};
  } else { res = {}; }
  const out = { log: res.log||[], dead:false, win:false };
  if(res.win){ S.win=true; S.ending=computeEnding(S); out.win=true; out.log=res.log||[]; return out; }
  if(!S.dead) endTurn(S);
  if(S.dead){ out.dead=true; out.deathLine=deathLine(S); }
  return out;
}
// timed-out (player didn't answer)
function resolveTimeout(S, scene){
  let res = scene.onTimeout? (scene.onTimeout(S)||{}) : {};
  const out={ log:res.log||[], dead:false, win:false };
  if(res.win){ S.win=true; S.ending=computeEnding(S); out.win=true; return out; }
  if(!S.dead) endTurn(S);
  if(S.dead){ out.dead=true; out.deathLine=deathLine(S); }
  return out;
}

function endTurn(S){
  if(S.cond.has('Bleeding')){ const r=Math.max(5, S.bleedRate + (S.bleedMod||0)); hurt(S,r,'bleed'); }
  if(S.cond.has('Poisoned')){ hurt(S,CFG.poisonRate,'poison'); if(chance(0.30))S.cond.delete('Poisoned'); }
  if(S.cond.has('Burned')){ hurt(S,CFG.burnRate,'fire'); if(--S.burnTurns<=0)S.cond.delete('Burned'); }
  if(S.cond.has('Infected')){ S.infection=clamp(S.infection+CFG.infectionStep,0,100); hurt(S,2,'infection'); if(S.infection>=100) kill(S,'infection'); }
  S.hunger=clamp(S.hunger+S.hungerRate,0,100);
  if(S.hunger>=60 && S.food>0){ S.food--; S.hunger=clamp(S.hunger-42,0,100); }  // eat from pack when hungry
  if(S.hunger>=CFG.starveThreshold){ S.cond.add('Starving'); hurt(S,CFG.starveDmg,'starve'); } else S.cond.delete('Starving');
  if(S.stamina<=0){ S.cond.add('Exhausted'); hurt(S,CFG.exhaustDmg,'exhaustion'); S.composure=clamp(S.composure-5,0,S.maxcomp); } else S.cond.delete('Exhausted');
  S.composure=clamp(S.composure + (S.danger>60?-6:4), 0, S.maxcomp);
  if(S.composure<=25)S.cond.add('Panicked'); else if(S.composure>35)S.cond.delete('Panicked');
  // panic can be lethal at 0 in high danger
  if(S.composure<=0 && S.danger>=60){ kill(S,'panic'); }
  S.danger=clamp(S.danger-CFG.dangerCool,0,100);
  S.survivors=Math.max(15, S.survivors - randint(0,2));
  // cheat death
  if(S.hp<=0 && !S.dead && S.cheatDeath>0){ S.cheatDeath--; S.hp=1; }
  else if(S.hp<=0 && !S.dead){ kill(S, S.cause||'wounds'); }
}

/* ============================ EXPORTS for headless sim ============= */
const NLE = { newRun, nextScene, resolveChoice, resolveTimeout, endTurn, getScene, resolveText,
  ambushChance, betrayalRisk, PERKS, CFG, LEVELS, deathLine, computeEnding,
  setRNG:(fn)=>{ RNG=fn; } };
if (typeof module!=='undefined' && module.exports) module.exports = NLE;
if (typeof window!=='undefined') window.NLE = NLE;

/* =====================================================================
   UI LAYER  (browser only — guarded so Node balance sims can import)
   ===================================================================== */
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
(function(){
  const $ = id => document.getElementById(id);
  const el = (tag,cls,html)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(html!=null)e.innerHTML=html; return e; };
  const SKEY = "neverlasting_grandselection_v1";

  /* ---------- sound (WebAudio, tiny) ---------- */
  const SND = (function(){
    let actx=null, on=true;
    function ctx(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return actx; }
    function tone(f,dur,type,vol,slide){ if(!on)return; const a=ctx(); if(!a)return; try{ const o=a.createOscillator(),g=a.createGain(); o.type=type||'sine'; o.frequency.value=f; if(slide)o.frequency.exponentialRampToValueAtTime(slide,a.currentTime+dur); g.gain.setValueAtTime(vol||.15,a.currentTime); g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+dur); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+dur);}catch(e){} }
    function noise(dur,vol){ if(!on)return; const a=ctx(); if(!a)return; try{ const b=a.createBuffer(1,Math.max(1,a.sampleRate*dur),a.sampleRate); const d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2); const s=a.createBufferSource(); s.buffer=b; const g=a.createGain(); g.gain.value=vol||.2; s.connect(g); g.connect(a.destination); s.start();}catch(e){} }
    return {
      set:(v)=>{on=v;}, get:()=>on,
      resume:()=>{ const a=ctx(); if(a&&a.state==='suspended')a.resume(); },
      click:()=>tone(330,.05,'triangle',.05),
      perfect:()=>{tone(660,.08,'sine',.14);setTimeout(()=>tone(990,.1,'sine',.14),70);setTimeout(()=>tone(1320,.14,'sine',.11),150);},
      good:()=>tone(520,.1,'sine',.12),
      miss:()=>tone(150,.24,'sawtooth',.12,70),
      hurt:()=>{noise(.16,.2);tone(110,.18,'square',.09,70);},
      death:()=>{tone(220,.5,'sawtooth',.16,55);setTimeout(()=>noise(.55,.2),120);},
      win:()=>{[392,523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.3,'sine',.14),i*130));},
      ambush:()=>{tone(180,.4,'sawtooth',.16,1200);noise(.18,.16);},
      heartbeat:()=>{tone(58,.12,'sine',.22);setTimeout(()=>tone(52,.13,'sine',.18),190);},
    };
  })();
  let lastHpBefore = 100, wasCritical=false;

  /* ---------- storage / legacy ---------- */
  function loadSave(){
    try{ return JSON.parse(localStorage.getItem(SKEY)) || {}; }catch(e){ return {}; }
  }
  function blankSave(){ return { unlocks:["pain_tolerant"], journal:[], endings:[], stats:{runs:0,wins:0,bestLevel:1,deepest:"Level 1"} }; }
  let SAVE = Object.assign(blankSave(), loadSave());
  SAVE.unlocks = SAVE.unlocks && SAVE.unlocks.length ? SAVE.unlocks : ["pain_tolerant"];
  function persist(){ try{ localStorage.setItem(SKEY, JSON.stringify(SAVE)); }catch(e){} }

  function unlockPerk(id, reason){
    if(!PERKS[id]) return;
    if(!SAVE.unlocks.includes(id)){ SAVE.unlocks.push(id); persist(); toast(`★ Legacy Unlocked: ${PERKS[id].name}`); }
  }
  function checkUnlocks(S){
    if(S.level>=2) unlockPerk("pain_tolerant");
    if(S.level>=3) unlockPerk("field_dressing");
    if(S.level>=4) unlockPerk("scarred_veteran");
    if(S.flags.survivedSyndicate) unlockPerk("iron_lung");
    if(S.flags.killedGenji) unlockPerk("chainmaster");
    if(S.flags.betrayed) unlockPerk("cold_survivor");
    if(S.win) unlockPerk("marked_502");
  }

  /* ---------- screens ---------- */
  const screens = ["titleScreen","gameScreen","deathScreen","winScreen"];
  function show(idToShow){ screens.forEach(s=>$(s).classList.toggle("hidden", s!==idToShow)); window.scrollTo(0,0); }

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2100); }

  /* ---------- title + perk select ---------- */
  let chosenPerks = [];
  function renderTitle(){
    SAVE = Object.assign(blankSave(), loadSave());
    SAVE.unlocks = SAVE.unlocks && SAVE.unlocks.length ? SAVE.unlocks : ["pain_tolerant"];
    $("metaRuns").textContent = SAVE.stats.runs||0;
    $("metaWins").textContent = SAVE.stats.wins||0;
    $("metaDeepest").textContent = SAVE.stats.deepest||"Level 1";
    $("metaSurvCount").textContent = (SAVE.journal||[]).length;
    // perk grid
    const grid=$("perkGrid"); grid.innerHTML="";
    chosenPerks = chosenPerks.filter(p=>SAVE.unlocks.includes(p));
    Object.keys(PERKS).forEach(id=>{
      const p=PERKS[id]; const owned=SAVE.unlocks.includes(id);
      const card=el("div","perk"+(owned?"":" locked")+(chosenPerks.includes(id)?" sel":""));
      card.innerHTML = `<div class="perk-name">${p.name}</div><div class="perk-desc">${owned?p.desc:'🔒 '+p.unlock}</div>`;
      if(owned) card.addEventListener("click",()=>{
        const i=chosenPerks.indexOf(id);
        if(i>=0) chosenPerks.splice(i,1);
        else { if(chosenPerks.length>=2){ toast("Choose at most 2 perks."); return; } chosenPerks.push(id); }
        renderTitle();
      });
      grid.appendChild(card);
    });
    $("perkChosen").textContent = chosenPerks.length? chosenPerks.map(p=>PERKS[p].name).join(" + ") : "none";
  }

  /* ---------- game state ---------- */
  let S=null, cur=null, timerRAF=null, timerEnd=0, timedActive=false;

  function startRun(){
    SND.resume(); wasCritical=false;
    S = NLE.newRun(chosenPerks.slice());
    SAVE.stats.runs=(SAVE.stats.runs||0)+1; persist();
    show("gameScreen");
    advance();
  }

  function advance(){
    cancelTimer();
    const r = NLE.nextScene(S);
    if(!r){ return; }
    if(r.win){ return doWin(); }
    cur = r;
    renderHUD();
    renderScene(cur);
  }

  /* ---------- HUD ---------- */
  function bar(id,val,max){ const pct=clamp(val/max*100,0,100); $(id).style.width=pct+"%"; }
  function renderHUD(){
    const lvl=NLE.LEVELS[S.level-1];
    $("levelTag").textContent = `LV ${S.level} · ${lvl.name}`;
    $("levelTag").style.color = lvl.color;
    $("survCount").textContent = S.survivors;
    // survivors danger framing
    bar("barHp","hp"); $("barHp").style.width=clamp(S.hp/S.maxhp*100,0,100)+"%"; $("hpNum").textContent=Math.ceil(S.hp);
    $("barStam").style.width=clamp(S.stamina,0,100)+"%";
    $("barHunger").style.width=clamp(S.hunger,0,100)+"%";
    $("barComp").style.width=clamp(S.composure/S.maxcomp*100,0,100)+"%";
    $("barInf").style.width=clamp(S.infection,0,100)+"%";
    $("statInf").style.display = (S.infection>0||S.cond.has('Infected'))?"":"none";
    // danger meter
    const d=S.danger; $("dangerFill").style.width=d+"%"; $("dangerNum").textContent=Math.round(d);
    const dm=$("dangerMeter"); dm.classList.toggle("high", d>=50); dm.classList.toggle("critical", d>=75);
    // low-vitality tension
    const crit = S.hp>0 && S.hp/S.maxhp < 0.25;
    $("gameScreen").classList.toggle("critical", crit);
    if(crit && !wasCritical) SND.heartbeat();
    wasCritical = crit;
    // conditions
    const cwrap=$("conditions"); cwrap.innerHTML="";
    if(S.cond.size===0){ cwrap.appendChild(el("span","cond ok","Steady")); }
    else S.cond.forEach(c=> cwrap.appendChild(el("span","cond "+condClass(c), condIcon(c)+" "+c)));
    // supplies
    $("supplies").innerHTML = `🩹 ${S.bandages} &nbsp; 🍖 ${S.food}` + (S.bands.r+S.bands.g+S.bands.b>0?` &nbsp; 🎽 ${S.bands.r}/${S.bands.g}/${S.bands.b}`:"");
    // allies
    const aw=$("allies"); aw.innerHTML="";
    const alive=S.allies.filter(a=>a.alive);
    if(alive.length===0){ aw.appendChild(el("span","ally-none","— traveling alone —")); }
    else alive.forEach(a=>{
      const risk=NLE.betrayalRisk(a);
      const chip=el("div","ally"+(risk>0.6?" danger":risk>0.35?" wary":""));
      chip.innerHTML=`<span class="ally-name">${a.name}</span><span class="ally-bar"><i style="width:${Math.round(a.trust)}%"></i></span>`;
      chip.title=`Trust ${a.trust|0} · Fear ${a.fear|0} · Hunger ${a.hunger|0} · Loyalty ${a.loyalty|0} · Selfish ${a.selfish|0}` + (risk>0.6?" · ⚠ likely to break":"");
      aw.appendChild(chip);
    });
  }
  function condClass(c){ return ({Bleeding:"bad","Broken Arm":"bad",Limping:"warn",Poisoned:"bad",Burned:"warn",Panicked:"warn",Starving:"bad",Infected:"bad",Exhausted:"warn"})[c]||"warn"; }
  function condIcon(c){ return ({Bleeding:"🩸","Broken Arm":"🦴",Limping:"🦵",Poisoned:"☠",Burned:"🔥",Panicked:"😱",Starving:"🍽",Infected:"🤢",Exhausted:"💤"})[c]||"⚠"; }

  /* ---------- scene render ---------- */
  function renderScene(scene){
    if(scene.title==="AMBUSH") SND.ambush();
    $("sceneFlavor").textContent = scene.flavor||"";
    $("sceneFlavor").className = "scene-flavor" + (scene.title==="AMBUSH"?" ambush":"");
    $("sceneTitle").textContent = scene.title||"";
    $("sceneTitle").classList.toggle("ambush", scene.title==="AMBUSH");
    $("sceneText").textContent = NLE.resolveText(scene.text);
    $("outcome").classList.add("hidden");
    $("choices").classList.remove("hidden");
    $("reflexOverlay").classList.add("hidden");
    // choices
    const cw=$("choices"); cw.innerHTML="";
    scene.choices.forEach((ch,i)=>{
      const enabled = !ch.req || ch.req(S);
      const b=el("button","choice"+(enabled?"":" disabled"));
      b.innerHTML = `<span class="ch-key">${i+1}</span><span class="ch-label">${ch.label}${ch.reflex?' <em class="ch-reflex">⚡ reflex</em>':''}${!enabled&&ch.reqText?` <em class="ch-block">— ${ch.reqText}</em>`:''}</span>`;
      if(enabled) b.addEventListener("click",()=>chooseChoice(scene,i));
      cw.appendChild(b);
    });
    // timer
    if(scene.timed){ startTimer(scene.timed, ()=>onTimeout(scene)); $("timerWrap").classList.remove("hidden"); }
    else { $("timerWrap").classList.add("hidden"); }
  }

  /* ---------- timed choices ---------- */
  function startTimer(seconds, onEnd){
    timedActive=true; timerEnd=performance.now()+seconds*1000;
    const fill=$("timerFill");
    function tick(){
      if(!timedActive) return;
      const left=Math.max(0, timerEnd-performance.now());
      const pct=left/(seconds*1000)*100;
      fill.style.width=pct+"%";
      $("timerNum").textContent=(left/1000).toFixed(1);
      fill.classList.toggle("panic", pct<35);
      if(left<=0){ timedActive=false; onEnd(); return; }
      timerRAF=requestAnimationFrame(tick);
    }
    tick();
  }
  function cancelTimer(){ timedActive=false; if(timerRAF)cancelAnimationFrame(timerRAF); $("timerWrap").classList.add("hidden"); }
  function onTimeout(scene){
    cancelTimer(); lastHpBefore=S.hp;
    const out = NLE.resolveTimeout(S, scene);
    showOutcome(out);
  }

  /* ---------- choice resolution (+ reflex) ---------- */
  function chooseChoice(scene, i){
    const ch=scene.choices[i];
    SND.click(); lastHpBefore=S.hp;
    cancelTimer();
    if(ch.reflex){
      runReflex(ch.reflex, (grade)=>{
        const out = NLE.resolveChoice(S, scene, i, grade);
        out._reflex=grade;
        showOutcome(out);
      });
    } else {
      const out = NLE.resolveChoice(S, scene, i, null);
      showOutcome(out);
    }
  }

  /* ---------- reflex minigame ---------- */
  let reflexRAF=null, reflexActive=false;
  function runReflex(cfg, cb){
    const ov=$("reflexOverlay"); ov.classList.remove("hidden");
    $("choices").classList.add("hidden");
    $("reflexLabel").textContent = cfg.label||"STRIKE";
    // zone sizing
    const bonus = S.reflexBonus||0;
    let good = clamp((cfg.size||0.7)*0.34 + bonus, 0.12, 0.7);  // fraction width of GOOD zone
    let perfect = good*0.34;
    const goodStart = clamp(0.5-good/2,0,1), perfectStart=clamp(0.5-perfect/2,0,1);
    $("zoneGood").style.left=(goodStart*100)+"%"; $("zoneGood").style.width=(good*100)+"%";
    $("zonePerfect").style.left=(perfectStart*100)+"%"; $("zonePerfect").style.width=(perfect*100)+"%";
    const marker=$("reflexMarker");
    const speed = 0.9 + (1-(cfg.size||0.7))*1.4;  // smaller window -> faster sweep
    let t0=performance.now(); reflexActive=true;
    function frame(now){
      if(!reflexActive) return;
      const pos = 0.5 + 0.5*Math.sin((now-t0)/1000*Math.PI*speed); // ping-pong 0..1
      marker.style.left=(pos*100)+"%";
      marker._pos=pos;
      reflexRAF=requestAnimationFrame(frame);
    }
    reflexRAF=requestAnimationFrame(frame);
    // auto-miss if they wait too long (forces action)
    const autoMiss=setTimeout(()=>lock(true), 4200);
    function grade(pos){
      if(pos>=perfectStart && pos<=perfectStart+perfect) return 'perfect';
      if(pos>=goodStart && pos<=goodStart+good) return 'good';
      return 'miss';
    }
    function lock(forcedMiss){
      if(!reflexActive) return; reflexActive=false;
      clearTimeout(autoMiss); cancelAnimationFrame(reflexRAF);
      const pos = forcedMiss? -1 : (marker._pos||0);
      const g = forcedMiss? 'miss' : grade(pos);
      // flash result
      marker.className = "reflex-marker "+(g);
      $("reflexResult").textContent = g==='perfect'?"PERFECT!":g==='good'?"Hit":"MISS";
      $("reflexResult").className="reflex-result "+g;
      if(g==='perfect')SND.perfect(); else if(g==='good')SND.good(); else SND.miss();
      cleanup();
      setTimeout(()=>cb(g), 520);
    }
    function onKey(e){ if(e.code==='Space'||e.key===' '||e.key==='Enter'){ e.preventDefault(); lock(false);} }
    function onClick(){ lock(false); }
    function cleanup(){ document.removeEventListener('keydown',onKey); $("reflexHit").removeEventListener('click',onClick); ov._cleanup=null; }
    document.addEventListener('keydown',onKey);
    $("reflexHit").addEventListener('click',onClick);
    ov._cleanup=cleanup;
  }

  /* ---------- outcome + advance ---------- */
  function showOutcome(out){
    renderHUD();
    if(out.dead) SND.death();
    else if(out.win) SND.win();
    else if(S.hp < lastHpBefore) SND.hurt();
    $("choices").classList.add("hidden");
    $("reflexOverlay").classList.add("hidden");
    const o=$("outcome"); o.classList.remove("hidden");
    let html = (out._reflex?`<div class="outcome-reflex ${out._reflex}">${out._reflex==='perfect'?'⚡ PERFECT STRIKE':out._reflex==='good'?'Hit':'✗ MISS'}</div>`:"");
    html += `<div class="outcome-log">${(out.log||[]).map(l=>`<p>${l}</p>`).join("")}</div>`;
    if(out.dead){ html += `<button class="btn danger" id="toDeath">…</button>`; }
    else if(out.win){ html += `<button class="btn gold" id="toWin">Step into the light →</button>`; }
    else { html += `<button class="btn" id="toNext">Continue →</button>`; }
    o.innerHTML=html;
    if(out.dead){ flashDamage(); $("toDeath").addEventListener("click",()=>doDeath(out)); $("toDeath").textContent="↳ See how it ends"; setTimeout(()=>{ if($("toDeath"))$("toDeath").focus(); },50); }
    else if(out.win){ $("toWin").addEventListener("click",doWin); }
    else { $("toNext").addEventListener("click",advance); }
    o.scrollIntoView({behavior:"smooth",block:"nearest"});
  }
  function flashDamage(){ const g=$("gameScreen"); g.classList.remove("hurt"); void g.offsetWidth; g.classList.add("hurt"); }

  /* ---------- death ---------- */
  function doDeath(out){
    S.dead=true;
    SAVE.stats.bestLevel=Math.max(SAVE.stats.bestLevel||1,S.level);
    if(S.level> (parseInt((SAVE.stats.deepest||"Level 1").replace(/\D/g,""))||1)) SAVE.stats.deepest="Level "+S.level;
    checkUnlocks(S);
    const entry={ line: out.deathLine||NLE.deathLine(S), level:S.level, lvlName:NLE.LEVELS[S.level-1].name, cause:S.cause, surv:S.survivors, date:Date.now() };
    SAVE.journal = SAVE.journal||[]; SAVE.journal.unshift(entry); SAVE.journal=SAVE.journal.slice(0,40); persist();
    $("deathLine").textContent = entry.line;
    $("deathMeta").innerHTML = `Survived <b>${S.turn}</b> turns · fell in <b>Level ${S.level} · ${entry.lvlName}</b> · ${S.survivors} still breathed · cause: <i>${labelCause(S.cause)}</i>`;
    show("deathScreen");
  }
  function labelCause(c){ return ({bleed:"blood loss",starve:"starvation",infection:"infection",fire:"fire",acid:"acid rain",combat:"combat",syndicate:"the syndicates",exhaustion:"exhaustion",panic:"panic",betrayal:"betrayal",sacrifice:"sacrifice",fall:"a fall",wounds:"his wounds"})[c]||c||"his wounds"; }

  /* ---------- win ---------- */
  function doWin(){
    S.win=true; if(!S.ending) S.ending=NLE.computeEnding(S);
    SAVE.stats.wins=(SAVE.stats.wins||0)+1; SAVE.stats.bestLevel=5; SAVE.stats.deepest="WON";
    checkUnlocks(S);
    if(!SAVE.endings.includes(S.ending.id)){ SAVE.endings.push(S.ending.id); }
    persist();
    $("winTitle").textContent = S.ending.title;
    $("winText").textContent = S.ending.text;
    $("winMeta").innerHTML = `Survived <b>${S.turn}</b> turns. Of 600, fifteen remain — and one is Ichido. Composure ${Math.round(S.composure)} · ${S.allies.filter(a=>a.alive).length} ally(ies) alive.`;
    show("winScreen");
  }

  /* ---------- journal / gallery modals ---------- */
  function openJournal(){
    const m=$("modal"); $("modalTitle").textContent="Death Journal";
    const j=SAVE.journal||[];
    $("modalBody").innerHTML = j.length? j.map(e=>`<div class="journal-entry"><div class="je-line">“${e.line}”</div><div class="je-meta">Level ${e.level} · ${e.lvlName} · ${labelCause(e.cause)}</div></div>`).join("") : `<p class="muted">No deaths recorded yet. Give it time.</p>`;
    m.classList.remove("hidden");
  }
  function openGallery(){
    const m=$("modal"); $("modalTitle").textContent="Ending Gallery";
    const all=[["survivor","Survivor #502"],["bloodstained","Bloodstained Victor"],["alone","Alone at the Top"],["carried","He Carried Them"]];
    $("modalBody").innerHTML = all.map(([id,name])=>{
      const got=SAVE.endings.includes(id);
      return `<div class="gallery-entry ${got?'':'locked'}"><b>${got?name:'??? — Win to reveal'}</b></div>`;
    }).join("");
    m.classList.remove("hidden");
  }

  /* ---------- input ---------- */
  document.addEventListener("keydown",(e)=>{
    if($("gameScreen").classList.contains("hidden")) return;
    if(!$("reflexOverlay").classList.contains("hidden")) return; // reflex handles its own keys
    if(!$("choices").classList.contains("hidden")){
      const n=parseInt(e.key);
      if(n>=1&&n<=9){ const btns=$("choices").querySelectorAll(".choice:not(.disabled)"); const b=$("choices").children[n-1]; if(b&&!b.classList.contains("disabled"))b.click(); }
    } else if(!$("outcome").classList.contains("hidden")){
      if(e.key===" "||e.key==="Enter"){ e.preventDefault(); const b=$("outcome").querySelector("button"); if(b)b.click(); }
    }
  });

  /* ---------- wire buttons ---------- */
  function bootstrap(){
    if(typeof SAVE.sound==='boolean'){ SND.set(SAVE.sound); }
    const sb=$("soundBtn"); if(sb){ sb.textContent=SND.get()?"🔊":"🔇"; sb.addEventListener("click",()=>{ const v=!SND.get(); SND.set(v); SAVE.sound=v; persist(); sb.textContent=v?"🔊":"🔇"; if(v){SND.resume();SND.click();} }); }
    renderTitle();
    show("titleScreen");
    $("startBtn").addEventListener("click",startRun);
    $("journalBtn").addEventListener("click",openJournal);
    $("galleryBtn").addEventListener("click",openGallery);
    $("modalClose").addEventListener("click",()=>$("modal").classList.add("hidden"));
    $("modal").addEventListener("click",(e)=>{ if(e.target===$("modal"))$("modal").classList.add("hidden"); });
    document.querySelectorAll(".again").forEach(b=>b.addEventListener("click",()=>{ renderTitle(); show("titleScreen"); }));
    document.querySelectorAll(".to-journal").forEach(b=>b.addEventListener("click",openJournal));
    document.querySelectorAll(".to-gallery").forEach(b=>b.addEventListener("click",openGallery));
    $("wipeBtn") && $("wipeBtn").addEventListener("click",()=>{ if(confirm("Erase all legacy unlocks, journal, and endings?")){ SAVE=blankSave(); persist(); renderTitle(); toast("Legacy wiped."); } });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bootstrap); else bootstrap();
})();
}
