/* pdf-share.js v1 — معاينة PDF داخل البرنامج + «إرسال واتساب» (مشاركة الملف نفسه) بدون حفظ على الجهاز.
   PdfShare.open(blob, name, {title}) → شاشة كاملة: الصفحات (pdf.js، ولو فشل: iframe/object)، وتحت:
   «إرسال واتساب» (navigator.share بالملف، متنادية جوه الضغطة نفسها) · «تحميل» (بس لو المستخدم ضغطها) · «رجوع للتعديل».
   لو المتصفح مش بيقدر يشارك ملفات (كمبيوتر): رسالة + «تحميل الملف» + «فتح واتساب ويب». مفيش أي تحميل تلقائي. */
(function(){
'use strict';
if(window.PdfShare)return;
var base=(function(){var s=document.currentScript&&document.currentScript.src;return s?s.replace(/[^\/]*$/,''):''})();
var T={title:'معاينة التقرير',send:'إرسال واتساب',dl:'تحميل',back:'رجوع للتعديل',loading:'جاري عرض التقرير…',
 pages:function(n){return n===1?'صفحة واحدة':n===2?'صفحتين':n+' صفحات'},
 noShare:'المتصفح ده (غالباً كمبيوتر) مش بيقدر يبعت الملف لواتساب مباشرة.\nاضغط «تحميل الملف»، وبعدين «فتح واتساب ويب» واسحب الملف جوه المحادثة (أو من علامة 📎).',
 noShareShort:'على الكمبيوتر: «إرسال واتساب» هيوريك خطوتين (تحميل الملف ثم واتساب ويب).',
 fail:'مقدرناش نفتح المشاركة. جرّب تاني، أو استخدم «تحميل».',
 tip:'«إرسال واتساب» بيفتح قائمة المشاركة — اختار واتساب. الملف بيتبعت من غير ما يتحفظ على الموبايل.'};
var st=null,lib=null,libP=null;
var css='.psx{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;overflow:hidden;z-index:2147483000;background:#525659;display:flex;flex-direction:column;direction:rtl;font-family:inherit;color:#fff;-webkit-text-size-adjust:100%}'+
'.psx *{box-sizing:border-box}.psx-top{display:flex;min-width:0;align-items:center;gap:8px;padding:10px 12px;padding-top:max(10px,env(safe-area-inset-top));background:#1f2d24;box-shadow:0 1px 4px rgba(0,0,0,.4)}'+
'.psx-top b{font-size:16px}.psx-top .psx-nm{flex:1;min-width:0;font-size:12px;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;unicode-bidi:plaintext}'+
'.psx-x{background:transparent;border:1px solid rgba(255,255,255,.5);color:#fff;border-radius:8px;padding:6px 10px;font:inherit;font-size:13px}'+
'.psx-z{background:rgba(255,255,255,.15);border:0;color:#fff;border-radius:8px;width:34px;height:32px;font-size:18px;line-height:1}'+
'.psx-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 8px 16px;touch-action:pan-x pan-y pinch-zoom}'+
'.psx-pg{display:block;margin:0 auto 10px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.45);max-width:none}'+
'.psx-msg{text-align:center;padding:30px 10px;font-size:15px}.psx-frame{width:100%;height:100%;min-height:70vh;border:0;background:#fff}'+
'.psx-bar{background:#fff;color:#222;padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));box-shadow:0 -2px 8px rgba(0,0,0,.3)}'+
'.psx-row{display:flex;gap:8px;min-width:0}.psx-btn{flex:1;min-width:0;border:0;border-radius:12px;padding:13px 8px;font:inherit;font-size:16px;font-weight:700;cursor:pointer}'+
'.psx-wa{background:#25d366;color:#fff;font-size:18px}.psx-wa:active{background:#1da851}.psx-sec{background:#eef1ee;color:#1f2d24}'+
'.psx-hint{font-size:12px;color:#555;text-align:center;margin:0 0 8px;line-height:1.5}'+
'.psx-dlg{position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}'+
'.psx-card{background:#fff;color:#222;border-radius:14px;max-width:440px;width:100%;padding:18px;box-shadow:0 6px 24px rgba(0,0,0,.4)}'+
'.psx-card p{white-space:pre-line;line-height:1.7;margin:0 0 14px;font-size:15px}.psx-card .psx-row{flex-wrap:wrap}';
function addCss(){if(document.getElementById('psx-css'))return;var s=document.createElement('style');s.id='psx-css';s.textContent=css;document.head.appendChild(s)}
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function canFiles(file){try{return !!(navigator.canShare&&navigator.share&&navigator.canShare({files:[file]}))}catch(e){return false}}
function loadLib(){if(lib)return Promise.resolve(lib);if(libP)return libP;
 libP=new Promise(function(res,rej){if(window.pdfjsLib){lib=window.pdfjsLib;try{if(!lib.GlobalWorkerOptions.workerSrc)lib.GlobalWorkerOptions.workerSrc=base+'pdfjs/pdf.worker.min.js?v=3.11.174'}catch(e){}return res(lib)}
  var s=document.createElement('script');s.src=base+'pdfjs/pdf.min.js?v=3.11.174';s.onload=function(){lib=window.pdfjsLib||window['pdfjs-dist/build/pdf'];if(!lib)return rej(new Error('pdfjs'));
   lib.GlobalWorkerOptions.workerSrc=base+'pdfjs/pdf.worker.min.js?v=3.11.174';res(lib)};s.onerror=function(){libP=null;rej(new Error('pdfjs load'))};document.head.appendChild(s)});
 return libP}
/* explicit download (only from a user tap) */
function download(blob,name){var u=URL.createObjectURL(blob);var a=document.createElement('a');a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(u);a.remove()},4000);log('download',name)}
function dlAll(){if(!st)return;var s=st;download(s.blob,s.name);(s.extra||[]).forEach(function(x,k){setTimeout(function(){download(x,x.name)},(k+1)*700)})}
function log(k,v){var L=window.__pdfShareLog=window.__pdfShareLog||[];L.push({k:k,v:v,t:Date.now()})}
function dialog(msg,buttons){var d=el('div','psx-dlg');var c=el('div','psx-card');c.appendChild(el('p',null,msg));var r=el('div','psx-row');
 buttons.forEach(function(b){var x=el('button','psx-btn '+(b.cls||'psx-sec'),b.t);x.type='button';x.onclick=function(){if(b.keep!==true)d.remove();b.fn&&b.fn()};r.appendChild(x)});
 c.appendChild(r);d.appendChild(c);st.root.appendChild(d);return d}
