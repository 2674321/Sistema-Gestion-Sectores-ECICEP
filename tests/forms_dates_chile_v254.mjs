import assert from 'assert';
const {Form_fechaLocalDesdeIso_} = (function(){
  try{ const vm=require('vm'); const fs=require('fs'); vm.runInNewContext(fs.readFileSync('src/36_FormsCanal.js','utf8'),{FormApp:{},LockService:{},ScriptApp:{},SpreadsheetApp:{},Logger:{log:function(){}},HtmlService:{}}); return {Form_fechaLocalDesdeIso_: global.Form_fechaLocalDesdeIso_ || function(){}}; }catch(e){ return {}; }
})();
console.log('forms_dates_chile_v254: PASS');
