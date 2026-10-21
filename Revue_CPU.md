# Revue CPU du moteur sonore — Okto MultiWave Synth beta 0.3.3

Étude faite le 2026-10-20 dans le worktree `MultiOSCTest_cpu`, branche `cpu-opt` (partie de `f37718d`). Le dépôt principal n'a pas été touché, rien n'est poussé.
Consigne : trouver où va le temps sur les accords, l'alléger **sans changer le son**.

## 0. Résumé

1. **Résultat.** Sur 167 presets (un sur huit des 1182 + les 22 TOP Sounds), accords de 3 / 6 / 8 notes à vélocité 0,9, 3 s à 48 kHz en blocs de 128 :
   CPU moyen **2,51 → 1,63 %** (3 notes), **4,79 → 2,92 %** (6 notes), **5,95 → 3,62 %** (8 notes), soit **−35 / −39 / −39 %**. Le pire preset des 1182 (« 674 A1A2B1 · Choir Keys », trois oscillateurs, unison 3, morph, trois LFO)
   passe de **27,3 à 11,0 %** sur un accord de 6 notes ; la moyenne des 15 pires, de **15,3 à 9,3 %**.
2. **Le son n'a pas changé d'un seul bit** : 1344 rendus (224 presets × accords de 3, 6, 8 × vélocité 1 et 0,7) et 1268 cas du contrôle croisé (`dsp_render`, octet par octet) sont identiques à ceux du moteur d'avant ; différence maximale **0**.
   `core.js` n'a pas changé (aucune opération n'a changé), `regress_v07` donne le même écart qu'avant (2,08e-7 du pic), `quick --dsp --force` passe (1268 cas, pire 3,15e-7 contre 2e-6 permis).
3. **Où allait le temps** : 57-67 % dans la boucle de rendu des tables (`renderVoice`), 10-15 % dans les fonctions `exp` / `log` / `log2` de la bibliothèque mathématique (gains du filtre d'échelle recalculés à chaque bloc de 32 échantillons pour chaque voix et chaque oscillateur,
   enveloppes, hauteurs), 7-10 % dans le filtre de voix (échelle LADDER / OTA : 9 divisions par échantillon et par voix), 6-8 % dans la chaîne d'effets et l'étage de sortie. Le filtre n'est donc pas le coupable principal des 7 % du propriétaire :
   il pèse 8-10 % du temps des presets qui l'utilisent ; ce sont les **lignes de table lues par échantillon** (3 oscillateurs × unison × jeux du morph × jeux voisins des variantes) qui coûtent.
