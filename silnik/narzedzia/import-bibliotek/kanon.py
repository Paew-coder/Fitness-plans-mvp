"""Klucz kanoniczny nazwy ćwiczenia — do łączenia duplikatów i dopasowań między źródłami."""
import re

SKROTY = [
    (r"\b2\s*db\b", "2 dumbbell"), (r"\b1\s*db\b", "1 dumbbell"), (r"\bdbs?\b", "dumbbell"),
    (r"\b2\s*kb\b", "2 kettlebell"), (r"\b1\s*kb\b", "1 kettlebell"), (r"\bkbs?\b", "kettlebell"),
    (r"\bbb\b", "barbell"), (r"\bez[- ]?bar\b", "ez bar"), (r"\bsa\b", "single arm"), (r"\bsl\b", "single leg"),
    (r"\b1[- ]arm\b", "single arm"), (r"\bone[- ]arm\b", "single arm"), (r"\b1[- ]leg\b", "single leg"),
    (r"\bone[- ]leg\b", "single leg"), (r"\bsingle[- ]arm\b", "single arm"), (r"\bsingle[- ]leg\b", "single leg"),
    (r"\boh\b", "overhead"), (r"\balt\.?(?=\s|$)", "alternating"), (r"\biso\b", "isometric"),
    (r"\bisometrics?\b", "isometric"), (r"\bbw\b", "bodyweight"), (r"\bmb\b", "medball"), (r"\bmed ball\b", "medball"),
    (r"\bsb\b", "stability ball"), (r"\bswiss ball\b", "stability ball"), (r"\b1/2\s*kneel(ing)?\b", "half kneeling"),
    (r"\bhalf[- ]kneel(ing)?\b", "half kneeling"), (r"\bpush[- ]?ups?\b", "push up"), (r"\bpull[- ]?ups?\b", "pull up"),
    (r"\bchin[- ]?ups?\b", "chin up"), (r"\bsit[- ]?ups?\b", "sit up"), (r"\bstep[- ]?ups?\b", "step up"),
    (r"\bstep[- ]?downs?\b", "step down"), (r"\bflyes?\b", "fly"), (r"\bflies\b", "fly"), (r"\bdead[- ]?bugs?\b", "dead bug"),
    (r"\bbird[- ]?dogs?\b", "bird dog"), (r"\bhigh[- ]pull\b", "high pull"), (r"\brdls?\b", "rdl"),
    (r"\bromanian deadlift\b", "rdl"), (r"\bskull[- ]?crushers?\b", "skullcrusher"), (r"\bpress[- ]?ups?\b", "push up"),
    (r"\bt[- ]?bar\b", "t bar"), (r"\bhip[- ]thrusts?\b", "hip thrust"), (r"\btrx\b", "trx"),
    (r"\bglute[- ]ham raise\b", "ghr"), (r"\(ghr\)", ""), (r"\bmilitary press\b", "overhead press"),
    (r"\bohp\b", "overhead press"), (r"\bshoulder press\b", "overhead press"), (r"\bclean[- ]and[- ]jerk\b", "clean jerk"),
    (r"\bc&j\b", "clean jerk"), (r"&", " and "),
]
LICZBA_MNOGA = [(r"\b(raise|curl|row|squat|lunge|press|swing|extension|deadlift|jump|hop|thrust|bridge|crunch|"
                 r"plank|kickback|shrug|pulldown|pushdown|walk|carry|circle|rotation|slide|reach|hold|drag|march|"
                 r"twist|chop|lift|clean|snatch|jerk|dip|rollout|pullover|bound|skip|throw|slam|toss|pass)(e?s)\b", r"\1")]

def kanon(nazwa: str) -> str:
    k = " " + nazwa.lower().replace("’", "'").replace("–", "-") + " "
    k = re.sub(r"\s+-\s+olympic weightlifting exercise library", "", k)
    # „Band:Cable”, „Band Cable”, „Cable or Band”… to jedno (YouTube nie przyjmuje „/” w tytułach)
    k = re.sub(r"\b(band|cable)\s*(?:[:/]|\s|\bor\b)\s*(cable|band)\b", "band/cable", k)
    k = re.sub(r"\bw:\s", "with ", k)
    k = re.sub(r"\bw/\s", "with ", k)
    for wz, zam in SKROTY:
        k = re.sub(wz, zam, k)
    for wz, zam in LICZBA_MNOGA:
        k = re.sub(wz, zam, k)
    k = re.sub(r"[^\w/\.\+ ]", " ", k)
    k = re.sub(r"\b(the|a|an)\b", " ", k)
    k = re.sub(r"\s+", " ", k).strip(" .")
    return k
