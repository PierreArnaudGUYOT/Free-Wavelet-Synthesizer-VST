// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Node wrapper around the shared MIDI reader (web/js/midi.js).
'use strict';
const WSReadMIDI = require('../web/js/midi.js');
module.exports = { readSMF: (buf) => WSReadMIDI(new Uint8Array(buf.buffer, buf.byteOffset, buf.length)) };