function share(){/* MUST stay synchronous up to navigator.share (iOS user-gesture rule) */
 if(!st)return;var f=st.file;var all=[f].concat(st.extra||[]);var files=null;
 try{if(all.length>1&&navigator.canShare&&navigator.canShare({files:all}))files=all}catch(e){}
 if(!files&&canFiles(f))files=[f];
 if(files){log('share',{name:f.name,type:f.type,size:f.size,n:files.length,names:files.map(function(x){return x.name})});var o={files:files};if(st.title)o.title=st.title;
  var p;try{p=navigator.share(o)}catch(e){p=Promise.reject(e)}
  p.then(function(){log('shared',f.name)},function(e){if(e&&e.name==='AbortError')return;log('shareErr',String(e&&e.name||e));dialog(T.fail,[{t:'تمام'}])});return}
 log('noShare',f.name);
 dialog(T.noShare,[{t:'⬇ تحميل الملف',cls:'psx-sec',keep:true,fn:dlAll},{t:'فتح واتساب ويب',cls:'psx-wa',keep:true,fn:function(){window.open('https://web.whatsapp.com/','_blank','noopener')}},{t:'إغلاق'}])}
function close(fromPop){if(!st)return;var s=st;st=null;try{s.task&&s.task.destroy&&s.task.destroy()}catch(e){}if(s.url)URL.revokeObjectURL(s.url);s.root.remove();document.documentElement.style.overflow=s.ov||'';
 if(!fromPop&&history.state&&history.state.psx)try{history.back()}catch(e){}if(s.onClose)try{s.onClose()}catch(e){}}
window.addEventListener('popstate',function(){if(st)close(true)});
function fallbackView(){var b=st.body;b.innerHTML='';st.url=st.url||URL.createObjectURL(st.blob);var o=document.createElement('object');o.type='application/pdf';o.data=st.url;o.className='psx-frame';
 var f=document.createElement('iframe');f.className='psx-frame';f.src=st.url;f.title=st.name;o.appendChild(f);b.appendChild(o);st.mode='frame';log('view','frame')}
function render(){var s=st;var w=Math.max(200,s.body.clientWidth-16);
 return loadLib().then(function(L){if(s!==st)return;return s.blob.arrayBuffer().then(function(buf){
  s.task=L.getDocument({data:new Uint8Array(buf),isEvalSupported:false,disableFontFace:false,useSystemFonts:true});return s.task.promise})}).then(function(doc){if(!doc||s!==st)return;s.doc=doc;s.pages=doc.numPages;s.cnt.textContent=T.pages(doc.numPages);return draw()}).catch(function(e){if(s!==st)return;log('pdfjsErr',String(e&&e.message||e));fallbackView()})}
