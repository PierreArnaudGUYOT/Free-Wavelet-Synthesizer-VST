# Demo music sources

All demo pieces come from the [Mutopia Project](https://www.mutopiaproject.org) (free sheet music typeset with
GNU LilyPond; MIDI files generated from the scores). `node tools/make_demo.js` converts the first part of each
piece (cut at a natural phrase, about 2–2.5 minutes) into `web/js/demo_data.js`.

| File | Piece | Licence | Source |
|---|---|---|---|
| `ToccataFugue.mid` | J. S. Bach — Toccata and Fugue in D minor, BWV 565 (Toccata only) | Public Domain | [piece 1780](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1780), Bach-Gesellschaft Ausgabe 1867 |
| `appassionata3.mid` | L. van Beethoven — Piano Sonata No. 23 "Appassionata", Op. 57, III. Allegro ma non troppo – Presto | Public Domain | [LVB_Sonate_57_3.mid](https://www.mutopiaproject.org/ftp/BeethovenLv/O57/LVB_Sonate_57_3/LVB_Sonate_57_3.mid) |
| `moonlight3.mid` | L. van Beethoven — Piano Sonata No. 14 "Moonlight", Op. 27 No. 2, III. Presto agitato | **Creative Commons Attribution-ShareAlike 2.5** — typeset by **Stewart Holmes** (stewartholmes.com) for the Mutopia Project, source: Berners 1908, ed. A. Winterberger | [piece 276](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=276) |
| `rondo129.mid` | L. van Beethoven — Rondo a capriccio, Op. 129 "Rage over a Lost Penny" | Public Domain | [beethoven_rondo_op129.mid](https://www.mutopiaproject.org/ftp/BeethovenLv/O129/beethoven_rondo_op129/beethoven_rondo_op129.mid) |
| `symphony5.mid` | L. van Beethoven — Symphony No. 5, Op. 67, I. Allegro con brio (piano reduction) | Public Domain | [beethoven_fifth_op67.mid](https://www.mutopiaproject.org/ftp/BeethovenLv/O67/beethoven_fifth_op67/beethoven_fifth_op67.mid) |
| `pathetique1.mid` | L. van Beethoven — Piano Sonata No. 8 "Pathétique", Op. 13, I. Grave – Allegro di molto e con brio | Public Domain | [pathetique-1.mid](https://www.mutopiaproject.org/ftp/BeethovenLv/O13/pathetique-1/pathetique-1.mid) |
| `tempest1.mid` | L. van Beethoven — Piano Sonata No. 17 "The Tempest", Op. 31 No. 2, I. Largo – Allegro | Public Domain | [LVB_Sonate_31no2_1.mid](https://www.mutopiaproject.org/ftp/BeethovenLv/O31/LVB_Sonate_31no2_1/LVB_Sonate_31no2_1.mid) |
| `op111_1.mid` | L. van Beethoven — Piano Sonata No. 32, Op. 111, I. Maestoso – Allegro con brio ed appassionato | Public Domain | [lvb_sonate_111_1.mid](https://www.mutopiaproject.org/ftp/BeethovenLv/O111/lvb_sonate_111_1/lvb_sonate_111_1.mid) |

Notes
- The "Moonlight" MIDI has no tempo mark (LilyPond writes 60 BPM); the demo plays it 2.8× faster (Presto agitato, ≈ 168 BPM).
  Its converted note data in `web/js/demo_data.js` is a derivative of the CC BY-SA 2.5 file and is shared under the
  same licence, with the attribution above (also shown in the demo window).
- Copyrighted songs are not bundled. Users can play their own MIDI files with "Load a MIDI file…" in the DEMO menu.
