"""Pierwsza propozycja klasyfikacji z nazwy — reguły wyprowadzone z BAZY 5.17.

Zwraca kategorię (part wynika z niej), coeff, progresję, skok, jednostronność,
rodzaj, sprzęt i pewność. To tylko propozycja: każdą partię przegląda potem
subagent z tymi samymi zasadami (docs/dane/zasady-klasyfikacji.md).
"""
import re

PART = {"Lower push": "s", "Lower pull": "d", "Upper push horizontal": "b", "Upper push vertical": "b",
        "Tricep": "b", "Upper pull horizontal": "r", "Upper pull vertical": "r", "Bicep": "r", "Core": "c"}

def ma(wz, n):
    return re.search(wz, n, re.I) is not None

def sprzet(n):
    s = []
    for wz, nazwa in [(r"\b(bb|barbell)\b|landmine|angled bb", "sztanga"), (r"\b\d?\s*db\b|dumbbell", "hantle"),
                      (r"\b\d?\s*kb\b|kettlebell", "kettlebell"), (r"cable|pulley", "wyciąg"), (r"\bband|banded|miniband", "guma"),
                      (r"\btrx\b|suspension", "TRX"), (r"machine|leg press|smith", "maszyna"), (r"\bsled\b", "sanie"),
                      (r"med ?ball|\bmb\b|wall ball", "piłka lekarska"), (r"stability ball|swiss ball|\bsb\b", "piłka gimnastyczna"),
                      (r"slider|val slide", "slider"), (r"\bbox\b", "skrzynia"), (r"bench", "ławka"), (r"\bring", "kółka"),
                      (r"rope", "lina"), (r"plate", "talerz"), (r"trap bar|hex bar", "trap bar"), (r"ez", "gryf łamany"),
                      (r"sandbag", "worek"), (r"foam roll", "roller"), (r"pull ?-?up bar|chin ?-?up|pull ?-?up", "drążek")]:
        if ma(wz, n) and nazwa not in s:
            s.append(nazwa)
    return s

ROZCIAGANIE = r"stretch|\bmob\b|mobility|mobilization|\bcars\b|opener|prying|dislocat|breath|nods?\b|neck|90/90|pigeon|" \
              r"t-?spine|thoracic|foam roll|\bsmash|rocking|rock\b|rockback|windmill stretch|couch|world'?s greatest|" \
              r"scorpion|\bcat\b|camel|cow\b|child'?s pose|cobra|\bspinal wave|wall slide|floor slide|thread the needle|" \
              r"ankle mob|hip airplane|tissue|lacrosse|glide|flossing|\bpail|rails\b|\bcars\b"
KONDYCJA = r"agility|shuffle|\bskip|a-?skip|carioca|sprint|shuttle|\bladder\b|battling rope|battle rope|jumping jack|" \
           r"burpee|mountain climber|bear crawl|crab walk|inchworm|high knees|butt kick|run\b|running|jog|backpedal|" \
           r"crawl|lateral bound|cone|drill\b|quick feet|fast feet|jacks\b|star jump|seal jack"
PLYO = r"jump|hop|bound|pogo|plyo|skater|broad|depth drop|tuck|split jump|squat jump|box jump|leap"
KOMPLEKS = r"complex|finisher|circuit|superset|ladder|emom|\bseries\b|workout|trio\b|combo|chain:|\s\+\s|burnout|flow\b"
OLIMP = r"snatch|\bclean\b|jerk|high ?-?pull|muscle clean|muscle snatch|power position|scarecrow|clean pull|snatch pull"
NIE_CWICZENIE = r"maxing out|\bmom\b|first pull up|poor .* form|proper .* form|\bmeg\b|\blauren\b|\bamelia\b|\bjason\b|" \
                r"sfg|women of|bodyweight pull ups$|level 1 skills"