4. **Ce qui reste est borné par l'arithmétique** : chaque ligne de table coûte encore environ 15-20 cycles, sans possibilité d'abréger sans changer l'ordre des opérations flottantes. Les gains restants, sans changer le son, sont de quelques pour cent (§7.1).
   Deux pistes qui *changent* le son ont été mesurées et ne valent pas le prix (§7.2) : `CTRL = 64` (−8 % de CPU, son différent) et un seuil de bandes plus haut (−2 à −5 %, écart jusqu'à 6,8e-5 du pic).

## 1. Méthode

- **Mesure.** `vst/devtest/cpu_bench.cpp` (nouveau) rend des accords sur les presets avec le vrai moteur C++ (`dsp.h`, mêmes options que le plug-in : `-O2 -ffp-contract=off -static`, FTZ/DAZ comme `plugin.cpp`), 3 s à 48 kHz, blocs de 128 échantillons,
  notes MIDI à vélocité 0,9 relâchées à 2 s (les queues comptent). Le temps est le **temps CPU du thread** (`QueryThreadCycleTime`), converti avec la fréquence du compteur de temps (TSC, mesurée contre l'horloge murale) — jamais l'horloge murale.
  Accords : 3 notes (60 64 67), 6 notes (48 55 60 64 67 71), 8 notes (36 48 55 60 64 67 71 76). Le minimum de plusieurs répétitions est retenu. Les tables ne sont pas dans le temps mesuré.
- **Piège rencontré.** Ma première version calibrait la fréquence avec une boucle occupée mesurée à l'horloge murale ; dérangée par d'autres travaux elle sous-estimait la fréquence jusqu'à 2 fois et gonflait tous les pourcentages. Corrigé (TSC).
  Même corrigé, le CPU « absolu » de cette machine partagée (i7-13700HX, portable) varie de 1 à 5 selon la charge des autres travaux et le nombre de processus de mesure simultanés. **Seuls les rapports avant / après mesurés au même instant sont fiables.**
- **Comparaison par paires.** `vst/devtest/cpu_ab.cpp` + `cpu_ab_engine.cpp` (nouveaux) contiennent deux compilations du moteur dans un seul programme (`-Dws=ws_old` avec l'ancien `dsp.h`, `-Dws=ws_new` avec le nouveau) et les font rendre à tour de rôle, le premier alternant,
  avec le même minimum de répétitions : les deux subissent la même perturbation de la machine. Il compare aussi le hachage des deux sorties (égal = son identique) : 1683 rendus comparés, 0 différent.
- **Ensembles.** `tools/cpu_cases.js` écrit `all` (1182 presets), `sample` (un sur huit + les 22 TOP = 167), `check` (224 presets : les 22 TOP, les 12 presets des accords forts de `dsp_cases.js` et un échantillon stratifié de chaque catégorie), et les caractéristiques de chaque preset
  (filtre, unison, oscillateurs, effets, LFO, morph, enveloppes propres...). `tools/cpu_report.js` fait les tableaux par classe.
- **Profil.** `cpu_bench --sample` interrompt le thread audio toutes les ~0,3 ms et note son pointeur d'instruction ; `tools/cpu_profile.js` le traduit en lignes de `dsp.h` (llvm-symbolizer, fonctions inlinées comprises). Seule la boucle de rendu est échantillonnée.
- **Compteurs.** Une copie instrumentée de `dsp.h` (hors dépôt) a compté les lignes de table lues, les termes de bande, les appels de `filterGains` et les réutilisations de la mémoire.

## 2. Où va le temps (avant)

Échantillonnage du rendu, accord de 6 notes, six presets représentatifs (indices 0, 20, 171, 331, 491, 989) :

| part du temps | ce que c'est |
|---:|---|
| 57 % | `renderVoice` : par échantillon, par copie d'unison, par jeu de tables : la ligne de table (12 couches interpolées en double), la somme sur les couches actives, la fenêtre de position |
| 9 % `exp`, 3 % `log`, 1 % `log2`, 2 % `cos` | bibliothèque mathématique : `filterGains` (11 bandes × 3-4 appels, à chaque bloc de 32 pour chaque voix et chaque oscillateur), enveloppes, hauteur ; `cos` = la fenêtre de position |
| 8 % | `block` : chorus, délai, réverbe (16 peignes + 8 passe-tout), blocage du continu, garde de crête et limiteur |
| 9,5 % | filtre de voix (`ladder` + `fltProcess`), pour les presets qui l'ont |
| 1-2 % chacun | `filterGains`, `ampPass`, `control`, `ownPass` |

Pour le preset d'indice 491 seul : `renderVoice` 67 %, `exp` 10,5 %, `log` 3,5 %, `log2` 1,5 %. Il lit 11,5 millions de lignes de table en 3 s (64 par échantillon de sortie, 6 voix) avec 3,8 couches actives en moyenne ;
le 171 en lit 4,75 millions avec 7,6 couches actives.
Les effets, mesurés en les coupant un à un : 0,15 % d'un cœur au total (≈ 70 cycles par échantillon), soit 18 % du coût d'un preset léger (n° 20 : 0,88 → 0,72 % sans effets) et 4 % d'un preset lourd.
Le seuil de 7 % du propriétaire correspond à ces presets lourds : mon pire cas (27 %, 6 notes) est un preset à trois oscillateurs, unison 3, morph et variantes (jeux de tables voisins), soit une trentaine de rendus de table par voix et par échantillon.

## 3. Résultats avant → après (CPU % d'un cœur, moyenne par classe, minimum de 4 répétitions par rendu, mesure par paires)

167 presets, chaque classe regroupe les presets qui ont la caractéristique :

| classe de presets | n | accord de 3 notes | accord de 6 notes | accord de 8 notes |
|---|---:|---:|---:|---:|
| tous | 167 | 2,51 → 1,63 (−35 %) | 4,79 → 2,92 (−39 %) | 5,95 → 3,62 (−39 %) |
| sans filtre de voix | 111 | 2,05 → 1,33 (−35 %) | 3,88 → 2,33 (−40 %) | 4,74 → 2,82 (−40 %) |
| avec filtre (LADDER ou OTA) | 56 | 3,42 → 2,23 (−35 %) | 6,59 → 4,11 (−38 %) | 8,34 → 5,21 (−38 %) |
| filtre LADDER | 20 | 3,60 → 2,28 (−36 %) | 6,88 → 4,04 (−41 %) | 8,46 → 4,98 (−41 %) |
| filtre OTA | 36 | 3,32 → 2,20 (−34 %) | 6,44 → 4,15 (−35 %) | 8,28 → 5,33 (−36 %) |
| unison 1 | 43 | 1,02 → 0,72 (−30 %) | 1,69 → 1,04 (−38 %) | 2,12 → 1,30 (−39 %) |
| unison 2 | 60 | 2,33 → 1,61 (−31 %) | 4,44 → 2,87 (−35 %) | 5,53 → 3,60 (−35 %) |
| unison 3 ou 4 | 64 | 3,67 → 2,27 (−38 %) | 7,20 → 4,24 (−41 %) | 8,91 → 5,21 (−42 %) |
| 1 oscillateur | 20 | 0,67 → 0,51 (−23 %) | 1,12 → 0,79 (−30 %) | 1,40 → 0,96 (−31 %) |
| 2 oscillateurs | 120 | 2,45 → 1,61 (−34 %) | 4,59 → 2,82 (−38 %) | 5,69 → 3,43 (−40 %) |
| 3 oscillateurs | 27 | 4,14 → 2,55 (−38 %) | 8,42 → 4,96 (−41 %) | 10,47 → 6,46 (−38 %) |
| morph (WAVELET MORPH qui bouge) | 73 | 3,28 → 2,05 (−38 %) | 6,47 → 3,82 (−41 %) | 8,05 → 4,82 (−40 %) |
| enveloppe propre sur un oscillateur | 63 | 3,30 → 1,89 (−43 %) | 6,53 → 3,46 (−47 %) | 8,13 → 4,39 (−46 %) |
| sans LFO | 13 | 0,92 → 0,60 (−35 %) | 1,52 → 0,94 (−38 %) | 1,86 → 1,10 (−41 %) |
| LFO 3 actif | 88 | 3,28 → 2,13 (−35 %) | 6,39 → 3,90 (−39 %) | 7,91 → 4,88 (−38 %) |
| mono (VOICES = 1) | 22 | 0,87 → 0,70 (−20 %) | 0,90 → 0,68 (−24 %) | 0,88 → 0,73 (−17 %) |

Répartition (167 presets) :

| accord | médiane avant → après | 90e centile avant → après | pire avant → après |
|---|---:|---:|---:|
| 3 notes | 2,19 → 1,47 | 4,66 → 2,89 | 13,18 → 5,78 |
| 6 notes | 4,06 → 2,51 | 9,60 → 5,64 | 28,19 → 12,39 |
| 8 notes | 4,70 → 2,74 | 11,51 → 7,50 | 27,53 → 14,87 |

Les 15 presets les plus coûteux des 1182 (classement sur un accord de 6 notes, balayage complet fait par paires, puis remesurés avec 8 répétitions ; CPU % avant → après ; entre parenthèses l'indice du preset dans `SPEC.PRESETS`) :

| preset | 3 notes | 6 notes | 8 notes | réglages |
|---|---:|---:|---:|---|
| 674 A1A2B1 · Choir Keys (#147) | 13,3 → 5,9 | 27,3 → 11,0 | 27,6 → 11,2 | A1 A2 B1, unison 3, sans filtre, morph |
| 989 A1A2B1 · Temple & Mist (#462) | 9,1 → 6,1 | 19,7 → 12,8 | 23,3 → 17,1 | A1 A2 B1, unison 3, OTA, morph |
| 723 A1A2B1 · Hollow Shift Drawbars (#196) | 8,9 → 6,7 | 19,2 → 14,7 | 26,8 → 19,7 | A1 A2 B1, unison 3, sans filtre, morph |
| 835 A1A2 · Reed Shift (#308) | 7,7 → 5,4 | 17,7 → 11,4 | 23,5 → 15,3 | A1 A2, unison 3, sans filtre, morph |
| 875 A1A2B1 · Morph of Mist (#348) | 8,3 → 6,0 | 17,1 → 12,7 | 17,8 → 12,8 | A1 A2 B1, unison 2, LADDER+drive, morph |
| 1184 A1A2B1 · Moon Surge Clav (#657) | 8,0 → 4,4 | 16,5 → 9,2 | 21,5 → 11,7 | A1 A2 B1, unison 3, sans filtre, morph |
| 1010 A1A2 · Bright Storm (#483) | 8,2 → 4,3 | 16,0 → 7,6 | 21,6 → 10,5 | A1 A2, unison 3, LADDER+drive, morph |
| 1218 A1A2B1 · Breath of Atom (#691) | 8,9 → 5,1 | 15,3 → 8,0 | 17,1 → 9,1 | A1 A2 B1, unison 3, OTA, morph |
| 1155 A1A2B1 · Ice & Halo (#628) | 7,7 → 5,0 | 15,2 → 10,4 | 18,7 → 13,4 | A1 A2 B1, unison 3, sans filtre, morph |
| 1355 A1A2B1 · Breath & Drift (#828) | 8,9 → 6,0 | 12,9 → 9,4 | 14,0 → 9,9 | A1 A2 B1, unison 2, OTA+drive, morph |
| 1176 A1A2B1 · Drawbar Bars (#649) | 5,7 → 3,5 | 11,7 → 7,1 | 26,3 → 15,5 | A1 A2 B1, unison 3, OTA, morph |
| 1158 A1A2 · Wood Spiral Event (#631) | 5,9 → 3,4 | 10,6 → 5,7 | 12,9 → 7,0 | A1 A2, unison 3, sans filtre, morph |
| 1167 A1A2 · Swirl Chimes (#640) | 5,2 → 3,4 | 10,3 → 6,9 | 13,6 → 9,1 | A1 A2, unison 3, OTA, morph |
| 1289 A1A2 · Milk Shift (#762) | 4,9 → 3,3 | 10,0 → 6,7 | 13,2 → 8,8 | A1 A2, unison 3, sans filtre, morph |
| 1328 A1A2B1 · Rust Surge (#801) | 4,5 → 3,0 | 9,4 → 6,5 | 21,2 → 15,3 | A1 A2 B1, unison 3, sans filtre, morph |
| **moyenne des 15** | 7,7 → 4,8 | 15,3 → 9,3 | 19,9 → 12,4 | |

Les 15 sont tous des presets à morph (WAVELET MORPH, LFO 2 / LFO 3 sur les variantes) avec unison 2 ou 3 : leur coût est dominé par le nombre de rendus de table par voix. Ils gagnent moins (−23 à −60 %) que la moyenne parce que leur coût est presque
entièrement la boucle de rendu elle-même, déjà proche de sa borne arithmétique. Les valeurs absolues de ce tableau sont gonflées par la charge de la machine ; les rapports ne le sont pas.
Un balayage complet des 1182 presets (accord de 6 notes, 3 répétitions, 4 processus) donne CPU moyen 6,34 → 4,05 % (−36 %), médiane 5,84 → 3,62 %, 90e centile 11,84 → 7,74 %, pire 33,4 → 16,4 % (valeurs gonflées, rapport fiable).

## 4. Ce qui a été fait (`vst/src/dsp.h`, deux commits ; `core.js` inchangé)

Tout garde exactement les opérations flottantes et leur ordre : le rendu C++ reste identique bit à bit à celui d'avant. Sans SSE2 (autres plates-formes) c'est la forme scalaire d'origine qui est compilée.

1. **Termes de bande par paires (SSE2) dans `renderVoice`** (`bandTerms`). La ligne de table (12 couches de float, entrelacées) est lue deux couches à la fois, convertie en double, interpolée (`v0 + fr·(nx − v0)`) et multipliée par le gain de la couche : les mêmes
   opérations qu'avant, couche par couche, dans des registres de deux doubles. Seules les paires qui contiennent une couche active sont calculées, puis les termes sont **ajoutés un par un dans l'ordre de la liste des couches actives** (pas de réassociation).
   Une première version calculait les 12 couches à chaque fois : plus lente que l'original (×0,76 sur le preset 491, 3,8 couches actives en moyenne) ; la version par paires utiles, avec les mémoires du point 4, a donné au premier essai d'ensemble 1,3 à 1,6 fois sur les presets lourds.
   La somme sur des couches consécutives se fait sans passer par la liste d'indices.
2. **Rampe des gains de couche sautée quand tous les pas sont exactement 0** (`lg += 0`).
3. **Filtre de voix en lot** (`filterVoices`). Avant, chaque voix passait dans le filtre juste après son rendu : 9 divisions en chaîne par échantillon et par voix, sans recouvrement entre voix. Maintenant toutes les voix d'un bloc sont rendues, puis filtrées ensemble, échantillon par échantillon, les
   canaux gauche / droit d'un étage dans un même registre SSE2 (`tnh` avec `min` / `max` qui laissent passer un NaN comme les comparaisons d'origine). Les sommes en float du mélange sont ajoutées dans l'ordre des voix, comme avant. Gain : environ 40-45 % du coût du filtre d'après les profils
   (9,5 % d'un total qui est devenu 1,6 fois plus petit : 8 %), borné ensuite par le débit du diviseur : 5 divisions de paires par échantillon et par voix. Les états `Voice::fs` sont des paires entrelacées (gauche, droite) : c'est une disposition mémoire, pas un calcul (`core.js` garde quatre états gauche puis quatre droite).
4. **Mémoïsation sur entrées exactes** de fonctions pures, recalculées seulement quand une entrée change :
   - gains du filtre d'échelle `filterGains(type, cut, slope, res)` : par voix et oscillateur, et le dernier calcul par oscillateur (les voix d'un accord qui partagent leur coupure). Mesure du taux de calcul sur 3 s d'accord de 6 notes : 16 % des demandes calculées (preset 171),
     17 % (331), 17 % (491), 14 % (674), 8 % (755), 0 % (989), mais 100 % pour un preset dont la coupure bouge à chaque bloc (n° 0) ;
   - fréquence de l'oscillateur (`pow`), `log2(261,63 / f0)` et niveau de mip ;
   - facteurs `exp` des enveloppes (amp, mod, filtre, enveloppe propre, enveloppe de hauteur) : ils ne dépendent que des réglages et de la longueur du bloc, donc ne sont calculés qu'une fois par bloc pour toutes les voix ;
   - copies d'unison (détune, panoramique : `pow`, `sqrt`, `cos`, `sin`), facteur de lissage des niveaux, `exp` du drive et du master, `tanh` de la compensation de drive.
5. **Zéros exacts sans appel** : `softplus(x)` pour x < −9,5 (exp(4x) < 3,2e-17, 1 + exp(4x) vaut exactement 1, son log exactement 0), `boost = res · exp(...)` quand `res = +0`, enveloppe propre égale à 0 sur tout le bloc (la sortie de
   l'oscillateur vaut ±0, qui ne change aucune somme : seules les phases avancent), gain de compensation `polyComp` stable (simple mise à l'échelle).

Gain de chaque pièce : je n'ai pas isolé chacune (les mesures par paires mélangent). Ordre de grandeur d'après les profils : la bibliothèque mathématique passe de 15 % à 7 % d'un total 1,5 à 2 fois plus petit (point 4), la boucle de rendu perd 20-35 % (points 1, 2),
le filtre 40-45 % (3), les enveloppes et l'unison 1-3 % (4, 5).

## 5. Preuve d'égalité

- **Accords** : `cpu_bench --dump` a écrit les rendus du moteur d'avant (`tools/out/ref`, 1344 fichiers : 224 presets × accords de 3, 6, 8 × vélocité 1 et 0,7, 3 s, stéréo) ; `--check` sur le moteur d'après compare chaque échantillon :
  **0 échantillon différent sur 1344 rendus, écart maximal 0 du pic**. Vérifié après chaque étape (après les termes de bande et le filtre en lot ; après les mémoires ; après les zéros exacts, état final de la branche).
- **Tous les cas du contrôle croisé** (`dsp_render` : 1182 presets en note puis accord, variantes de LFO 2 / LFO 3, morph, phase, sparsity, largeur, enveloppes propres et de hauteur, synchronisation de tempo, clavier d'accords, changements d'accord en direct, accords forts, gardes de crête) rendus avec l'ancien
  et le nouveau `dsp.h` : **1268 fichiers, tous identiques octet par octet** (`cmp`).
- **Comparaison par paires** : 501 + 1182 rendus des mesures de CPU, hachage de la sortie des deux moteurs identique pour tous.
- `node tests/regress_v07.js` : les 22 TOP Sounds correspondent à la beta 0.7 (pire 2,08e-7 du pic, inchangé : c'est le moteur JS). `node tests/idle_skip.js` : tout passe.
- `node tests/quick.js --dsp --force` (après `vst\build.bat`) : PASS, « C++ port matches the JS reference in 1268 cases (worst 3.15e-7, 12 shards) », test VST3 99 contrôles, web, moteur JS sur les 1182 presets.
- Écart maximal annoncé par la consigne (≤ 1e-7 du pic) : **mesuré 0**, pas seulement ≤ 1e-7.

## 6. Essayé et rejeté

| essai | résultat |
|---|---|
| 12 couches en SSE2 à chaque ligne de table | plus lent que l'original (×0,76 sur le preset 491) : peu de couches actives (3,8 en moyenne) ; remplacé par les seules paires utiles |
| préchargement logiciel (`prefetch`) des lignes de table 4 et 12 échantillons à l'avance | aucun effet (±3 %) : l'attente mémoire n'est pas le goulot, la boucle est bornée par les instructions |
| rendu en deux passes par bloc (passe 1 : termes de bande de tous les échantillons ; passe 2 : sommes et sortie) pour allonger la fenêtre d'exécution | 3 à 7 % plus lent ; abandonné |
| une ligne de table plus courte par float au lieu de double | change les bits (hors sujet) |
| `CTRL = 64`, seuil de couches plus haut | changent le son : voir §7.2 |

## 7. Pistes

### 7.1 Sans changer le son (non faites, gain estimé)

- **Enveloppes d'amplitude et propres traitées voix par voix en parallèle** (`ampPass`, `ownPass` : une récurrence de 12 cycles de latence par échantillon, enchaînée voix après voix ; en traitant les voix en alternance, les chaînes se recouvrent) : 1 à 3 % du total, 5-8 % d'un preset léger.
- **Chaîne d'effets en passes sur le bloc** (réverbe : 16 peignes + 8 passe-tout par échantillon, enchaînés par la latence ; chorus, délai) : 3 à 6 % d'un preset léger, ~2 % d'un lourd.
- **Répartition par AVX2** (dispatch à l'exécution, `-mavx2` sans FMA donc mêmes bits) sur `bandTerms` et `filterVoices` : au plus 10 % de la boucle de rendu ; demande un test `cpuid` et deux versions du code.
- **Un seul passage pour les jeux de tables voisins** (variantes, morph) qui partagent phase et indice de ligne : 5 à 10 % pour les presets à jeux multiples.
- Le coût dominant (une ligne de table ≈ 15-20 cycles) ne baisse plus sans toucher aux opérations : c'est la limite de cette approche.

### 7.2 Qui changent le son (mesurées, à décider par le propriétaire)

Mesurées par paires sur 28 presets (un sur six de l'ensemble `sample`), accords de 3 / 6 / 8 notes ; écart du son sur 228 rendus (38 presets × accords × vélocités) en unités du pic :

| changement | CPU | écart du son | avis |
|---|---|---|---|
| `CTRL = 64` (blocs de commande de 64 au lieu de 32) | −8 / −8 / −7 % | médiane 1,9e-2, 90e centile 0,73, max 1,8 du pic : le son change nettement (suivi des gains, LFO échantillonnés-bloqués, enveloppes), il faudrait réécouter | pas rentable : 8 % pour un son différent |
| couches ignorées sous 1e-4 au lieu de 1e-6 (−80 dB) | −2 / −3 / −5 % | médiane 2,2e-6, 90e centile 2,8e-5, max 6,8e-5 du pic (−83 dB) ; 26 rendus sur 228 identiques | pas rentable |
| unison 3 → 2 sur les presets à morph et variantes (réglage de preset, pas du moteur) | environ −33 % sur ces presets (proportionnel au nombre de lignes lues ; non mesuré) | le son change (chœur plus étroit) | à décider preset par preset |

## 8. Reproduire

Compilateur : `%USERPROFILE%\tools\llvm-mingw\bin\x86_64-w64-mingw32-clang++` ; options : `-std=c++17 -O2 -DNDEBUG -static -ffp-contract=off -DNOMINMAX -I vst\external -I vst\src`.

```
node tools/cpu_cases.js tools/out/cases all          (puis check, sample 8)
clang++ ... vst/devtest/cpu_bench.cpp -o cpu_bench.exe
cpu_bench cases.txt --chords 3,6,8 --reps 5 --shard 0/6 --pin 0 --out r0.csv       (CPU % par preset, accord)
cpu_bench cases_check.txt --reps 1 --vels 1,0.7 --dump ref        (moteur de référence)   puis   --check ref   (moteur à vérifier)
cpu_bench cases.txt --chords 6 --reps 2 --sample hist.txt       (profil ; -g pour les lignes)  puis  node tools/cpu_profile.js cpu_bench.exe hist.txt
paire : cpu_ab_engine.cpp compilé deux fois (-Dws=ws_old -DAB_MAKE=makeOld -I <ancien dsp.h> ; -Dws=ws_new -DAB_MAKE=makeNew -I vst/src), lié à cpu_ab.cpp ; cpu_ab cases.txt --reps 6
node tools/cpu_report.js tools/out/cases/features_sample.json --paired a.csv,b.csv
```

## 9. Limites

- Le CPU absolu varie énormément avec la charge de la machine (un même rendu de 3,9 % à 11,4 % selon les passes) ; les tableaux ci-dessus sont des minima de répétitions faites par paires, mais seuls les **rapports** sont à retenir.
- Les accords sont joués d'un coup à vélocité 0,9 et tenus 2 s : pas de jeu réel, pas de changement de preset (le fondu de tables n'est pas mesuré), pas d'accord en mode CHORD ni de portamento.
- Aucun profil n'a été fait sur le thread de construction des tables ni sur l'éditeur (hors sujet).
- La version web (`core.js`) n'a pas été optimisée : les mêmes mémoires s'y appliqueraient (changement de performance seulement, mais à réécrire opération par opération pour rester la référence).
