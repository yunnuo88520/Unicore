// Author: yunnuo <ymz@ebox.vip>
// Description: Feature choices keep notes opt-out and reject attempts to trim foundation settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFeatures } from './build-features.mjs';

test('notes remain enabled by default including direct Go builds', () => {
 const {features,tags}=readFeatures({});
 assert.equal(features.notes,true);
 assert(!tags.includes('no_notes'));
});
test('notes omission composes with existing integrations', () => {
 for(const license of [true,false])for(const updater of [true,false]){
  const {features,tags}=readFeatures({FEATURE_NOTES:'false',FEATURE_LICENSE:String(license),FEATURE_UPDATER:String(updater)});
  assert.equal(features.notes,false);
  assert.deepEqual(tags.split(',').sort(),[license&&'license',updater&&'updater','no_notes'].filter(Boolean).sort());
 }
});
test('foundation settings cannot be trimmed and invalid booleans fail closed', () => {
 for(const env of [{FEATURE_SETTINGS:'false'},{FEATURE_USERS:'false'},{FEATURE_NOTES:'0'},{FEATURE_notes:'false'}]) assert.throws(()=>readFeatures(env));
});
