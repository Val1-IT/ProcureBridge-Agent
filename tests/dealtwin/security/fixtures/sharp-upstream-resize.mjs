/*!
  Copyright 2013 Lovell Fuller and others.
  SPDX-License-Identifier: Apache-2.0
  Selected test bodies unchanged from sharp v0.35.5 test/unit/resize.js.
  Harness only: select the installed Sharp module via DEALTWIN_SHARP_MODULE.
  Source and SHA-256: docs/dealtwin/SHARP-MINIFLARE-20261018.md.
*/
import {suite, test} from 'node:test';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.DEALTWIN_SHARP_MODULE);
suite('Selected upstream bounded resize contracts', () => {
  test('Invalid width - NaN', (t) => {
    t.plan(1);
    t.assert.throws(() => {
      sharp().resize('spoons', 240);
    }, /Expected positive integer between 1 and 100000000 for width but received spoons of type string/);
  });

  test('Invalid height - NaN', (t) => {
    t.plan(1);
    t.assert.throws(() => {
      sharp().resize(320, 'spoons');
    }, /Expected positive integer between 1 and 100000000 for height but received spoons of type string/);
  });

  test('Invalid width - float', (t) => {
    t.plan(1);
    t.assert.throws(() => {
      sharp().resize(1.5, 240);
    }, /Expected positive integer between 1 and 100000000 for width but received 1.5 of type number/);
  });

  test('Invalid height - float', (t) => {
    t.plan(1);
    t.assert.throws(() => {
      sharp().resize(320, 1.5);
    }, /Expected positive integer between 1 and 100000000 for height but received 1.5 of type number/);
  });

  test('Invalid width - via options', (t) => {
    t.plan(1);
    t.assert.throws(() => {
      sharp().resize({ width: 1.5, height: 240 });
    }, /Expected positive integer between 1 and 100000000 for width but received 1.5 of type number/);
  });

  test('Invalid height - via options', (t) => {
    t.plan(1);
    t.assert.throws(() => {
      sharp().resize({ width: 320, height: 1.5 });
    }, /Expected positive integer between 1 and 100000000 for height but received 1.5 of type number/);
  });

  test('Ensure shortest edge (height) is at least 1 pixel', async (t) => {
    t.plan(2);
    const output = await sharp({
      create: {
        width: 10,
        height: 2,
        channels: 3,
        background: 'red'
      }
    })
      .resize(2)
      .toBuffer({ resolveWithObject: true });
    t.assert.strictEqual(2, output.info.width);
    t.assert.strictEqual(1, output.info.height);
  });

  test('Ensure shortest edge (width) is at least 1 pixel', async (t) => {
    t.plan(2);
    const output = await sharp({
      create: {
        width: 2,
        height: 10,
        channels: 3,
        background: 'red'
      }
    })
      .resize(null, 2)
      .toBuffer({ resolveWithObject: true });
    t.assert.strictEqual(1, output.info.width);
    t.assert.strictEqual(2, output.info.height);
  });

  test('Ensure embedded shortest edge (height) is at least 1 pixel', async (t) => {
    t.plan(2);
    const output = await sharp({
      create: {
        width: 200,
        height: 1,
        channels: 3,
        background: 'red'
      }
    })
      .resize({ width: 50, height: 50, fit: sharp.fit.contain })
      .toBuffer({ resolveWithObject: true });
    t.assert.strictEqual(50, output.info.width);
    t.assert.strictEqual(50, output.info.height);
  });

  test('Ensure embedded shortest edge (width) is at least 1 pixel', async (t) => {
    t.plan(2);
    const output = await sharp({
      create: {
        width: 1,
        height: 200,
        channels: 3,
        background: 'red'
      }
    })
      .resize({ width: 50, height: 50, fit: sharp.fit.contain })
      .toBuffer({ resolveWithObject: true });
    t.assert.strictEqual(50, output.info.width);
    t.assert.strictEqual(50, output.info.height);
  });
});
