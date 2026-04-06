(()=>{var A=["(Display Commander)","(Art Series)"],C={START_OPTIMIZATION:"START_OPTIMIZATION",SOLVE_WITH_CONFIG:"SOLVE_WITH_CONFIG",CANCEL_OPTIMIZATION:"CANCEL_OPTIMIZATION",APPLY_CART:"APPLY_CART",DUMP_DATA:"DUMP_DATA",OPTIMIZATION_PROGRESS:"OPTIMIZATION_PROGRESS",LISTINGS_READY:"LISTINGS_READY",OPTIMIZATION_RESULT:"OPTIMIZATION_RESULT",OPTIMIZATION_MULTI_RESULT:"OPTIMIZATION_MULTI_RESULT",OPTIMIZATION_ERROR:"OPTIMIZATION_ERROR",TOGGLE_PANEL:"TOGGLE_PANEL",CLEAR_SELLER_CACHE:"CLEAR_SELLER_CACHE",CLEAR_PRINTINGS_CACHE:"CLEAR_PRINTINGS_CACHE"};function _(){let e=Y(),t=Q();return console.log(`[TCGmizer] Cart reader found ${e.length} items, total: $${t}`),{cartItems:e,currentCartTotal:t}}function Y(){let e=[],t=document.querySelectorAll('a[href*="/product/"]');if(console.log(`[TCGmizer] Found ${t.length} product links on page`),t.length===0)return e;let n=new Set;for(let r of t){let a=r.closest('li, [role="listitem"]');if(!a||n.has(a))continue;let d=a.closest("article");if(!(!d||!d.closest("main"))){n.add(a);try{let o=V(a,d);o&&(e.push(o),console.log(`[TCGmizer] Parsed: ${o.cardName} (${o.productId}) qty=${o.quantity} $${o.price}`))}catch(o){console.warn("[TCGmizer] Failed to parse cart item:",o)}}}return e}function V(e,t){let n=e.querySelectorAll('a[href*="/product/"]');if(n.length===0)return null;let r=J(n[0]);if(!r)return null;let{productId:a,customListingKey:d}=r,m="Unknown Card";for(let p of n){let y=p.querySelector("img");if(p.textContent?.trim()&&p.textContent.trim()!==y?.alt?.trim()||p.querySelector("p")){m=p.querySelector("p")?.textContent?.trim()||p.textContent?.trim()||m;break}}let o=e.querySelectorAll("p"),s="",i="",l=0;for(let p of o){let y=p.textContent?.trim()||"";y&&(p.closest('a[href*="/product/"]')||(y.startsWith("$")||y.match(/^\$[\d,.]+$/)?l=L(y):X(y)?i=y:y.includes(",")&&!y.includes("cart")&&(s=y)))}let u=1,c=e.querySelector('[aria-label*="cart quantity"], [aria-label*="quantity"]');if(c){let p=c.querySelector('li, [role="listitem"]');p&&(u=parseInt(p.textContent?.trim(),10)||1)}if(u===1){let p=e.querySelector('input[type="number"], select');p&&(u=parseInt(p.value,10)||1)}let g=W(t);return{productId:a,cardName:m,quantity:u,price:l,condition:i,setName:s,skuId:null,sellerName:g.sellerName||"",sellerKey:g.sellerKey||"",isDirect:g.isDirect||!1,customListingKey:d||null}}function W(e){let t=e.querySelectorAll('a[href*="seller="], a[href*="direct=true"]');for(let n of t){let r=n.getAttribute("href")||"",a=r.match(/[?&]seller=([^&]+)/),d=r.includes("direct=true"),m=a?a[1]:"",o="",s=[];for(let i of n.childNodes)i.nodeType===Node.TEXT_NODE&&i.textContent?.trim()&&s.push(i.textContent.trim());return o=s[0]||n.textContent?.trim()?.split(`
`)?.[0]?.trim()||"",{sellerName:o,sellerKey:m,isDirect:d}}return{sellerName:"",sellerKey:"",isDirect:!1}}function X(e){let t=["near mint","lightly played","moderately played","heavily played","damaged","nm","lp","mp","hp"],n=e.toLowerCase();return t.some(r=>n.startsWith(r))}function J(e){if(!e)return null;let t=e.getAttribute("href")||"",n=t.match(/\/product\/(\d+)/);if(n)return{productId:parseInt(n[1],10),customListingKey:null};let r=t.match(/\/product\/listing\/([^/]+)/);return r?{productId:null,customListingKey:r[1]}:null}function L(e){if(!e)return 0;let t=e.match(/\$?([\d,]+\.?\d*)/);return t&&parseFloat(t[1].replace(/,/g,""))||0}function Q(){let e=document.querySelectorAll("p");for(let n of e){let r=n.textContent?.trim()||"";if(r.includes("Cart Subtotal")){let a=L(r);if(a>0)return a}}let t=document.querySelectorAll("h3");for(let n of t)if(n.textContent?.trim()==="Cart Summary"){let r=n.nextElementSibling;for(;r;){let a=r.textContent?.trim()||"";if(a.includes("Cart Subtotal")){let d=L(a);if(d>0)return d}r=r.nextElementSibling}}return 0}var T="https://mpgateway.tcgplayer.com";async function P(e){try{let t=ee();if(!t)return{success:!1,error:"Could not find cart key. Please refresh the page and try again."};let n=[];for(let c of e.sellers)for(let g of c.items){if(!g.productConditionId){console.warn("[TCGmizer] Item missing productConditionId:",g);continue}let p=c.isDirect||g.directListing,y=p&&g.originalSellerKey?g.originalSellerKey:c.sellerKey||c.sellerId,v=p&&g.originalSellerNumericId!=null?g.originalSellerNumericId:c.sellerNumericId;n.push({sku:g.productConditionId,sellerId:v,sellerKey:y,price:g.price,quantity:1,cardName:g.cardName,setName:g.setName||"",isDirect:g.directListing||g.directSeller||!1,customListingKey:g.customListingKey||null})}if(n.length===0)return{success:!1,error:"No items in optimized cart."};let r=new Map;for(let c of n){let g=c.customListingKey?`custom:${c.customListingKey}`:`${c.sku}:${c.sellerId}:${c.isDirect}`;if(r.has(g)){let p=r.get(g);p.quantity+=c.quantity,p.cardName+=`, ${c.cardName}`}else r.set(g,{...c})}let a=[...r.values()];console.log(`[TCGmizer] Applying cart: clearing then adding ${n.length} items (${a.length} unique sku+seller combos) via ${T}`);let d=await te(t);if(!d.success)return{success:!1,error:`Failed to clear cart: ${d.error}`};let m=new Set(a.map(c=>`${c.sku}:${c.sellerKey}`)),o=e.fallbackListings||{},s=0,i=0,l=[],u=[];for(let c=0;c<a.length;c++){let g=a[c],p=await w(t,g);if(p.success){c<a.length-1&&await k(50);continue}if(console.warn(`[TCGmizer] Failed to add item ${c+1}/${a.length}: ${p.error}`),console.warn(`[TCGmizer]   Item details: card="${g.cardName}", set="${g.setName}", sku=${g.sku}, sellerKey=${g.sellerKey}, sellerId=${g.sellerId}, price=${g.price}, qty=${g.quantity}, isDirect=${g.isDirect}`),console.warn(`[TCGmizer]   Error code: ${p.errorCode||"none"}`),p.errorCode==="CAPI-4"){let y=g.cardName.split(", ")[0],v=o[y]||[];console.log(`[TCGmizer]   Attempting CAPI-4 fallback for "${y}" \u2014 ${v.length} alternatives available`);let $=!1;for(let h of v){let E=`${h.sku}:${h.sellerKey}`;if(m.has(E))continue;console.log(`[TCGmizer]   Trying fallback: sku=${h.sku}, seller=${h.sellerKey} (${h.sellerName}), price=$${h.price}, set="${h.setName}"`);let Z={sku:h.sku,sellerKey:h.sellerKey,price:h.price,quantity:g.quantity,cardName:g.cardName,setName:h.setName||g.setName,isDirect:h.isDirect||!1,customListingKey:h.customListingKey||null},N=await w(t,Z);if(N.success){m.add(E),i++,u.push({cardName:y,originalSku:g.sku,originalSellerKey:g.sellerKey,originalPrice:g.price,fallbackSku:h.sku,fallbackSellerKey:h.sellerKey,fallbackPrice:h.price,fallbackSetName:h.setName,fallbackSellerName:h.sellerName}),console.log(`[TCGmizer]   \u2713 Fallback succeeded for "${y}" \u2014 new price: $${h.price} from ${h.sellerName}`),$=!0;break}m.add(E),console.warn(`[TCGmizer]   Fallback also failed (${N.errorCode||"unknown"}): sku=${h.sku}, seller=${h.sellerKey}`),await k(50)}if($){c<a.length-1&&await k(50);continue}console.warn(`[TCGmizer]   All fallbacks exhausted for "${y}"`)}s++,l.push({cardName:g.cardName,setName:g.setName,sku:g.sku,sellerKey:g.sellerKey,price:g.price,errorCode:p.errorCode,reason:re(p.errorCode)||p.error}),c<a.length-1&&await k(50)}if(s===a.length)return{success:!1,error:`Failed to add all items. ${l[0]?.reason||"Unknown error"}`};if(i>0){console.log(`[TCGmizer] ${i} item(s) were replaced with fallback listings:`);for(let c of u)console.log(`[TCGmizer]   - ${c.cardName}: $${c.originalPrice} \u2192 $${c.fallbackPrice} (${c.fallbackSellerName}, ${c.fallbackSetName})`)}if(s>0){console.warn(`[TCGmizer] ${s}/${a.length} items failed to add:`);for(let c of l)console.warn(`[TCGmizer]   - ${c.cardName} (${c.setName}): ${c.errorCode||"unknown"} \u2014 ${c.reason}`);return{success:!0,partial:!0,failCount:s,totalCount:a.length,failedItems:l,fallbackCount:i,fallbackItems:u}}return i>0?{success:!0,partial:!0,failCount:0,totalCount:a.length,failedItems:[],fallbackCount:i,fallbackItems:u}:{success:!0,partial:!1,failCount:0,totalCount:a.length,failedItems:[],fallbackCount:0,fallbackItems:[]}}catch(t){return{success:!1,error:t.message}}}function O(e){try{sessionStorage.setItem("tcgmizer_undo_cart",JSON.stringify({timestamp:Date.now(),items:e}))}catch(t){console.warn("[TCGmizer] Failed to save cart state for undo:",t)}}function ee(){let e=document.cookie.split(";");for(let t of e){let n=t.trim();if(n.startsWith("StoreCart_PRODUCTION=")){let r=n.substring(21),d=new URLSearchParams(r).get("CK");return d||r}}return null}async function te(e){try{let t=await fetch(`${T}/v1/cart/${e}/items/all`,{method:"DELETE",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"include"});if(!t.ok){let n=await t.text().catch(()=>"");return{success:!1,error:`HTTP ${t.status}: ${n.substring(0,200)}`}}return{success:!0}}catch(t){return{success:!1,error:t.message}}}async function w(e,t){let n=!!t.customListingKey,r,a;n?(r=`${T}/v1/cart/${e}/listo/add`,a={customListingKey:t.customListingKey,priceAtAdd:t.price,quantityToBuy:t.quantity||1,channelId:0,countryCode:"US"}):(r=`${T}/v1/cart/${e}/item/add`,a={sku:t.sku,sellerKey:t.sellerKey,channelId:0,requestedQuantity:t.quantity||1,price:t.price,isDirect:t.isDirect||!1,countryCode:"US"}),console.log(`[TCGmizer] Adding to cart: "${t.cardName}" (${t.setName||"no set"}) \u2014 sku=${t.sku}, seller=${t.sellerKey}, price=$${t.price}, qty=${t.quantity||1}, isDirect=${t.isDirect||!1}${n?", customListingKey="+t.customListingKey:""}`),console.log(`[TCGmizer]   ${n?"Custom listing":"Standard"} \u2192 ${r.split("/").slice(-2).join("/")}`),console.log("[TCGmizer]   Request body:",JSON.stringify(a));try{let d=await fetch(r,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"include",body:JSON.stringify(a)}),m=await d.text().catch(()=>"");if(console.log(`[TCGmizer]   Response ${d.status}: ${m.substring(0,500)}`),!d.ok){let o=null;try{o=JSON.parse(m)?.errors?.[0]?.code||null}catch{}return{success:!1,error:`HTTP ${d.status}: ${m.substring(0,200)}`,errorCode:o}}try{let o=JSON.parse(m);if(o?.errors&&o.errors.length>0){let s=o.errors[0]?.code||"";return{success:!1,error:`API error: ${o.errors[0]?.message||""} (${s})`,errorCode:s}}}catch{}return{success:!0}}catch(d){return console.error("[TCGmizer]   Network error:",d),{success:!1,error:d.message,errorCode:null}}}function re(e){switch(e){case"CAPI-4":return"Sold out (no longer available from this seller)";case"CAPI-17":return"Product not found (may have been delisted)";case"CAPI-35":return"Product not available for purchase";default:return`Error: ${e}`}}function k(e){return new Promise(t=>setTimeout(t,e))}var b="tcgmizer-panel";function R(){if(document.getElementById(b))return;let e=document.createElement("div");e.id=b,e.innerHTML=`
    <div class="tcgmizer-header">
      <span class="tcgmizer-logo">\u26A1 TCGmizer</span>
      <button class="tcgmizer-close" title="Close">&times;</button>
    </div>
    <div class="tcgmizer-body">
      <div class="tcgmizer-idle">
        <p>Optimize your cart using integer linear programming to find the mathematically cheapest combination of sellers.</p>
        <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-start">Optimize Cart</button>
      </div>
      <div class="tcgmizer-progress" style="display:none">
        <div class="tcgmizer-spinner"></div>
        <p class="tcgmizer-progress-text">Starting...</p>
        <div class="tcgmizer-progress-bar-container">
          <div class="tcgmizer-progress-bar"></div>
        </div>
        <button class="tcgmizer-btn tcgmizer-cancel">Cancel</button>
      </div>
      <div class="tcgmizer-config" style="display:none"></div>
      <div class="tcgmizer-results" style="display:none"></div>
      <div class="tcgmizer-error" style="display:none">
        <p class="tcgmizer-error-text"></p>
        <button class="tcgmizer-btn tcgmizer-retry">Try Again</button>
      </div>
    </div>
  `,document.body.appendChild(e);let t=e.querySelector(".tcgmizer-header"),n=!1,r=0,a=0;t.addEventListener("mousedown",d=>{d.target.closest(".tcgmizer-close")||(n=!0,r=d.clientX-e.offsetLeft,a=d.clientY-e.offsetTop,t.style.cursor="grabbing",d.preventDefault())}),document.addEventListener("mousemove",d=>{n&&(e.style.left=d.clientX-r+"px",e.style.top=d.clientY-a+"px",e.style.right="auto")}),document.addEventListener("mouseup",()=>{n&&(n=!1,t.style.cursor="")}),e.querySelector(".tcgmizer-close").addEventListener("click",()=>{let d=e.querySelector(".tcgmizer-progress");if(d&&d.style.display!=="none"&&typeof e._onCancel=="function"){e._onCancel();return}e.style.display="none"}),e.querySelector(".tcgmizer-cancel").addEventListener("click",()=>{typeof e._onCancel=="function"&&e._onCancel()}),e.querySelector(".tcgmizer-start").addEventListener("click",()=>{typeof e._onStart=="function"&&e._onStart()}),e.querySelector(".tcgmizer-retry").addEventListener("click",()=>{e._hasConfig?(f(e,".tcgmizer-error"),x(e,".tcgmizer-config")):typeof e._onStart=="function"&&e._onStart()})}function D(e){let t=document.getElementById(b);t&&(t._onStart=e)}function G(e){let t=document.getElementById(b);t&&(t._onCancel=e)}function M(){let e=document.getElementById(b);e&&(f(e,".tcgmizer-progress"),x(e,".tcgmizer-config"))}function F(){let e=document.getElementById(b);e&&(f(e,".tcgmizer-progress"),e.style.display="none")}function K(){let e=document.getElementById(b);e&&(e.style.display="flex")}function I(e,t,n){let r=document.getElementById(b);if(!r)return;f(r,".tcgmizer-idle"),f(r,".tcgmizer-config"),f(r,".tcgmizer-results"),f(r,".tcgmizer-error"),x(r,".tcgmizer-progress"),r.querySelector(".tcgmizer-progress-text").textContent=e||"Working...";let a=r.querySelector(".tcgmizer-progress-bar");t!=null&&n!=null&&n>0?(a.style.width=`${Math.round(t/n*100)}%`,a.classList.remove("tcgmizer-progress-bar-indeterminate")):(a.style.width="100%",a.classList.add("tcgmizer-progress-bar-indeterminate"))}function U(e,t){let n=document.getElementById(b);if(!n)return;n._hasConfig=!0,f(n,".tcgmizer-idle"),f(n,".tcgmizer-progress"),f(n,".tcgmizer-results"),f(n,".tcgmizer-error"),x(n,".tcgmizer-config");let r=n.querySelector(".tcgmizer-config"),a=e.languages.map(s=>{let i=s==="English"?"checked":"";return`<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${z(s)}" ${i} /> ${z(s)}
    </label>`}).join(""),d=e.conditions.map(s=>{let i=s==="Damaged"?"":"checked";return`<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${z(s)}" ${i} /> ${z(s)}
    </label>`}).join("");r.innerHTML=`
    <div class="tcgmizer-config-summary">
      Found ${e.listingCount.toLocaleString()} listings from ${e.sellerCount.toLocaleString()} sellers for ${e.cardCount} card${e.cardCount!==1?"s":""}.
    </div>

    <div class="tcgmizer-config-section">
      <div class="tcgmizer-config-label">Language</div>
      <div class="tcgmizer-config-options tcgmizer-lang-options">
        ${a}
      </div>
      <div class="tcgmizer-select-actions">
        <a href="#" class="tcgmizer-select-all" data-target="lang">Select all</a> \xB7
        <a href="#" class="tcgmizer-select-none" data-target="lang">Select none</a>
      </div>
    </div>

    <div class="tcgmizer-config-section">
      <label class="tcgmizer-checkbox-label">
        <input type="checkbox" class="tcgmizer-exact-printings" /> Exact printings only
      </label>
      <span class="tcgmizer-config-hint">When unchecked, finds the cheapest printing of each card across all sets</span>
    </div>

    <div class="tcgmizer-config-section tcgmizer-card-exclusion-section">
      <label class="tcgmizer-checkbox-label">
        <input type="checkbox" class="tcgmizer-card-exclusions" checked /> Version Exclusions
      </label>
      <a href="#" class="tcgmizer-manage-card-exclusions-link" style="font-size:12px;color:#2e9e5e;margin-left:4px;text-decoration:none;cursor:pointer;">Manage</a>
      <span class="tcgmizer-config-hint">Excludes printings matching configured patterns (e.g. Display Commander).</span>
    </div>

    <div class="tcgmizer-config-section">
      <div class="tcgmizer-config-label">Condition</div>
      <div class="tcgmizer-config-options tcgmizer-cond-options">
        ${d}
      </div>
      <div class="tcgmizer-select-actions">
        <a href="#" class="tcgmizer-select-all" data-target="cond">Select all</a> \xB7
        <a href="#" class="tcgmizer-select-none" data-target="cond">Select none</a>
      </div>
    </div>

    <div class="tcgmizer-config-section">
      <label class="tcgmizer-checkbox-label tcgmizer-minimize-vendors-label">
        <input type="checkbox" class="tcgmizer-minimize-vendors" /> Minimize Number of Vendors
      </label>
      <div class="tcgmizer-max-cuts-row" style="margin-top:6px;margin-left:22px;display:flex;align-items:center;gap:6px;">
        <label class="tcgmizer-config-hint" style="margin:0;white-space:nowrap;">Try cutting up to</label>
        <select class="tcgmizer-max-cuts" disabled style="width:48px;padding:2px 4px;border-radius:4px;border:1px solid #ccc;font-size:13px;">
          <option value="0">0</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
        </select>
        <span class="tcgmizer-config-hint" style="margin:0;">cards to reduce vendors</span>
      </div>
    </div>

    <div class="tcgmizer-config-section tcgmizer-ban-section">
      <label class="tcgmizer-checkbox-label">
        <input type="checkbox" class="tcgmizer-exclude-banned" checked disabled /> Exclude banned vendors <span class="tcgmizer-ban-count-label">(loading...)</span>
      </label>
      <a href="#" class="tcgmizer-manage-ban-link" style="font-size:12px;color:#2e9e5e;margin-left:4px;text-decoration:none;cursor:pointer;">Manage</a>
    </div>

    <div class="tcgmizer-config-actions">
      <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-run-solver">Run Optimizer</button>
      
      <button class="tcgmizer-btn tcgmizer-refetch">Re-fetch Listings</button>
    </div>
  `,chrome.storage.local.get("optimizerSettings",s=>{let i=s.optimizerSettings;i&&(i.languages&&i.languages.length>0&&r.querySelectorAll('.tcgmizer-lang-options input[type="checkbox"]').forEach(l=>{l.checked=i.languages.includes(l.value)}),i.conditions&&i.conditions.length>0&&r.querySelectorAll('.tcgmizer-cond-options input[type="checkbox"]').forEach(l=>{l.checked=i.conditions.includes(l.value)}),i.minimizeVendors!=null&&(r.querySelector(".tcgmizer-minimize-vendors").checked=i.minimizeVendors,r.querySelector(".tcgmizer-max-cuts").disabled=!i.minimizeVendors),i.maxCuts!=null&&(r.querySelector(".tcgmizer-max-cuts").value=String(i.maxCuts)),i.exactPrintings!=null&&(r.querySelector(".tcgmizer-exact-printings").checked=i.exactPrintings),i.cardExclusionsEnabled!=null&&(r.querySelector(".tcgmizer-card-exclusions").checked=i.cardExclusionsEnabled))}),r.querySelector(".tcgmizer-card-exclusions").addEventListener("change",s=>{chrome.storage.local.get("optimizerSettings",i=>{let l=i.optimizerSettings||{};l.cardExclusionsEnabled=s.target.checked,chrome.storage.local.set({optimizerSettings:l})})});function m(s){let i=r.querySelector(".tcgmizer-exclude-banned"),l=r.querySelector(".tcgmizer-ban-count-label");!i||!l||(s.length===0?(i.checked=!1,i.disabled=!0,l.textContent="(none banned)"):(i.disabled=!1,i.checked=!0,l.textContent=`(${s.length} banned)`),i._bannedKeys=s.map(u=>u.sellerKey))}chrome.storage.sync.get("bannedSellers",s=>{m(s.bannedSellers||[])}),chrome.storage.onChanged.addListener((s,i)=>{i==="sync"&&s.bannedSellers&&m(s.bannedSellers.newValue||[])}),r.querySelector(".tcgmizer-manage-ban-link").addEventListener("click",s=>{s.preventDefault(),chrome.runtime.sendMessage({type:"OPEN_OPTIONS_PAGE"})}),r.querySelector(".tcgmizer-manage-card-exclusions-link").addEventListener("click",s=>{s.preventDefault(),oe(n)}),r.querySelectorAll(".tcgmizer-select-all").forEach(s=>{s.addEventListener("click",i=>{i.preventDefault();let l=s.dataset.target;r.querySelectorAll(`.tcgmizer-${l}-options input[type="checkbox"]`).forEach(u=>u.checked=!0)})}),r.querySelectorAll(".tcgmizer-select-none").forEach(s=>{s.addEventListener("click",i=>{i.preventDefault();let l=s.dataset.target;r.querySelectorAll(`.tcgmizer-${l}-options input[type="checkbox"]`).forEach(u=>u.checked=!1)})}),r.querySelector(".tcgmizer-minimize-vendors").addEventListener("change",s=>{r.querySelector(".tcgmizer-max-cuts").disabled=!s.target.checked}),r.querySelector(".tcgmizer-run-solver").addEventListener("click",()=>{let s=[...r.querySelectorAll(".tcgmizer-lang-options input:checked")].map($=>$.value),i=[...r.querySelectorAll(".tcgmizer-cond-options input:checked")].map($=>$.value),l=r.querySelector(".tcgmizer-minimize-vendors").checked,u=parseInt(r.querySelector(".tcgmizer-max-cuts").value,10)||0,c=r.querySelector(".tcgmizer-exact-printings").checked,g=r.querySelector(".tcgmizer-card-exclusions").checked,p=r.querySelector(".tcgmizer-exclude-banned"),y=p.checked&&p._bannedKeys?p._bannedKeys:[];if(s.length===0){alert("Please select at least one language.");return}if(i.length===0){alert("Please select at least one condition.");return}chrome.storage.local.set({optimizerSettings:{languages:s,conditions:i,minimizeVendors:l,maxCuts:u,exactPrintings:c,cardExclusionsEnabled:g}});let v={languages:s.length===e.languages.length?[]:s,conditions:i.length===e.conditions.length?[]:i,minimizeVendors:l,maxCuts:l?u:0,exactPrintings:c,cardExclusionsEnabled:g,bannedSellerKeys:y};typeof t=="function"&&t(v)});let o=r.querySelector(".tcgmizer-dump-data");o&&o.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"DUMP_DATA"},s=>{if(chrome.runtime.lastError){console.error("[TCGmizer Debug] Dump failed:",chrome.runtime.lastError.message),alert("Dump failed: "+chrome.runtime.lastError.message);return}if(s?.error){alert("Dump failed: "+s.error);return}if(s?.data){let i=JSON.stringify(s.data,null,2),l=new Blob([i],{type:"application/json"}),u=URL.createObjectURL(l),c=document.createElement("a");c.href=u,c.download=`tcgmizer-dump-${Date.now()}.json`,document.body.appendChild(c),c.click(),document.body.removeChild(c),URL.revokeObjectURL(u),console.log(`[TCGmizer Debug] Dumped ${i.length} bytes`)}})}),r.querySelector(".tcgmizer-refetch").addEventListener("click",()=>{typeof n._onStart=="function"&&n._onStart()})}function H(e,t){let n=document.getElementById(b);if(!n)return;f(n,".tcgmizer-idle"),f(n,".tcgmizer-progress"),f(n,".tcgmizer-config"),f(n,".tcgmizer-error"),x(n,".tcgmizer-results");let r=n.querySelector(".tcgmizer-results");if(!e.success){r.innerHTML=`
      <div class="tcgmizer-result-error">
        <p>Optimization failed: ${z(e.error)}</p>
      </div>
    `;return}let a=e.savings>0?"tcgmizer-savings-positive":"tcgmizer-savings-neutral",d=e.savings>0?`Save $${e.savings.toFixed(2)}!`:e.savings===0?"Same price (but possibly fewer packages)":`$${Math.abs(e.savings).toFixed(2)} more (current cart is already optimal)`,m="";for(let o of e.sellers)m+=j(o,!0);r.innerHTML=`
    <div class="tcgmizer-summary">
      <div class="tcgmizer-summary-row">
        <span>Current cart:</span>
        <span>$${e.currentCartTotal.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>Optimized total:</span>
        <span class="tcgmizer-optimized-total">$${e.totalCost.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row tcgmizer-summary-detail">
        <span>Items: $${e.totalItemCost.toFixed(2)} \xB7 Shipping: $${e.totalShipping.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row ${a}">
        <span>${d}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>${e.itemCount} items from ${e.sellerCount} seller${e.sellerCount!==1?"s":""}</span>
      </div>
    </div>
    <div class="tcgmizer-actions">
      <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-apply">Apply to Cart</button>
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
    <div class="tcgmizer-sellers-list">${m}</div>
  `,r.querySelector(".tcgmizer-apply").addEventListener("click",()=>{confirm("This will replace your current TCGPlayer cart with the optimized selections. This cannot be undone! Continue?")&&typeof t=="function"&&t(e)}),r.querySelector(".tcgmizer-back-to-config").addEventListener("click",()=>{f(n,".tcgmizer-results"),x(n,".tcgmizer-config")})}function B(e,t){let n=document.getElementById(b);if(!n)return;f(n,".tcgmizer-idle"),f(n,".tcgmizer-progress"),f(n,".tcgmizer-config"),f(n,".tcgmizer-error"),x(n,".tcgmizer-results");let r=n.querySelector(".tcgmizer-results");if(!e||e.length===0){r.innerHTML=`
      <div class="tcgmizer-result-error">
        <p>No feasible solutions found.</p>
      </div>
    `;return}let a=e[e.length-1],d="";for(let i=0;i<e.length;i++){let l=e[i],u=l.totalCost-a.totalCost,c=u>.005?`+$${u.toFixed(2)}`:"Cheapest",g=u>.005?"":"tcgmizer-cheapest-tag",p=l.cutCards&&l.cutCards.length>0?`<div class="tcgmizer-cut-info" title="${z(l.cutCards.join(" \xB7 "))}">\u2702\uFE0F Cut ${l.cutCards.length} card${l.cutCards.length!==1?"s":""}: ${z(l.cutCards.join(" \xB7 "))}</div>`:"",y="";for(let v of l.sellers)y+=j(v,!1);d+=`
      <div class="tcgmizer-compare-row" data-index="${i}">
        <div class="tcgmizer-compare-row-summary">
          <span class="tcgmizer-compare-vendors">${l.sellerCount} vendor${l.sellerCount!==1?"s":""}</span>
          <span class="tcgmizer-compare-price">$${l.totalCost.toFixed(2)}</span>
          <span class="tcgmizer-compare-extra ${g}">${c}</span>
          <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-compare-apply">Apply</button>
          <span class="tcgmizer-compare-toggle">\u25B6</span>
        </div>
        ${p}
        <div class="tcgmizer-compare-detail" style="display:none">
          <div class="tcgmizer-summary-row tcgmizer-summary-detail" style="margin-bottom:8px">
            Items: $${l.totalItemCost.toFixed(2)} \xB7 Shipping: $${l.totalShipping.toFixed(2)}
          </div>
          <div class="tcgmizer-sellers-list">${y}</div>
        </div>
      </div>
    `}let m=e[0].currentCartTotal,o=m-a.totalCost,s=o>0?`Best savings: $${o.toFixed(2)}`:"Current cart is already near optimal";r.innerHTML=`
    <div class="tcgmizer-summary">
      <div class="tcgmizer-summary-row">
        <span>Current cart:</span>
        <span>$${m.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row tcgmizer-savings-positive">
        <span>${s}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>Found ${e.length} option${e.length!==1?"s":""} \u2014 click a row to see details</span>
      </div>
    </div>
    <div class="tcgmizer-compare-table">${d}</div>
    <div class="tcgmizer-actions" style="margin-top:12px">
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
  `,r.querySelectorAll(".tcgmizer-compare-row").forEach(i=>{let l=i.querySelector(".tcgmizer-compare-row-summary"),u=i.querySelector(".tcgmizer-compare-detail"),c=i.querySelector(".tcgmizer-compare-toggle");l.addEventListener("click",g=>{if(g.target.closest(".tcgmizer-compare-apply"))return;let p=u.style.display!=="none";u.style.display=p?"none":"block",c.textContent=p?"\u25B6":"\u25BC",i.classList.toggle("tcgmizer-compare-row-expanded",!p)})}),r.querySelectorAll(".tcgmizer-compare-apply").forEach(i=>{i.addEventListener("click",l=>{let u=parseInt(l.target.closest(".tcgmizer-compare-row").dataset.index,10),c=e[u];confirm(`Apply cart with ${c.sellerCount} vendor${c.sellerCount!==1?"s":""} ($${c.totalCost.toFixed(2)})? This will replace your current TCGPlayer cart. This cannot be undone!`)&&typeof t=="function"&&t(c)})}),r.querySelector(".tcgmizer-back-to-config").addEventListener("click",()=>{f(n,".tcgmizer-results"),x(n,".tcgmizer-config")})}function S(e){let t=document.getElementById(b);t&&(f(t,".tcgmizer-idle"),f(t,".tcgmizer-progress"),f(t,".tcgmizer-config"),f(t,".tcgmizer-results"),x(t,".tcgmizer-error"),t.querySelector(".tcgmizer-error-text").textContent=e)}function x(e,t){let n=e.querySelector(t);n&&(n.style.display="block")}function f(e,t){let n=e.querySelector(t);n&&(n.style.display="none")}function z(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}var ne={"Near Mint":"NM","Lightly Played":"LP","Moderately Played":"MP","Heavily Played":"HP",Damaged:"DMG",Mint:"M","Near Mint Foil":"NM-F","Lightly Played Foil":"LP-F","Moderately Played Foil":"MP-F","Heavily Played Foil":"HP-F","Damaged Foil":"DMG-F"};function ie(e){return e?ne[e]||e:""}function j(e,t){let n=se(e.items),r=ce(n,t),a=e.freeShipping?'<span class="tcgmizer-free-shipping">FREE shipping</span>':`Shipping: $${e.shippingCost.toFixed(2)}`,d=e.isDirect?" tcgmizer-seller-direct":"",m=e.isDirect?`<img src="https://mp-assets.tcgplayer.com/img/direct-icon-new.svg" alt="Direct" style="height:14px;vertical-align:middle;margin-right:4px" />${z(e.sellerName)}`:z(e.sellerName);return`
    <div class="tcgmizer-seller${d}">
      <div class="tcgmizer-seller-header">
        <span class="tcgmizer-seller-name">${m}</span>
        <span class="tcgmizer-seller-total">$${e.sellerTotal.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-seller-meta">
        ${e.items.length} item${e.items.length!==1?"s":""} \xB7 
        Subtotal: $${e.subtotal.toFixed(2)} \xB7 ${a}
      </div>
      <div class="tcgmizer-seller-items">${r}</div>
    </div>
  `}function se(e){let t=[],n=new Map;for(let r of e){let a=`${r.productId}|${r.condition}|${r.language}|${r.price}|${r.productConditionId}`;n.has(a)?t[n.get(a)].qty+=1:(n.set(a,t.length),t.push({item:r,qty:1}))}return t}function ce(e,t){return e.map(({item:n,qty:r})=>{let a=t&&n.printingChanged?` <span class="tcgmizer-changed" title="Different printing (originally ${z(q(n.originalSetName)||"unknown set")})">\u{1F500}</span>`:"",d=n.exclusionWarning?' <span class="tcgmizer-exclusion-warning" title="No non-excluded version available \u2014 kept original">\u26A0\uFE0F</span>':"",m=r>1?`<span class="tcgmizer-item-qty">${r}\xD7</span> `:"",o=[ie(n.condition),q(n.setName),n.language].filter(Boolean).join(" \xB7 "),s=`https://tcgplayer-cdn.tcgplayer.com/product/${n.productId}_200w.jpg`,i=r>1?`$${n.price.toFixed(2)} ea`:`$${n.price.toFixed(2)}`;return`
      <div class="tcgmizer-item">
        <img class="tcgmizer-item-img" src="${s}" alt="${z(n.cardName)}" loading="lazy" />
        <div class="tcgmizer-item-info">
          <span class="tcgmizer-item-name">${m}${z(n.cardName)}${a}${d}</span>
          <span class="tcgmizer-item-details">${z(o)}</span>
        </div>
        <span class="tcgmizer-item-price">${i}</span>
      </div>
    `}).join("")}function q(e){if(!e)return"";let t=e.split(",").map(d=>d.trim());if(t.length<=1)return e;let n=["Magic: The Gathering","Pokemon","Yu-Gi-Oh","Yu-Gi-Oh!","Flesh and Blood","Lorcana","One Piece Card Game","Dragon Ball Super Card Game","Digimon Card Game","MetaZoo","Final Fantasy","Cardfight!! Vanguard","Weiss Schwarz","Star Wars: Unlimited"],r=new Set(n.map(d=>d.toLowerCase()));return t.filter(d=>!(r.has(d.toLowerCase())||/^[A-Z]$/.test(d)||/^\d+$/.test(d))).join(", ")||t[0]}function oe(e){let t="tcgmizer-card-exclusion-modal";if(e.querySelector(`#${t}`))return;let n=document.createElement("div");n.id=t,n.style.cssText=`
    position: absolute; inset: 0; z-index: 10001;
    background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;
  `;let r=document.createElement("div");r.style.cssText=`
    background: #fff; border-radius: 10px; padding: 20px; width: 320px; max-height: 80%;
    overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  `,r.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <strong style="font-size:14px;">Version Exclusions</strong>
      <button class="tcgmizer-card-exclusion-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;">&times;</button>
    </div>
    <p style="font-size:12px;color:#666;margin:0 0 12px;">Card versions whose name contains any of these strings will be excluded from optimization.</p>
    <div class="tcgmizer-card-exclusion-list" style="margin-bottom:12px;"></div>
    <div style="display:flex;gap:6px;">
      <input class="tcgmizer-card-exclusion-input" type="text" placeholder="e.g. (Showcase)"
        style="flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;" />
      <button class="tcgmizer-card-exclusion-add" style="padding:6px 12px;background:#2e9e5e;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer;">Add</button>
    </div>
  `,n.appendChild(r),e.appendChild(n);let a=r.querySelector(".tcgmizer-card-exclusion-list"),d=r.querySelector(".tcgmizer-card-exclusion-input"),m=r.querySelector(".tcgmizer-card-exclusion-add"),o=[];function s(){if(o.length===0){a.innerHTML='<p style="font-size:12px;color:#999;margin:0;">No patterns defined.</p>';return}a.innerHTML=o.map((u,c)=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #eee;">
        <span style="font-size:13px;">${z(u)}</span>
        <button data-idx="${c}" class="tcgmizer-card-exclusion-remove" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:16px;padding:0 4px;" title="Remove">&times;</button>
      </div>
    `).join(""),a.querySelectorAll(".tcgmizer-card-exclusion-remove").forEach(u=>{u.addEventListener("click",()=>{o.splice(parseInt(u.dataset.idx,10),1),i(),s()})})}function i(){chrome.storage.sync.set({cardExclusions:o})}function l(){let u=d.value.trim();u&&(o.some(c=>c.toLowerCase()===u.toLowerCase())||(o.push(u),i(),s()),d.value="",d.focus())}m.addEventListener("click",l),d.addEventListener("keydown",u=>{u.key==="Enter"&&(u.preventDefault(),l())}),r.querySelector(".tcgmizer-card-exclusion-close").addEventListener("click",()=>n.remove()),n.addEventListener("click",u=>{u.target===n&&n.remove()}),chrome.storage.sync.get("cardExclusions",u=>{o=u.cardExclusions??[...A],s()})}window.__tcgmizerContentLoaded?console.log("[TCGmizer] Content script already loaded, skipping duplicate injection."):(window.__tcgmizerContentLoaded=!0,ae());function ae(){R(),n();let e=null,t=!1;D(()=>{r()}),G(()=>{t=!0,chrome.runtime.sendMessage({type:C.CANCEL_OPTIMIZATION}),e==="solve"?M():F(),e=null});function n(){let m="tcgmizer-cart-btn";function o(){if(document.getElementById(m))return!0;let i=document.querySelector(".optimize-btn-block");if(!i)return!1;let l=document.createElement("div"),u=getComputedStyle(i);l.style.cssText=`
      padding: ${u.padding};
      margin-top: 12px;
      background: ${u.background};
      border: ${u.border};
      border-radius: ${u.borderRadius};
      box-shadow: ${u.boxShadow};
    `;let c=document.createElement("button");return c.id=m,c.type="button",c.textContent="\u26A1 Optimize with TCGmizer",c.style.cssText=`
      display: block;
      width: 100%;
      padding: 10px 16px;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      background: #2e9e5e;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
    `,c.addEventListener("mouseenter",()=>{c.style.background="#258a50"}),c.addEventListener("mouseleave",()=>{c.style.background="#2e9e5e"}),c.addEventListener("click",()=>{K(),r()}),l.appendChild(c),i.insertAdjacentElement("afterend",l),!0}o(),new MutationObserver(()=>{o()}).observe(document.body,{childList:!0,subtree:!0})}function r(){t=!1,e="fetch",I("Reading cart...",null,null);let m;try{m=_()}catch(o){S(`Error reading cart: ${o.message}`),console.error("[TCGmizer] Cart read error:",o);return}if(!m.cartItems||m.cartItems.length===0){let o=document.querySelector("main"),s=o?o.querySelectorAll("article").length:0,i=document.querySelectorAll('a[href*="/product/"]').length,l=document.querySelectorAll("li").length;S(`Could not read cart items. Debug: main=${!!o}, articles=${s}, productLinks=${i}, li=${l}. Make sure you have items in your cart.`);return}O(m.cartItems),console.log(`[TCGmizer] Read ${m.cartItems.length} items from cart, total: $${m.currentCartTotal}`),chrome.runtime.sendMessage({type:C.START_OPTIMIZATION,cartData:m},o=>{if(chrome.runtime.lastError){S(`Failed to start: ${chrome.runtime.lastError.message}`);return}o?.error&&S(o.error)})}function a(m){t=!1,e="solve",I("Optimizing...",null,null),chrome.runtime.sendMessage({type:C.SOLVE_WITH_CONFIG,config:m},o=>{if(chrome.runtime.lastError){S(`Failed to start solver: ${chrome.runtime.lastError.message}`);return}o?.error&&S(o.error)})}chrome.runtime.onMessage.addListener((m,o,s)=>{switch(m.type){case"PING":return s({ok:!0}),!1;case C.TOGGLE_PANEL:{let i=document.getElementById("tcgmizer-panel");i&&(i.style.display==="none"||i.style.display===""?(i.style.display="flex",r()):i.style.display="none"),s({ok:!0});break}case C.OPTIMIZATION_PROGRESS:if(t)break;I(m.message||`${m.stage}...`,m.current,m.total);break;case C.LISTINGS_READY:if(t)break;e=null,U(m.options,a);break;case C.OPTIMIZATION_RESULT:if(t)break;e=null,H(m.result,d);break;case C.OPTIMIZATION_MULTI_RESULT:if(t)break;e=null,B(m.results,d);break;case C.OPTIMIZATION_ERROR:if(t)break;e=null,S(m.error||"An unknown error occurred.");break}return!1});async function d(m){I("Applying optimized cart...",null,null);let o=await P(m);if(!o.success){S(`Failed to apply cart: ${o.error}`);return}if(o.partial){let s=o.totalCount-o.failCount,i=o.fallbackCount||0,l="";if(i>0){l+=`${i} item(s) were sold out and replaced with the next-cheapest listing:
`;for(let u of o.fallbackItems||[])l+=`  \u2022 ${u.cardName}: $${u.originalPrice} \u2192 $${u.fallbackPrice} (${u.fallbackSellerName})
`;l+=`
You may want to re-optimize your cart to find a better overall price.

`}if(o.failCount>0){l+=`${o.failCount} item(s) could not be added:
`;for(let u of o.failedItems){let c=u.setName?` (${u.setName})`:"";l+=`  \u2022 ${u.cardName}${c}: ${u.reason}
`}l+=`
You may need to add the missing items manually.
`}l+=`
Added ${s} of ${o.totalCount} items. The page will reload.`,alert(l)}window.location.reload()}console.log("[TCGmizer] Content script loaded on cart page.")}})();
//# sourceMappingURL=content.js.map
