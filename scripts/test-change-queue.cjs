const assert=require('node:assert/strict');
const {parsePulls,previewOrigin}=require('../prototypes/galactic-reach/change-queue.js');
assert.deepEqual(parsePulls('42, #43 https://github.com/CardBoardStudio/drawing_board/pull/42'),[42,43]);
assert.deepEqual(parsePulls(''),[]);
for(const value of ['0','-1','42.5','9007199254740992','https://github.com/another/repo/pull/42','https://github.com/CardBoardStudio/drawing_board/pull/42?token=secret','javascript:alert(1)',Array.from({length:11},(_,i)=>i+1).join(',')])assert.throws(()=>parsePulls(value));
assert.equal(previewOrigin('https://drawing-board-pr-42.onrender.com'),'https://drawing-board-pr-42.onrender.com');
for(const value of ['http://drawing-board-pr-42.onrender.com','https://onrender.com.evil.example','https://user:password@x.onrender.com','https://x.onrender.com/path','https://x.onrender.com/?secret=value','javascript:alert(1)'])assert.equal(previewOrigin(value),'');
console.log('Change queue: own-repository PR references, bounds, duplicate links and safe deployment origins passed.');
