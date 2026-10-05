// College State and District boxes. State starts on Himachal Pradesh, whose districts are a list;
// another state is typed in, and so is its district. The saved values sit in two hidden inputs
// (collegeState, collegeDistrict), so saving and loading the form treat them like any other field.
export const HP = 'Himachal Pradesh';
export const HP_DISTRICTS = ['Bilaspur', 'Chamba', 'Hamirpur', 'Kangra', 'Kinnaur', 'Kullu', 'Lahaul and Spiti', 'Mandi', 'Shimla', 'Sirmaur', 'Solan', 'Una'];

const s = v => (v == null ? '' : String(v)).trim();
const hpDistrict = text => HP_DISTRICTS.find(x => x.toLowerCase() === s(text).toLowerCase()) || '';

// What the boxes show for a saved state and district. No state (a new or earlier draft) means Himachal Pradesh;
// an earlier district text that is not one of its districts is kept as an extra list entry, so nothing is lost.
export function placeView(state, district) {
  const st = s(state), d = s(district);
  if (st && st.toLowerCase() !== HP.toLowerCase()) return { stateChoice: 'other', stateText: st, districtMode: 'text', district: d, extra: '' };
  const match = hpDistrict(d);
  return { stateChoice: 'hp', stateText: '', districtMode: 'list', district: match || d, extra: match || !d ? '' : d };
}

// The saved values from the boxes that are showing.
export function placeValues({ stateChoice, stateText, districtList, districtText }) {
  if (stateChoice === 'hp') return { collegeState: HP, collegeDistrict: s(districtList) };
  return { collegeState: s(stateText), collegeDistrict: s(districtText) };
}

// Wires the boxes; returns show(), which redraws them from the hidden inputs (call it after a record is loaded).
export function initPlaceUi(form) {
  const el = id => form.querySelector('#' + id);
  const choice = el('collegeStateChoice'), stateText = el('collegeStateOther');
  const list = el('collegeDistrictList'), districtText = el('collegeDistrictOther');
  const saved = { state: form.elements.collegeState, district: form.elements.collegeDistrict };

  const fillList = extra => {
    list.replaceChildren(new Option('Choose district', ''), ...HP_DISTRICTS.map(d => new Option(d, d)));
    if (extra) list.add(new Option(extra, extra));
  };
  const showMode = () => {
    const hp = choice.value === 'hp';
    stateText.classList.toggle('hidden', hp);
    list.classList.toggle('hidden', !hp);
    districtText.classList.toggle('hidden', hp);
  };
  const store = () => {
    const v = placeValues({ stateChoice: choice.value, stateText: stateText.value, districtList: list.value, districtText: districtText.value });
    saved.state.value = v.collegeState;
    saved.district.value = v.collegeDistrict;
  };

  function show() {
    const v = placeView(saved.state.value, saved.district.value);
    choice.value = v.stateChoice;
    stateText.value = v.stateText;
    fillList(v.extra);
    list.value = v.districtMode === 'list' ? v.district : '';
    districtText.value = v.districtMode === 'text' ? v.district : '';
    showMode();
    store();
  }

  // These run before the form's own input/change listeners, so the hidden inputs are up to date when it saves.
  choice.addEventListener('change', () => {
    if (choice.value === 'hp') { const d = hpDistrict(districtText.value); fillList(''); list.value = d; }
    else districtText.value = list.value;
    showMode();
    store();
    if (choice.value === 'other') stateText.focus();
  });
  for (const box of [stateText, list, districtText]) {
    box.addEventListener('input', store);
    box.addEventListener('change', store);
  }
  show();
  return show;
}
