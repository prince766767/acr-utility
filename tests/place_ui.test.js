import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HP, HP_DISTRICTS, placeView, placeValues } from '../place_ui.js';
import { tokenValues } from '../acr_fields.js';

test('the 12 districts of Himachal Pradesh', () => {
  assert.deepEqual(HP_DISTRICTS, ['Bilaspur', 'Chamba', 'Hamirpur', 'Kangra', 'Kinnaur', 'Kullu', 'Lahaul and Spiti', 'Mandi', 'Shimla', 'Sirmaur', 'Solan', 'Una']);
});

test('a new draft starts on Himachal Pradesh with the district list', () => {
  const v = placeView('', '');
  assert.deepEqual(v, { stateChoice: 'hp', stateText: '', districtMode: 'list', district: '', extra: '' });
  assert.deepEqual(placeValues({ ...v, districtList: '', districtText: '' }), { collegeState: HP, collegeDistrict: '' });
});

test('an earlier district text that names an HP district selects it, ignoring capitals', () => {
  assert.deepEqual(placeView('', ' hamirpur '), { stateChoice: 'hp', stateText: '', districtMode: 'list', district: 'Hamirpur', extra: '' });
  assert.equal(placeView('himachal pradesh', 'LAHAUL AND SPITI').district, 'Lahaul and Spiti');
});

test('an earlier district text that is not an HP district is kept as an extra list entry', () => {
  assert.deepEqual(placeView('', 'Hamirpur (HP)'), { stateChoice: 'hp', stateText: '', districtMode: 'list', district: 'Hamirpur (HP)', extra: 'Hamirpur (HP)' });
});

test('another state shows the typed state and a district text box', () => {
  assert.deepEqual(placeView('Haryana', 'Gurugram'), { stateChoice: 'other', stateText: 'Haryana', districtMode: 'text', district: 'Gurugram', extra: '' });
});

test('saved values come from the boxes that are showing', () => {
  assert.deepEqual(placeValues({ stateChoice: 'hp', stateText: 'Haryana', districtList: 'Mandi', districtText: 'Gurugram' }), { collegeState: HP, collegeDistrict: 'Mandi' });
  assert.deepEqual(placeValues({ stateChoice: 'other', stateText: ' Haryana ', districtList: 'Mandi', districtText: ' Gurugram ' }), { collegeState: 'Haryana', collegeDistrict: 'Gurugram' });
});

test('Word cover line is District, State, PIN (only the filled parts)', () => {
  const place = profile => tokenValues({ profile }).COLLEGE_PLACE;
  assert.equal(place({ collegeDistrict: 'Hamirpur', collegeState: HP, collegePin: '176001' }), 'Hamirpur, Himachal Pradesh, 176001');
  assert.equal(place({ collegeState: 'Haryana', collegePin: '122001' }), 'Haryana, 122001');
  assert.equal(place({ collegeDistrict: 'Gurugram', collegeState: 'Haryana' }), 'Gurugram, Haryana');
});
