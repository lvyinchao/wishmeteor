const configuration=document.querySelector('script[src="/site.js"]');
const privatePage=configuration?.dataset.private==='true'||location.search.includes('reset=');
const measurementId=configuration?.dataset.measurementId;
if(!privatePage&&/^G-[A-Z0-9]+$/.test(measurementId??'')) {
 window.dataLayer=window.dataLayer??[];window.gtag=(...args)=>window.dataLayer.push(args);
 window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 window.gtag('js',new Date());window.gtag('config',measurementId,{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false,page_location:location.origin+location.pathname});
 const script=document.createElement('script');script.async=true;script.dataset.wishmeteorGa='true';script.src=`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;document.head.append(script);
}
export async function api(path,payload,method='POST',options={}) {
 const response=await fetch(path,{method,credentials:'same-origin',headers:payload===undefined?{}:{'content-type':'application/json'},...(payload===undefined?{}:{body:JSON.stringify(payload)}),...options});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error??'Request could not be completed'),{status:response.status,data});return data;
}
const menu=document.querySelector('[data-account-menu]'),accountLink=document.querySelector('[data-account-nav]');
function showAccount(account) {
 if(!menu||!account)return;const identity=account.name?.trim()||account.email||'Account';menu.querySelector('[data-account-identity]').textContent=identity;menu.querySelector('summary').setAttribute('aria-label',`Account menu for ${identity}`);menu.hidden=false;accountLink.hidden=true;
}
api('/api/auth/me',undefined,'GET').then(data=>{showAccount(data.account);window.dispatchEvent(new CustomEvent('wishmeteor:session',{detail:data.account}));}).catch(()=>{});
window.addEventListener('wishmeteor:account',event=>showAccount(event.detail));
document.addEventListener('click',event=>{if(menu?.open&&!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu?.open){menu.open=false;menu.querySelector('summary').focus();}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'&&document.querySelector('#catalog-search')){event.preventDefault();document.querySelector('#catalog-search').focus();}});
menu?.querySelector('[data-logout]')?.addEventListener('click',async event=>{event.target.disabled=true;try{await api('/api/auth/logout',{});location.reload();}catch{event.target.disabled=false;}});
function imageFallbacks(root=document) {
 root.querySelectorAll('img[data-preview]').forEach(img=>{const fallback=()=>{if(img.dataset.fallback)return;img.dataset.fallback='true';img.closest('picture')?.querySelectorAll('source').forEach(s=>s.remove());img.src='/preview-fallback.svg';img.alt='WishMeteor project';};img.addEventListener('error',fallback,{once:true});if(img.complete&&img.naturalWidth===0)fallback();});
}
imageFallbacks();
let identityPromise;
let challengeScript;
async function voterIdentity() {
 try{return await api('/api/stars/identity',{});}catch(error){
  if(error.data?.error!=='challenge-required'||!error.data.siteKey)throw error;
  challengeScript??=new Promise((resolve,reject)=>{if(window.turnstile){resolve();return;}const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=()=>{challengeScript=undefined;reject(Error('challenge-unavailable'));};document.head.append(script);});
  await challengeScript;
  const dialog=document.createElement('dialog'),title=document.createElement('h2'),container=document.createElement('div'),cancel=document.createElement('button');title.textContent='Confirm your browser encouragement';title.id='star-challenge-title';dialog.setAttribute('aria-labelledby',title.id);cancel.textContent='Cancel';cancel.className='btn btn-quiet';cancel.type='button';dialog.append(title,container,cancel);document.body.append(dialog);dialog.showModal();let widget;
  try {const token=await new Promise((resolve,reject)=>{const stop=()=>reject(Error('challenge-cancelled'));cancel.onclick=stop;dialog.addEventListener('cancel',stop,{once:true});widget=window.turnstile.render(container,{sitekey:error.data.siteKey,action:'star_identity',callback:resolve,'error-callback':()=>reject(Error('challenge-failed')),'expired-callback':()=>reject(Error('challenge-expired'))});});return await api('/api/stars/identity',{challengeToken:token});}
  finally{if(widget!==undefined){window.turnstile.reset(widget);window.turnstile.remove(widget);}dialog.close();dialog.remove();}
 }
}
const starCache=new Map();
async function hydrateStars() {
 const cards=[...document.querySelectorAll('[data-slug]')].filter(c=>c.querySelector('[data-star-button]'));
 const slugs=[...new Set(cards.map(c=>c.dataset.slug))];if(!slugs.length)return;
 try {
  const missing=slugs.filter(slug=>!starCache.has(slug)||Date.now()-starCache.get(slug).time>30_000);
  await Promise.all(Array.from({length:Math.ceil(missing.length/40)},(_,i)=>missing.slice(i*40,(i+1)*40)).map(async batch=>{const data=await api('/api/stars?slugs='+encodeURIComponent(batch.join(',')),undefined,'GET');for(const slug of batch)starCache.set(slug,{count:data.counts[slug]??0,lit:data.lit?.includes(slug)??false,time:Date.now()});}));
  while(starCache.size>100)starCache.delete(starCache.keys().next().value);
  cards.forEach(card=>{const button=card.querySelector('[data-star-button]'),state=starCache.get(card.dataset.slug),lit=state?.lit??false;card.querySelector('[data-star-count]').textContent=state?.count??0;button.setAttribute('aria-pressed',String(lit));button.disabled=lit;card.querySelector('[data-star-label]').textContent=lit?'Your star is lit':'Light a star';});
 }catch{document.querySelectorAll('[data-star-status]').forEach(el=>el.textContent='Stars could not be loaded. Please try again later.');}
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-star-button]');if(!button||button.disabled)return;const card=button.closest('[data-slug]');button.disabled=true;
 try {
  identityPromise??=voterIdentity().catch(error=>{identityPromise=undefined;throw error;});await identityPromise;
  const result=await api('/api/stars',{slug:card.dataset.slug});starCache.set(card.dataset.slug,{count:result.count,lit:true,time:Date.now()});if(!result.alreadyLit)window.dispatchEvent(new CustomEvent('wishmeteor:star-added',{detail:{slug:card.dataset.slug}}));card.querySelector('[data-star-count]').textContent=result.count;button.setAttribute('aria-pressed','true');card.querySelector('[data-star-label]').textContent='Your star is lit';
  document.querySelectorAll('[data-star-status]').forEach(el=>el.textContent='Your browser’s encouragement is recorded.');
 }catch(error){button.disabled=false;document.querySelectorAll('[data-star-status]').forEach(el=>el.textContent=error.status===429?'Please wait before lighting another star.':'Your star could not be saved. Please try again.');}
});
void hydrateStars();
let comparison=[];try{comparison=JSON.parse(sessionStorage.getItem('wishmeteor:compare')??'[]').filter(s=>/^[a-z0-9-]+$/.test(s)).slice(0,3);}catch{}
const compareTray=document.createElement('div');compareTray.className='compare-tray';compareTray.setAttribute('aria-label','Selected comparison');document.body.append(compareTray);
function renderCompare() {
 document.querySelectorAll('[data-compare]').forEach(b=>{const selected=comparison.includes(b.dataset.compare);b.setAttribute('aria-pressed',String(selected));b.textContent=selected?'Remove from compare':'Compare';});
 compareTray.replaceChildren();compareTray.hidden=comparison.length===0;if(!comparison.length)return;
 const label=document.createElement('span');label.textContent=`${comparison.length} of 3 projects selected`;const link=document.createElement('a');link.className='btn btn-primary';link.href='/compare?slugs='+encodeURIComponent(comparison.join(','));link.textContent='Compare projects';const clear=document.createElement('button');clear.type='button';clear.className='btn btn-quiet';clear.textContent='Clear';clear.onclick=()=>{comparison=[];saveCompare();};compareTray.append(label,link,clear);
}
function saveCompare(){try{sessionStorage.setItem('wishmeteor:compare',JSON.stringify(comparison));}catch{}renderCompare();}
document.addEventListener('click',event=>{const button=event.target.closest('[data-compare]');if(!button)return;const slug=button.dataset.compare;if(comparison.includes(slug))comparison=comparison.filter(s=>s!==slug);else if(comparison.length<3)comparison.push(slug);else{compareTray.querySelector('span').textContent='Choose up to three. Remove a project to add another.';return;}saveCompare();});renderCompare();
const catalog=document.querySelector('[data-catalog]'),form=catalog?.querySelector('[data-catalog-form]');
if(catalog&&form) {
 let timer,controller,serial=0;const cache=new Map();
 function params(){const p=new URLSearchParams();for(const [key,value] of new FormData(form))if(value)p.set(key,String(value));return p;}
 async function load(p,push=true) {
  controller?.abort();controller=new AbortController();const current=++serial,key=p.toString();catalog.setAttribute('aria-busy','true');
  try {
   let data=cache.get(key);if(!data||Date.now()-data.time>30_000){const response=await api('/api/content?'+key+(key?'&':'')+'view=cards',undefined,'GET',{signal:controller.signal});data={...response,time:Date.now()};cache.set(key,data);if(cache.size>20)cache.delete(cache.keys().next().value);}
   if(current!==serial)return;
   catalog.querySelector('[data-catalog-grid]').innerHTML=data.cards;catalog.querySelector('[data-catalog-pagination]').innerHTML=data.pagination;
   catalog.querySelector('[data-catalog-results]').textContent=`${data.total} projects · page ${data.page}`;catalog.querySelector('[data-catalog-empty]').hidden=data.tools.length>0;
   if(push)history.pushState(null,'',location.pathname+(key?'?'+key:''));imageFallbacks(catalog);renderCompare();void hydrateStars();
  }catch(error){if(error.name!=='AbortError')catalog.querySelector('[data-catalog-results]').textContent='Products could not be loaded. Your previous results remain available.';}
  finally{if(current===serial)catalog.removeAttribute('aria-busy');}
 }
 form.addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);void load(params());});
 form.querySelector('[name=q]').addEventListener('input',()=>{clearTimeout(timer);controller?.abort();timer=setTimeout(()=>load(params()),250);});
 form.querySelectorAll('select').forEach(select=>select.addEventListener('change',()=>{clearTimeout(timer);void load(params());}));
 catalog.addEventListener('click',event=>{const page=event.target.closest('[data-page]');if(!page)return;event.preventDefault();const p=params();p.set('page',page.dataset.page);void load(p);catalog.querySelector('[data-catalog-results]').setAttribute('tabindex','-1');catalog.querySelector('[data-catalog-results]').focus({preventScroll:true});});
 window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);for(const element of form.elements)if(element.name)element.value=p.get(element.name)??(element.name==='sort'?'newest':'');void load(p,false);});
}
const product=document.querySelector('.product-hero[data-slug]');
if(product) {
 let state={bookmarked:false,following:false};const feedback=product.querySelector('[data-project-status]');
 function display(){for(const [field,selector,label] of [['bookmarked','[data-bookmark]','Save project'],['following','[data-follow]','Follow updates']]){const button=product.querySelector(selector);button.setAttribute('aria-pressed',String(state[field]));button.textContent=state[field]?(field==='bookmarked'?'Saved':'Following'):label;}}
 api('/api/account/projects',undefined,'GET').then(data=>{const found=data.projects.find(p=>p.tool.slug===product.dataset.slug);if(found)state=found;display();}).catch(()=>{});
 for(const [field,selector] of [['bookmarked','[data-bookmark]'],['following','[data-follow]']])product.querySelector(selector)?.addEventListener('click',async event=>{
  const button=event.target;button.disabled=true;try{state=await api('/api/account/projects/'+product.dataset.slug,{bookmarked:field==='bookmarked'?!state.bookmarked:state.bookmarked,following:field==='following'?!state.following:state.following},'PUT');display();feedback.textContent=field==='following'?(state.following?'You will receive essential email updates while following this project.':'Project updates are turned off.'):'Your saved projects were updated.';}
  catch(error){feedback.replaceChildren(document.createTextNode(error.status===401?'Sign in to save or follow a project. ':'Changes could not be saved. '));if(error.status===401){const link=document.createElement('a');link.href='/account';link.textContent='Sign in';feedback.append(link);}}
  finally{button.disabled=false;}
 });
}
document.querySelectorAll('[data-correction]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const status=form.querySelector('[role=status]'),button=form.querySelector('button');button.disabled=true;try{await api('/api/account/corrections/'+form.dataset.correction,{message:new FormData(form).get('message')});status.textContent='Your correction request is waiting for review.';form.reset();}catch(error){status.textContent=error.status===401?'Sign in to send a correction request.':'The correction request could not be saved.';}finally{button.disabled=false;}}));
function track(event,fields={}) {if(!privatePage&&window.gtag)window.gtag('event',event,fields);}
const detailSlug=/^\/tool\/([a-z0-9-]+)$/.exec(location.pathname)?.[1];if(detailSlug)track('product_view',{product_slug:detailSlug});
document.addEventListener('click',event=>{const link=event.target.closest('[data-outbound]');if(link)track('outbound_click',{product_slug:link.closest('[data-slug]')?.dataset.slug??detailSlug??''});});
document.addEventListener('click',async event=>{const button=event.target.closest('[data-share]');if(!button)return;const link=location.origin+'/tool/'+button.dataset.share,feedback=document.querySelector('[data-project-status]');try{await navigator.clipboard.writeText(link);if(feedback)feedback.textContent='Listing link copied.';track('share_listing',{product_slug:button.dataset.share,method:'copy_link'});}catch{if(feedback){feedback.textContent='Copy this link: '+link;}}});
const submissionForm=document.querySelector('form[action="/api/submit"]');
if(submissionForm){submissionForm.addEventListener('input',()=>track('submission_start'),{once:true});submissionForm.addEventListener('submit',()=>{try{sessionStorage.setItem('wishmeteor:submission-pending',crypto.randomUUID());}catch{} });if(new URLSearchParams(location.search).get('status')==='queued'){try{if(sessionStorage.getItem('wishmeteor:submission-pending')){sessionStorage.removeItem('wishmeteor:submission-pending');track('submission_success');}}catch{}}}
window.addEventListener('wishmeteor:star-added',event=>track('star_added',{product_slug:event.detail.slug}));