def klasyfikuj(nazwa, grupy_catalyst=()):
    n = nazwa
    p = {"kategoria": None, "coeff": None, "progresja": "kg", "skok_kg": 2.5, "jednostronne": "nie",
         "rodzaj": "siłowe", "sprzet": sprzet(n), "pewnosc": "pewne", "powod": []}

    def niepewne(powod):
        p["pewnosc"] = "do weryfikacji"; p["powod"].append(powod)

    if ma(NIE_CWICZENIE, n):
        p["rodzaj"] = "pominąć"; niepewne("nagranie osoby/pokaz, nie ćwiczenie z biblioteki")
    if ma(KOMPLEKS, n):
        p["rodzaj"] = "kompleks"; niepewne("kilka ćwiczeń w jednym filmie (kompleks/seria/finisher)")

    bez_obc = not p["sprzet"] or set(p["sprzet"]) <= {"skrzynia", "ławka", "drążek", "TRX", "kółka", "slider",
                                                      "piłka gimnastyczna", "guma", "roller"}
    tylko_guma = "guma" in p["sprzet"] and not set(p["sprzet"]) & {"sztanga", "hantle", "kettlebell", "wyciąg", "maszyna"}

    # ── kategoria ───────────────────────────────────────────────────
    K = None
    if ma(ROZCIAGANIE, n) and not ma(r"press|row|curl|squat|lunge|deadlift|swing|carry|plank|bridge", n):
        p["rodzaj"] = "mobilność/rozciąganie"; niepewne("mobilność/rozciąganie — kategoria i coeff umowne")
    elif ma(KONDYCJA, n) and not ma(r"press|row|curl|deadlift|swing", n):
        p["rodzaj"] = "kondycja/koordynacja"; niepewne("ćwiczenie kondycyjne/koordynacyjne — kategoria umowna")

    if ma(r"bicep|\bcurl", n) and not ma(r"leg curl|hamstring|nordic|jefferson|wrist curl|stability ball.*curl|slider.*curl|ball curl|swiss ball curl|sb curl|curl.*press|curl to press", n):
        K = "Bicep"
    elif ma(r"wrist|forearm|grip\b|finger|rice bucket|wrist roller", n) and not ma(r"press|row|squat|deadlift|pull ?-?up|bench", n):
        K = "Bicep"; niepewne("przedramię/nadgarstek — kategoria umowna (Bicep)")
    elif ma(r"tricep|skull ?crusher|pushdown|push-?down|\bjm press|french press|tate press|kickback.*(tricep|arm)|overhead extension|close grip.*extension", n):
        K = "Tricep"
    elif ma(r"\bdips?\b", n) and not ma(r"hip dip|dip clean|dip snatch|jerk dip|dip and drive|dip squat|dip power|dip muscle|side plank dip|plank dip|hip drop", n):
        K = "Tricep" if ma(r"bench dip|hands elevated|chair|tricep", n) else "Upper push horizontal"
    elif ma(OLIMP, n):
        if ma(r"jerk", n) and not ma(r"clean (and|&|to) jerk|clean jerk", n):
            K = "Upper push vertical"
        elif ma(r"snatch balance|overhead squat|drop snatch|heaving snatch|pressing snatch", n):
            K = "Lower push"
        else:
            K = "Lower pull"
    elif ma(r"squat|lunge|split stance squat|step ?-?up|step ?-?down|leg press|leg extension|knee extension|pistol|wall sit|"
            r"sissy|calf|adduct|copenhagen|hip flexor|psoas|\btke\b|terminal knee|spanish squat|cossack|curtsy|skater squat|"
            r"step through|reverse nordic|thruster|wall ball", n):
        K = "Lower push"
        if ma(r"copenhagen", n): K = "Core" if ma(r"plank", n) else "Lower push"
        if ma(r"thruster", n): niepewne("thruster: przysiad + wyciskanie — Lower push czy Upper push vertical")
    elif ma(r"deadlift|\brdl\b|sldl|good ?morning|hip thrust|glute bridge|hip bridge|bridge|swing|hinge|back extension|"
            r"hyperextension|reverse hyper|hamstring|leg curl|nordic|\bghr\b|glute ham|kickback|abduct|clam ?shell|"
            r"fire hydrant|pull ?-?through|frog pump|donkey|glute|jefferson|hip lift|monster walk|lateral band walk|"
            r"side lying hip|band walk|kettlebell deadlift|suitcase deadlift", n):
        K = "Lower pull"
        if ma(r"jefferson", n): niepewne("Jefferson curl: mobilność/siła kręgosłupa — kategoria umowna")
    elif ma(r"bench press|floor press|push ?-?up|chest press|incline (db |dumbbell |bb |barbell |2db |1db )?press|\bfly\b|\bflye|svend|pec\b|chest|med ?ball (chest|pass)|"
            r"chest pass|slam|close grip press|incline press|decline press|spoto|larsen", n):
        K = "Upper push horizontal"
        if ma(r"slam", n): niepewne("rzut/slam piłką — kategoria jak w BAZIE (Med ball slam), ale umowna")
    elif ma(r"overhead press|\bohp\b|shoulder press|military press|push press|landmine press|arnold|z[- ]press|"
            r"cuban|lateral raise|side raise|front raise|\by raise\b|\bl raise\b|handstand|pike|\bpress\b.*overhead|"
            r"overhead.*\bpress\b|bottoms ?up press|see ?saw press|seesaw press|kb press|kettlebell press|"
            r"single arm press|half kneeling press|tall kneeling press|bradford|scaption|raise", n):
        K = "Upper push vertical"
    elif ma(r"upright row|high pull|shrug|pull ?-?up|chin ?-?up|pulldown|pull ?-?down|pullover|straight arm|lat\b|"
            r"rope climb|muscle up", n):
        K = "Upper pull vertical"
        if ma(r"shrug", n): niepewne("szrugsy (kaptury) — kategoria umowna")
    elif ma(r"\brow\b|rows\b|face ?pull|rear delt|reverse fly|reverse flye|pull ?-?apart|external rotation|"
            r"internal rotation|\bytw\b|\biyt\b|\bw raise\b|t raise|\bt\b.*raise|inverted|prone|scap|band pull", n):
        K = "Upper pull horizontal"
    elif ma(r"plank|crunch|sit ?-?up|dead ?bug|bird ?dog|hollow|v ?-?up|leg raise|knee raise|toes to bar|rollout|"
            r"roll ?out|pallof|chop|wood|lift\b|rotation|twist|anti|side bend|carry|suitcase|farmer|waiter|windmill|"
            r"get ?-?up|\btgu\b|bear|mountain climber|l ?-?sit|dragon flag|ab wheel|stir the pot|core|oblique|"
            r"bicycle|flutter|scissor|jackknife|jack knife|pike|hanging|renegade|march|bug\b|superman|arch|"
            r"stability ball|hold\b", n):
        K = "Core"
    elif ma(PLYO, n):
        K = "Lower push"
    elif ma(r"\bpress\b", n):
        K = "Upper push vertical"; niepewne("„press” bez kierunku — przyjęte nad głowę")

    if K is None:
        if p["rodzaj"] == "mobilność/rozciąganie":
            K = "Lower pull" if ma(r"hip|glute|hamstring|adductor", n) else "Core"
        elif p["rodzaj"] == "kondycja/koordynacja":
            K = "Core" if ma(r"crawl|climber|plank", n) else "Lower push"
        else:
            K = "Core"; niepewne("kategoria nierozpoznana z nazwy")

    # Skoki ponad wszystko — wzorzec z BAZY (Box jump, Horizontal jump: Lower push).
    if ma(PLYO, n) and not ma(r"jerk|snatch|clean|push ?-?up|plyo push|clap|row|press|pull", n) and K in ("Core", "Lower pull"):
        if not ma(r"swing|bridge|hip|deadlift", n):
            K = "Lower push"
    if ma(r"plyo push|clap push|push ?-?up.*(jump|plyo)", n):
        K = "Upper push horizontal"
    p["kategoria"] = K

    # ── coeff ───────────────────────────────────────────────────────
    sztanga = "sztanga" in p["sprzet"] or "trap bar" in p["sprzet"]
    glowne = r"^(bb |barbell )?(high bar |low bar |paused )?(back squat|front squat|deadlift|sumo deadlift|bench press|" \
             r"hip thrust|rdl)$|^(bb |barbell )(back squat|front squat|deadlift|sumo deadlift|bench press|hip thrust|" \
             r"rdl|paused bench press|paused back squat|low bar squat|high bar back squat|low bar back squat)$|" \
             r"^trap bar deadlift$|^(snatch|clean|clean (and|&) jerk|bb snatch|bb clean|bb clean and jerk|power clean|" \
             r"power snatch|squat clean|squat snatch|split jerk|push jerk|power jerk|bb split jerk|bb push jerk|bb power jerk|" \
             r"push press|bb push press|back squat|front squat|bench press)$"
    if ma(glowne, n.strip()) or ma(r"weighted (pull ?-?up|chin ?-?up|dip)|(pull ?-?up|chin ?-?up|dip)s? weighted|^push press barbell$|^hip thrust barbell$", n):
        c = 1.0
    elif ma(r"split squat|lunge|step ?-?up|bulgarian|back extension|hyperextension|reverse hyper", n) and K in ("Lower push", "Lower pull") \
            and not ma(r"stretch|mob|rock|jump|hop|plyo", n):
        c = 0.75
    elif K in ("Bicep", "Tricep"):
        c = 0.25
    elif ma(r"lateral raise|side raise|front raise|rear delt|reverse fly|reverse flye|\bfly\b|\bflye|external rotation|"
            r"internal rotation|calf|adduct|abduct|clam|leg extension|knee extension|leg curl|hamstring curl|shrug|"
            r"\by raise|\bw raise|\bt raise|ytw|iyt|pull ?-?apart|wrist|neck|scap|tke|terminal knee|fire hydrant|"
            r"kickback|hip flexor|monster walk|band walk|side lying", n) and not ma(r"press|squat|row\b", n):
        c = 0.25
        if ma(r"\bfly\b|\bflye", n) and K == "Upper push horizontal": c = 0.5
        if ma(r"kickback", n) and K == "Lower pull": c = 0.5
    elif p["rodzaj"] in ("mobilność/rozciąganie",):
        c = 0.25
    elif p["rodzaj"] == "kondycja/koordynacja":
        c = 0.25
    elif ma(OLIMP, n):
        if ma(r"tall|muscle|dip |segment|slow|no jump|no contact|floating|stage|riser|lift-?off|rack (support|delivery)|"
              r"power position|scarecrow|drill|from the hip|hip (clean|snatch|power)|press in|balance|drop|heaving|pressing|"
              r"behind the neck|jerk dip|hold|iso", n):
            c = 0.5
        else:
            c = 0.75
    elif ma(r"plank|dead ?bug|bird ?dog|hollow|crunch|sit ?-?up|v ?-?up|leg raise|knee raise|pallof|chop|rotation|twist|"
            r"rollout|roll ?out|side bend|bear|mountain climber|superman|flutter|scissor|bicycle|march|renegade|stir", n):
        c = 0.5
    elif ma(r"carry|farmer|suitcase|waiter|get ?-?up|\btgu\b|windmill", n):
        c = 0.75
    elif ma(PLYO, n):
        c = 0.25 if ma(r"pogo|hop|skip|extensive|in place|line|ankle", n) else 0.5
    elif K in ("Lower push", "Lower pull", "Upper push horizontal", "Upper push vertical", "Upper pull horizontal", "Upper pull vertical"):
        if ma(r"cable|machine|band|trx|ring|pulldown|pull ?-?down|push ?-?up|inverted|face ?pull|glute bridge|bridge|"
              r"step ?-?down|bodyweight|\bbw\b|air squat|wall sit|pullover|straight arm|isometric|\biso\b", n) \
                and not ma(r"pull ?-?up|chin ?-?up", n):
            c = 0.5
        elif sztanga or ma(r"dumbbell|\bdb\b|\d\s*db|kettlebell|\bkb\b|\d\s*kb|landmine|goblet|sandbag|weighted", n) \
                or ma(r"pull ?-?up|chin ?-?up|dips?\b", n):
            c = 0.75
        else:
            c = 0.5
    else:
        c = 0.5
    p["coeff"] = c

    # ── progresja i skok ────────────────────────────────────────────
    if ma(r"carry|farmer|suitcase|waiter|walk\b|sled|drag\b|push\b.*sled|prowler", n) and K == "Core":
        p["progresja"], p["skok_kg"] = "dystans", 0.0
    elif ma(r"\biso\b|isometric|hold\b|plank|wall sit|hang\b|dead hang|l ?-?sit|hollow hold", n) and bez_obc:
        p["progresja"], p["skok_kg"] = "czas", 0.0
    elif p["rodzaj"] in ("mobilność/rozciąganie",):
        p["progresja"], p["skok_kg"] = "ręczne ustawienie", 0.0
    elif p["rodzaj"] == "kondycja/koordynacja" and bez_obc:
        p["progresja"], p["skok_kg"] = "czas", 0.0
    elif ma(r"weighted", n) and ma(r"pull ?-?up|chin ?-?up|dip|push ?-?up", n):
        p["progresja"], p["skok_kg"] = "dodatkowy ciężar", 2.5
    elif ma(r"assisted|band assisted", n) and ma(r"pull ?-?up|chin ?-?up|dip|pistol|squat", n):
        p["progresja"], p["skok_kg"] = "asysta", 5.0
    elif tylko_guma:
        p["progresja"], p["skok_kg"] = "ręczne ustawienie", 0.0
    elif bez_obc:
        p["progresja"], p["skok_kg"] = "masa ciała", 0.0
    elif "kettlebell" in p["sprzet"] and not set(p["sprzet"]) & {"sztanga", "hantle"}:
        p["progresja"], p["skok_kg"] = "kg", 4.0
    elif "piłka lekarska" in p["sprzet"]:
        p["progresja"], p["skok_kg"] = "kg", 1.0
    elif "sanie" in p["sprzet"]:
        p["progresja"], p["skok_kg"] = "kg", 5.0
    elif c == 0.25 and set(p["sprzet"]) & {"hantle", "wyciąg", "gryf łamany", "talerz"}:
        p["progresja"], p["skok_kg"] = "kg", 1.0
    else:
        p["progresja"], p["skok_kg"] = "kg", 2.5

    # ── jednostronne ────────────────────────────────────────────────
    if ma(r"single arm|single leg|\bsa\b|\bsl\b|1[- ]arm|one arm|one leg|1[- ]leg|alternating|\balt\.?\b|"
          r"split squat|lunge|step ?-?up|step ?-?down|bulgarian|pistol|single-arm|single-leg|archer|skater squat|"
          r"curtsy|cossack|lateral squat|1kb|1db|\bs/a\b|\bs/l\b", n):
        if ma(r"\b1kb\b|\b1db\b|1 kb|1 db", n) and not ma(r"single|sa\b|sl\b|offset|ipsilateral|contralateral|alternating|alt\b|lunge|split|step|suitcase", n):
            p["jednostronne"] = "?"      # jeden ciężar, ale obie ręce (goblet) — nie wiadomo
        else:
            p["jednostronne"] = "tak"
    elif ma(r"side plank|copenhagen|offset|suitcase|windmill|get ?-?up|\btgu\b|pallof|chop|\blift\b|waiter|"
            r"half kneeling|staggered|ipsilateral|contralateral|lateral lunge|rotational|side lying|clam|fire hydrant", n):
        p["jednostronne"] = "?"
    if p["jednostronne"] == "?":
        niepewne("jednostronne? — wykonanie na stronę albo asymetryczne obciążenie")

    p["part"] = PART[K]
    p["powod"] = "; ".join(dict.fromkeys(p["powod"]))
    return p
