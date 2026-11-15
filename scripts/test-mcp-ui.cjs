const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let texts = [], callbacks = new Map(), focus = { terminal:'t1',cwd:'/project',space:'s',tab:'tab' }, calls = [];
function builder() {
  let proxy, id;
  proxy = new Proxy({}, {get(_t,key) {
    if(key==='id') return value=>{ id=value;return proxy; };
    if(key==='when') return (yes,cb)=>{if(yes)cb(proxy);return proxy;};
    if(key==='child') return value=>{if(typeof value==='string')texts.push(value);return proxy;};
    if(key==='on_click') return cb=>{callbacks.set(id,cb);return proxy;};
    return ()=>proxy;
  }});return proxy;
}
const source=fs.readFileSync(path.join(__dirname,'../packages/mcp-manager/mods/mcp-manager/main.js'),'utf8').replace(/^import .*;\r?$/gm,'').replace('export default class ','class ');
const sandbox={View:class{},div:builder,h_flex:builder,v_flex:builder,theme:()=>({}),focused:()=>focus,
  panes:()=>[{terminal:'t1',app:'pi'}],agents:()=>[],terminals:()=>[],spaces:()=>[{id:'s',machine:null}],
  appHome:()=>'/app',layout:()=>({}),run:()=>{},exec:async(_cmd,args)=>{calls.push(JSON.parse(args[1]));return {code:0,stdout:JSON.stringify({rows:[],files:[],writable:true,snapshot:'new'})};}};
vm.runInNewContext(source+'\nthis.Exported=McpManager;',sandbox);
const panel=new sandbox.Exported();let task;
const cx={timer:{every:()=>{}},notify:()=>{},spawn:fn=>{task=fn(cx);}};
(async()=>{
  panel.init({},cx);panel.render(cx);await task;assert.equal(calls[0].client,'pi');
  panel.data={rows:[{name:'fixture',file:'/project/.pi/mcp.json',scope:'Proyecto',enabled:true}],files:[],writable:true,snapshot:'fixture'};
  texts=[];callbacks.clear();panel.render(cx);assert.ok(texts.includes('ON · Desactivar'));
  callbacks.get('toggle-0')({},cx);assert.equal(calls.length,1,'selection must not write');
  panel.render(cx);assert.ok(texts.includes('Confirmar cambio'));assert.ok(panel.pending);
  callbacks.get('cancel')({},cx);assert.equal(panel.pending,null);assert.equal(calls.length,1);
  callbacks.get('toggle-0')({},cx);panel.render(cx);callbacks.get('confirm')({},cx);await task;
  assert.equal(calls[1].action,'apply');assert.equal(calls[1].confirmed,true);assert.equal(calls[1].snapshot,'fixture');
  panel.pending={names:['fixture']};focus={terminal:'shell',cwd:'/other',space:'s',tab:'other'};
  texts=[];panel.render(cx);assert.equal(panel.pending,null);assert.equal(panel.data,null);assert.ok(texts.includes('Sin agente compatible enfocado'));
  console.log('Passed MCP UI (mock builders): loaded/row/confirmation/cancel/apply branches, no write before confirmation, focus change clears stale context.');
})().catch(e=>{console.error(e);process.exitCode=1;});
