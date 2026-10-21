// Copyright (C) 2026 Pierre Arnaud GUYOT (OktoPierre)
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the descriptions of the candidates of the pool again from their layers, relations and recipes (compose.js describe): the body
// first, then the other layers with their relation to it, then what the LFOs do. node tools/supermod/redescribe.js
'use strict';
const fs = require('fs');
const path = require('path');
const { describe } = require('./compose.js');
const LAY = require('./layers.js');
const SPEC = require('../preset_lab.js').SPEC;
const POOL = path.join(__dirname, '..', 'out', 'super_pool.json');
const rows = JSON.parse(fs.readFileSync(POOL, 'utf8'));
const byId = Object.fromEntries([...LAY.A, ...LAY.B].map(l => [l.id, l]));
const SLOT_IDS = ['A1', 'A2', 'B1'];
let n = 0;
for (const c of rows) {
  if (c.meta.kind === 'perc') continue;   // a drum keeps its own description (perc.js)
  const slots = c.meta.cfg.match(/[AB]\d/g), body = slots[c.meta.roles.indexOf('body')];
  const order = [body, ...slots.filter(s => s !== body)];
  const layers = order.map(s => byId[c.meta.layers[slots.indexOf(s)]]);
  const oscs = order.map((s) => {
    const k = SPEC.SLOTS[SLOT_IDS.indexOf(s)].k, g = (f) => c.v[SPEC.PARAMS[k[f]].key] || 0;
    return { oct: g('oct'), semi: g('semi'), fine: g('fine') };
  });
  c.desc = describe(layers, oscs, c.meta.mods, c.v);
  c.meta.bodySlot = body; c.meta.order = order; n++;
}
fs.writeFileSync(POOL, JSON.stringify(rows));
console.log(n + ' descriptions written again');