function draw(){var s=st;if(!s||!s.doc)return;var body=s.body;body.innerHTML='';var w=Math.max(200,body.clientWidth-16)*s.zoom;var dpr=Math.min(window.devicePixelRatio||1,3);
 var chain=Promise.resolve();for(var i=1;i<=s.doc.numPages;i++)(function(n){chain=chain.then(function(){if(s!==st)return;return s.doc.getPage(n).then(function(pg){var v1=pg.getViewport({scale:1});var sc=w/v1.width;
  var q=Math.min(sc*dpr,Math.sqrt(16e6/(v1.width*v1.height)));var vp=pg.getViewport({scale:q});var c=document.createElement('canvas');c.className='psx-pg';c.width=Math.floor(vp.width);c.height=Math.floor(vp.height);c.style.width=Math.floor(w)+'px';c.style.height=Math.floor(w*v1.height/v1.width)+'px';c.setAttribute('aria-label','صفحة '+n);body.appendChild(c);
  return pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise})})})(i);
 return chain.then(function(){if(s===st){s.mode='pdfjs';log('view','pdfjs:'+s.doc.numPages)}})}
function open(blob,name,opt){opt=opt||{};if(st)close(true);if(!(blob instanceof Blob))throw new Error('PdfShare: no PDF');addCss();
 if(blob.type!=='application/pdf')blob=new Blob([blob],{type:'application/pdf'});name=String(name||'تقرير.pdf');if(!/\.pdf$/i.test(name))name+='.pdf';name=name.replace(/[\\\/:*?"<>|]+/g,'-');
 var file=new File([blob],name,{type:'application/pdf',lastModified:Date.now()});
 var root=el('div','psx');root.setAttribute('role','dialog');root.setAttribute('aria-label',T.title);
 var top=el('div','psx-top');var x=el('button','psx-x','✕ '+T.back);x.type='button';top.appendChild(el('b',null,opt.heading||T.title));var nm=el('span','psx-nm',name);top.appendChild(nm);
 var zo=el('button','psx-z','−'),zi=el('button','psx-z','+');zo.type=zi.type='button';zo.setAttribute('aria-label','تصغير');zi.setAttribute('aria-label','تكبير');top.appendChild(zo);top.appendChild(zi);top.appendChild(x);
 var body=el('div','psx-body');body.appendChild(el('div','psx-msg',T.loading));
 var bar=el('div','psx-bar');var can=canFiles(file);var hint=el('p','psx-hint',(can?T.tip:T.noShareShort));var cnt=el('span');if(opt.note)hint.appendChild(document.createTextNode(' '+opt.note));hint.appendChild(document.createTextNode(' '));hint.appendChild(cnt);
 var r=el('div','psx-row');var bw=el('button','psx-btn psx-wa','🟢 '+T.send),bd=el('button','psx-btn psx-sec','⬇ '+T.dl),bb=el('button','psx-btn psx-sec',T.back);
 bw.type=bd.type=bb.type='button';bw.id='psxSend';bd.id='psxDownload';bb.id='psxBack';bw.style.flex='2';r.appendChild(bw);r.appendChild(bd);r.appendChild(bb);bar.appendChild(hint);bar.appendChild(r);
 root.appendChild(top);root.appendChild(body);root.appendChild(bar);document.body.appendChild(root);
 st={extra:(opt.extra||[]).filter(function(x){return x instanceof File}),root:root,body:body,blob:blob,file:file,name:name,title:opt.title||name.replace(/\.pdf$/i,''),zoom:1,cnt:cnt,ov:document.documentElement.style.overflow,onClose:opt.onClose};
 document.documentElement.style.overflow='hidden';
 bw.addEventListener('click',share);bd.addEventListener('click',dlAll);bb.addEventListener('click',function(){close()});x.addEventListener('click',function(){close()});
 zi.addEventListener('click',function(){if(st&&st.doc&&st.zoom<3){st.zoom=Math.min(3,st.zoom*1.4);draw()}});zo.addEventListener('click',function(){if(st&&st.doc&&st.zoom>0.6){st.zoom=Math.max(0.6,st.zoom/1.4);draw()}});
 if(opt.history!==false)try{history.pushState({psx:1},'')}catch(e){}
 window.__pdfShare={name:name,size:blob.size,type:file.type,canShare:can};log('open',{name:name,size:blob.size,canShare:can});
 render();return {close:close}}
window.PdfShare={open:open,close:function(){close()},canShareFiles:function(){try{return canFiles(new File([new Blob(['%PDF'],{type:'application/pdf'})],'x.pdf',{type:'application/pdf'}))}catch(e){return false}},download:download,current:function(){return st?{blob:st.blob,name:st.name,file:st.file}:null},version:1};
})();
