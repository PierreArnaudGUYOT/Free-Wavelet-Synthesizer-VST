// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// The stars (1-10) OktoPierre gave in the listening test (EVALUATE SOUNDS) to the new presets of beta 0.3 numbered 501-620 (his files "sound 501 to sound 540.txt", "... 541 to 580" and
// "... 581 to 620": 80 presets rated of the 120), and 7 stars to six presets he named afterwards (669 680 692 694 697 of beta 0.3 and 377 of beta 0.2: FAV, which are in TOP Sounds).
// tools/spec.js uses them: a preset below 5 stars is left out of the list (its number is not used again), the others keep their stars (shown in the preset browser), those above 7 and the FAV
// ones are in TOP Sounds. A preset that is not here has not been rated: tools/supermod/rebuild.js remakes those (beta 0.3.1).
'use strict';
const RATINGS = {
  377: 7, 501: 5, 502: 8, 503: 2, 504: 5, 505: 4, 506: 8, 507: 4,
  508: 10, 509: 5, 510: 2, 511: 6, 512: 2, 513: 7, 514: 7, 541: 6,
  542: 3, 543: 6, 544: 6, 545: 9, 546: 8, 547: 6, 548: 3, 549: 3,
  550: 7, 551: 4, 552: 4, 553: 4, 554: 7, 555: 2, 556: 3, 557: 2,
  558: 8, 559: 5, 560: 2, 561: 5, 562: 7, 563: 2, 564: 2, 565: 2,
  566: 4, 567: 4, 568: 6, 569: 3, 570: 4, 571: 4, 572: 5, 573: 8,
  574: 4, 575: 7, 576: 3, 577: 9, 581: 2, 582: 2, 583: 2, 584: 2,
  585: 2, 586: 3, 587: 3, 588: 3, 589: 3, 590: 3, 591: 2, 592: 2,
  593: 7, 594: 4, 595: 4, 596: 4, 597: 3, 598: 4, 599: 4, 600: 2,
  601: 2, 602: 7, 603: 7, 604: 3, 605: 6, 606: 3, 607: 7, 608: 9,
  609: 3, 669: 7, 680: 7, 692: 7, 694: 7, 697: 7,
};
// the favourites he named (7 stars each): in TOP Sounds. A non-enumerable property, so that Object.keys(RATINGS) stays the rated presets.
Object.defineProperty(RATINGS, 'FAV', { value: [669, 680, 692, 694, 697, 377], enumerable: false });
module.exports = RATINGS;
