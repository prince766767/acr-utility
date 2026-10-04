const assert=require('assert');const {calculate,scoreActivity}=require('../public/api-rules.js');
assert.equal(calculate({categoryOne:{allocated:100,conducted:90,excess:20,resources:21,innovation:5,examination:30},categoryTwo:{extension:20,institutional:15,professional:15}}).categoryOne.total,105);
assert.equal(calculate({categoryTwo:{extension:20,institutional:15,professional:15}}).categoryTwo.total,25);
assert.equal(scoreActivity({type:'paper',paperKind:'refereed',indexed:true,impactFactor:2.5,authorCount:1}),35);
assert.equal(scoreActivity({type:'paper',paperKind:'refereed',authorCount:3,isLeadAuthor:true,leadAuthorCount:1}),9);
assert.equal(scoreActivity({type:'training',weeks:4}),20);
assert.equal(calculate({categoryThree:[{type:'training',weeks:2},{type:'training',weeks:2}]}).categoryThree,30);
console.log('API rule tests passed');
