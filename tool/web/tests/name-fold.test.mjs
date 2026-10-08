import test from 'node:test';
import assert from 'node:assert/strict';
import {foldName} from '../src/utils/placement.ts';
test('Indic zero-class vowel marks stay distinct, accents still fold',()=>{
 assert.notEqual(foldName('कुमार'),foldName('कुमर'));
 assert.equal(foldName('José'),foldName('JOSE'));
 assert.equal(foldName('कुमार'),'कुमार');
});
test('fixed Unicode contract preserves newer-runtime marks identically',()=>{
 assert.equal(foldName('A\u1ac1'),'a\u1ac1');
});
