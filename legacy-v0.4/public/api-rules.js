(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined') module.exports = api;
  root.AcrRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RULES = Object.freeze({
    categoryOne: { classes: 50, excess: 10, resources: 20, innovation: 20, examination: 25 },
    categoryTwo: { extension: 20, institutional: 15, professional: 15, annualCap: 25 },
    papers: { refereed: 15, recognized: 10, proceedings: 10, indexedBonus: 5, impact: [[1, 2, 10], [2, 5, 15], [5, 10, 25]] },
    books: { international_book: 50, international_chapter: 10, national_book: 25, national_chapter: 5, local_book: 15, local_chapter: 3, international_volume_chapter: 10, national_volume_chapter: 5 },
    training: { twoWeeks: 20, oneWeek: 10, cap: 30 },
    conference: { international: 10, national: 7.5, state: 5, local: 3 },
    invited: { international: 10, national: 5 }
  });
  const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const cap = (value, maximum) => Math.max(0, Math.min(n(value), maximum));
  function impactBonus(impactFactor) {
    const f = n(impactFactor);
    const hit = RULES.papers.impact.find(([low, high]) => f >= low && f < high);
    return hit ? hit[2] : 0;
  }
  function sharedScore(base, item) {
    const count = Math.max(1, Math.trunc(n(item.authorCount || 1)));
    if (count === 1) return base;
    const leads = Math.max(1, Math.min(count, Math.trunc(n(item.leadAuthorCount || 1))));
    return item.isLeadAuthor ? base * 0.6 / leads : base * 0.4 / Math.max(1, count - leads);
  }
  function scoreActivity(item) {
    switch (item.type) {
      case 'paper': return sharedScore((RULES.papers[item.paperKind] || 0) + (item.indexed ? RULES.papers.indexedBonus : 0) + impactBonus(item.impactFactor), item);
      case 'book': return sharedScore(RULES.books[item.bookKind] || 0, item);
      case 'sponsored_project': { const lakh = n(item.amountLakh); return lakh > 5 ? 20 : lakh >= 3 ? 15 : lakh > .25 ? 10 : 0; }
      case 'consultancy': return Math.floor(n(item.amountLakh) / 2) * 10;
      case 'completed_project': return item.projectSize === 'major' ? 20 : item.projectSize === 'minor' ? 10 : 0;
      case 'outcome': return item.outcomeKind === 'international_patent' ? 50 : item.outcomeKind === 'national_policy' ? 30 : 0;
      case 'guidance': return item.guidanceKind === 'phd_awarded' ? 10 : item.guidanceKind === 'phd_submitted' ? 7 : item.guidanceKind === 'mphil_awarded' ? 3 : 0;
      case 'training': return n(item.weeks) >= 2 ? RULES.training.twoWeeks : n(item.weeks) >= 1 ? RULES.training.oneWeek : 0;
      case 'conference': return RULES.conference[item.level] || 0;
      case 'invited_lecture': return RULES.invited[item.level] || 0;
      default: return cap(item.manualScore, n(item.maxScore || 9999));
    }
  }
  function calculate(data) {
    const cat1 = data.categoryOne || {};
    const classes = n(cat1.allocated) ? RULES.categoryOne.classes * n(cat1.conducted) / n(cat1.allocated) : 0;
    const categoryOne = {
      classes: cap(classes, RULES.categoryOne.classes), excess: cap(cat1.excess, RULES.categoryOne.excess),
      resources: cap(cat1.resources, RULES.categoryOne.resources), innovation: cap(cat1.innovation, RULES.categoryOne.innovation),
      examination: cap(cat1.examination, RULES.categoryOne.examination)
    };
    categoryOne.total = Object.values(categoryOne).reduce((a, b) => a + b, 0);
    const cat2 = data.categoryTwo || {};
    const categoryTwo = {
      extension: cap(cat2.extension, RULES.categoryTwo.extension), institutional: cap(cat2.institutional, RULES.categoryTwo.institutional), professional: cap(cat2.professional, RULES.categoryTwo.professional)
    };
    categoryTwo.raw = Object.values(categoryTwo).reduce((a, b) => a + b, 0);
    categoryTwo.total = cap(categoryTwo.raw, RULES.categoryTwo.annualCap);
    const activities = (data.categoryThree || []).map((activity) => ({ ...activity, score: scoreActivity(activity) }));
    const training = activities.filter((a) => a.type === 'training').reduce((sum, a) => sum + a.score, 0);
    const categoryThree = activities.reduce((sum, a) => sum + (a.type === 'training' ? 0 : a.score), 0) + cap(training, RULES.training.cap);
    return { categoryOne, categoryTwo, activities, categoryThree, grandTotal: categoryOne.total + categoryTwo.total + categoryThree };
  }
  return { RULES, calculate, scoreActivity, impactBonus, sharedScore };
});
