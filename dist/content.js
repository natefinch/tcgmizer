(()=>{var b={START_OPTIMIZATION:"START_OPTIMIZATION",SOLVE_WITH_CONFIG:"SOLVE_WITH_CONFIG",APPLY_CART:"APPLY_CART",DUMP_DATA:"DUMP_DATA",OPTIMIZATION_PROGRESS:"OPTIMIZATION_PROGRESS",LISTINGS_READY:"LISTINGS_READY",OPTIMIZATION_RESULT:"OPTIMIZATION_RESULT",OPTIMIZATION_MULTI_RESULT:"OPTIMIZATION_MULTI_RESULT",OPTIMIZATION_ERROR:"OPTIMIZATION_ERROR",TOGGLE_PANEL:"TOGGLE_PANEL",CLEAR_SELLER_CACHE:"CLEAR_SELLER_CACHE"};function A(){let e=H(),t=V();return console.log(`[TCGmizer] Cart reader found ${e.length} items, total: $${t}`),{cartItems:e,currentCartTotal:t}}function H(){let e=[],t=document.querySelectorAll('a[href*="/product/"]');if(console.log(`[TCGmizer] Found ${t.length} product links on page`),t.length===0)return e;let r=new Set;for(let n of t){let s=n.closest('li, [role="listitem"]');if(!s||r.has(s))continue;let c=s.closest("article");if(!(!c||!c.closest("main"))){r.add(s);try{let d=B(s,c);d&&(e.push(d),console.log(`[TCGmizer] Parsed: ${d.cardName} (${d.productId}) qty=${d.quantity} $${d.price}`))}catch(d){console.warn("[TCGmizer] Failed to parse cart item:",d)}}}return e}function B(e,t){let r=e.querySelectorAll('a[href*="/product/"]');if(r.length===0)return null;let n=Z(r[0]);if(!n)return null;let{productId:s,customListingKey:c}=n,u="Unknown Card";for(let g of r){let f=g.querySelector("img");if(g.textContent?.trim()&&g.textContent.trim()!==f?.alt?.trim()||g.querySelector("p")){u=g.querySelector("p")?.textContent?.trim()||g.textContent?.trim()||u;break}}let d=e.querySelectorAll("p"),o="",i="",m=0;for(let g of d){let f=g.textContent?.trim()||"";f&&(g.closest('a[href*="/product/"]')||(f.startsWith("$")||f.match(/^\$[\d,.]+$/)?m=L(f):Y(f)?i=f:f.includes(",")&&!f.includes("cart")&&(o=f)))}let p=1,a=e.querySelector('[aria-label*="cart quantity"], [aria-label*="quantity"]');if(a){let g=a.querySelector('li, [role="listitem"]');g&&(p=parseInt(g.textContent?.trim(),10)||1)}if(p===1){let g=e.querySelector('input[type="number"], select');g&&(p=parseInt(g.value,10)||1)}let l=j(t);return{productId:s,cardName:u,quantity:p,price:m,condition:i,setName:o,skuId:null,sellerName:l.sellerName||"",sellerKey:l.sellerKey||"",isDirect:l.isDirect||!1,customListingKey:c||null}}function j(e){let t=e.querySelectorAll('a[href*="seller="], a[href*="direct=true"]');for(let r of t){let n=r.getAttribute("href")||"",s=n.match(/[?&]seller=([^&]+)/),c=n.includes("direct=true"),u=s?s[1]:"",d="",o=[];for(let i of r.childNodes)i.nodeType===Node.TEXT_NODE&&i.textContent?.trim()&&o.push(i.textContent.trim());return d=o[0]||r.textContent?.trim()?.split(`
`)?.[0]?.trim()||"",{sellerName:d,sellerKey:u,isDirect:c}}return{sellerName:"",sellerKey:"",isDirect:!1}}function Y(e){let t=["near mint","lightly played","moderately played","heavily played","damaged","nm","lp","mp","hp"],r=e.toLowerCase();return t.some(n=>r.startsWith(n))}function Z(e){if(!e)return null;let t=e.getAttribute("href")||"",r=t.match(/\/product\/(\d+)/);if(r)return{productId:parseInt(r[1],10),customListingKey:null};let n=t.match(/\/product\/listing\/([^/]+)/);return n?{productId:null,customListingKey:n[1]}:null}function L(e){if(!e)return 0;let t=e.match(/\$?([\d,]+\.?\d*)/);return t&&parseFloat(t[1].replace(/,/g,""))||0}function V(){let e=document.querySelectorAll("p");for(let r of e){let n=r.textContent?.trim()||"";if(n.includes("Cart Subtotal")){let s=L(n);if(s>0)return s}}let t=document.querySelectorAll("h3");for(let r of t)if(r.textContent?.trim()==="Cart Summary"){let n=r.nextElementSibling;for(;n;){let s=n.textContent?.trim()||"";if(s.includes("Cart Subtotal")){let c=L(s);if(c>0)return c}n=n.nextElementSibling}}return 0}var k="https://mpgateway.tcgplayer.com";async function w(e){try{let t=W();if(!t)return{success:!1,error:"Could not find cart key. Please refresh the page and try again."};let r=[];for(let a of e.sellers)for(let l of a.items){if(!l.productConditionId){console.warn("[TCGmizer] Item missing productConditionId:",l);continue}let g=a.isDirect||l.directListing,f=g&&l.originalSellerKey?l.originalSellerKey:a.sellerKey||a.sellerId,C=g&&l.originalSellerNumericId!=null?l.originalSellerNumericId:a.sellerNumericId;r.push({sku:l.productConditionId,sellerId:C,sellerKey:f,price:l.price,quantity:1,cardName:l.cardName,setName:l.setName||"",isDirect:l.directListing||l.directSeller||!1,customListingKey:l.customListingKey||null})}if(r.length===0)return{success:!1,error:"No items in optimized cart."};let n=new Map;for(let a of r){let l=a.customListingKey?`custom:${a.customListingKey}`:`${a.sku}:${a.sellerId}:${a.isDirect}`;if(n.has(l)){let g=n.get(l);g.quantity+=a.quantity,g.cardName+=`, ${a.cardName}`}else n.set(l,{...a})}let s=[...n.values()];console.log(`[TCGmizer] Applying cart: clearing then adding ${r.length} items (${s.length} unique sku+seller combos) via ${k}`);let c=await J(t);if(!c.success)return{success:!1,error:`Failed to clear cart: ${c.error}`};let u=new Set(s.map(a=>`${a.sku}:${a.sellerKey}`)),d=e.fallbackListings||{},o=0,i=0,m=[],p=[];for(let a=0;a<s.length;a++){let l=s[a],g=await _(t,l);if(g.success){a<s.length-1&&await T(50);continue}if(console.warn(`[TCGmizer] Failed to add item ${a+1}/${s.length}: ${g.error}`),console.warn(`[TCGmizer]   Item details: card="${l.cardName}", set="${l.setName}", sku=${l.sku}, sellerKey=${l.sellerKey}, sellerId=${l.sellerId}, price=${l.price}, qty=${l.quantity}, isDirect=${l.isDirect}`),console.warn(`[TCGmizer]   Error code: ${g.errorCode||"none"}`),g.errorCode==="CAPI-4"){let f=l.cardName.split(", ")[0],C=d[f]||[];console.log(`[TCGmizer]   Attempting CAPI-4 fallback for "${f}" \u2014 ${C.length} alternatives available`);let x=!1;for(let h of C){let E=`${h.sku}:${h.sellerKey}`;if(u.has(E))continue;console.log(`[TCGmizer]   Trying fallback: sku=${h.sku}, seller=${h.sellerKey} (${h.sellerName}), price=$${h.price}, set="${h.setName}"`);let U={sku:h.sku,sellerKey:h.sellerKey,price:h.price,quantity:l.quantity,cardName:l.cardName,setName:h.setName||l.setName,isDirect:h.isDirect||!1,customListingKey:h.customListingKey||null},N=await _(t,U);if(N.success){u.add(E),i++,p.push({cardName:f,originalSku:l.sku,originalSellerKey:l.sellerKey,originalPrice:l.price,fallbackSku:h.sku,fallbackSellerKey:h.sellerKey,fallbackPrice:h.price,fallbackSetName:h.setName,fallbackSellerName:h.sellerName}),console.log(`[TCGmizer]   \u2713 Fallback succeeded for "${f}" \u2014 new price: $${h.price} from ${h.sellerName}`),x=!0;break}u.add(E),console.warn(`[TCGmizer]   Fallback also failed (${N.errorCode||"unknown"}): sku=${h.sku}, seller=${h.sellerKey}`),await T(50)}if(x){a<s.length-1&&await T(50);continue}console.warn(`[TCGmizer]   All fallbacks exhausted for "${f}"`)}o++,m.push({cardName:l.cardName,setName:l.setName,sku:l.sku,sellerKey:l.sellerKey,price:l.price,errorCode:g.errorCode,reason:X(g.errorCode)||g.error}),a<s.length-1&&await T(50)}if(o===s.length)return{success:!1,error:`Failed to add all items. ${m[0]?.reason||"Unknown error"}`};if(i>0){console.log(`[TCGmizer] ${i} item(s) were replaced with fallback listings:`);for(let a of p)console.log(`[TCGmizer]   - ${a.cardName}: $${a.originalPrice} \u2192 $${a.fallbackPrice} (${a.fallbackSellerName}, ${a.fallbackSetName})`)}if(o>0){console.warn(`[TCGmizer] ${o}/${s.length} items failed to add:`);for(let a of m)console.warn(`[TCGmizer]   - ${a.cardName} (${a.setName}): ${a.errorCode||"unknown"} \u2014 ${a.reason}`);return{success:!0,partial:!0,failCount:o,totalCount:s.length,failedItems:m,fallbackCount:i,fallbackItems:p}}return i>0?{success:!0,partial:!0,failCount:0,totalCount:s.length,failedItems:[],fallbackCount:i,fallbackItems:p}:{success:!0,partial:!1,failCount:0,totalCount:s.length,failedItems:[],fallbackCount:0,fallbackItems:[]}}catch(t){return{success:!1,error:t.message}}}function P(e){try{sessionStorage.setItem("tcgmizer_undo_cart",JSON.stringify({timestamp:Date.now(),items:e}))}catch(t){console.warn("[TCGmizer] Failed to save cart state for undo:",t)}}function W(){let e=document.cookie.split(";");for(let t of e){let r=t.trim();if(r.startsWith("StoreCart_PRODUCTION=")){let n=r.substring(21),c=new URLSearchParams(n).get("CK");return c||n}}return null}async function J(e){try{let t=await fetch(`${k}/v1/cart/${e}/items/all`,{method:"DELETE",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"include"});if(!t.ok){let r=await t.text().catch(()=>"");return{success:!1,error:`HTTP ${t.status}: ${r.substring(0,200)}`}}return{success:!0}}catch(t){return{success:!1,error:t.message}}}async function _(e,t){let r=!!t.customListingKey,n,s;r?(n=`${k}/v1/cart/${e}/listo/add`,s={customListingKey:t.customListingKey,priceAtAdd:t.price,quantityToBuy:t.quantity||1,channelId:0,countryCode:"US"}):(n=`${k}/v1/cart/${e}/item/add`,s={sku:t.sku,sellerKey:t.sellerKey,channelId:0,requestedQuantity:t.quantity||1,price:t.price,isDirect:t.isDirect||!1,countryCode:"US"}),console.log(`[TCGmizer] Adding to cart: "${t.cardName}" (${t.setName||"no set"}) \u2014 sku=${t.sku}, seller=${t.sellerKey}, price=$${t.price}, qty=${t.quantity||1}, isDirect=${t.isDirect||!1}${r?", customListingKey="+t.customListingKey:""}`),console.log(`[TCGmizer]   ${r?"Custom listing":"Standard"} \u2192 ${n.split("/").slice(-2).join("/")}`),console.log("[TCGmizer]   Request body:",JSON.stringify(s));try{let c=await fetch(n,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"include",body:JSON.stringify(s)}),u=await c.text().catch(()=>"");if(console.log(`[TCGmizer]   Response ${c.status}: ${u.substring(0,500)}`),!c.ok){let d=null;try{d=JSON.parse(u)?.errors?.[0]?.code||null}catch{}return{success:!1,error:`HTTP ${c.status}: ${u.substring(0,200)}`,errorCode:d}}try{let d=JSON.parse(u);if(d?.errors&&d.errors.length>0){let o=d.errors[0]?.code||"";return{success:!1,error:`API error: ${d.errors[0]?.message||""} (${o})`,errorCode:o}}}catch{}return{success:!0}}catch(c){return console.error("[TCGmizer]   Network error:",c),{success:!1,error:c.message,errorCode:null}}}function X(e){switch(e){case"CAPI-4":return"Sold out (no longer available from this seller)";case"CAPI-17":return"Product not found (may have been delisted)";case"CAPI-35":return"Product not available for purchase";default:return`Error: ${e}`}}function T(e){return new Promise(t=>setTimeout(t,e))}var $="tcgmizer-panel";function G(){if(document.getElementById($))return;let e=document.createElement("div");e.id=$,e.innerHTML=`
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
      </div>
      <div class="tcgmizer-config" style="display:none"></div>
      <div class="tcgmizer-results" style="display:none"></div>
      <div class="tcgmizer-error" style="display:none">
        <p class="tcgmizer-error-text"></p>
        <button class="tcgmizer-btn tcgmizer-retry">Try Again</button>
      </div>
    </div>
  `,document.body.appendChild(e);let t=e.querySelector(".tcgmizer-header"),r=!1,n=0,s=0;t.addEventListener("mousedown",c=>{c.target.closest(".tcgmizer-close")||(r=!0,n=c.clientX-e.offsetLeft,s=c.clientY-e.offsetTop,t.style.cursor="grabbing",c.preventDefault())}),document.addEventListener("mousemove",c=>{r&&(e.style.left=c.clientX-n+"px",e.style.top=c.clientY-s+"px",e.style.right="auto")}),document.addEventListener("mouseup",()=>{r&&(r=!1,t.style.cursor="")}),e.querySelector(".tcgmizer-close").addEventListener("click",()=>{e.style.display="none"}),e.querySelector(".tcgmizer-start").addEventListener("click",()=>{typeof e._onStart=="function"&&e._onStart()}),e.querySelector(".tcgmizer-retry").addEventListener("click",()=>{e._hasConfig?(y(e,".tcgmizer-error"),v(e,".tcgmizer-config")):typeof e._onStart=="function"&&e._onStart()})}function R(e){let t=document.getElementById($);t&&(t._onStart=e)}function q(){let e=document.getElementById($);e&&(e.style.display="flex")}function I(e,t,r){let n=document.getElementById($);if(!n)return;y(n,".tcgmizer-idle"),y(n,".tcgmizer-config"),y(n,".tcgmizer-results"),y(n,".tcgmizer-error"),v(n,".tcgmizer-progress"),n.querySelector(".tcgmizer-progress-text").textContent=e||"Working...";let s=n.querySelector(".tcgmizer-progress-bar");t!=null&&r!=null&&r>0?(s.style.width=`${Math.round(t/r*100)}%`,s.classList.remove("tcgmizer-progress-bar-indeterminate")):(s.style.width="100%",s.classList.add("tcgmizer-progress-bar-indeterminate"))}function D(e,t){let r=document.getElementById($);if(!r)return;r._hasConfig=!0,y(r,".tcgmizer-idle"),y(r,".tcgmizer-progress"),y(r,".tcgmizer-results"),y(r,".tcgmizer-error"),v(r,".tcgmizer-config");let n=r.querySelector(".tcgmizer-config"),s=e.languages.map(o=>{let i=o==="English"?"checked":"";return`<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${z(o)}" ${i} /> ${z(o)}
    </label>`}).join(""),c=e.conditions.map(o=>{let i=o==="Damaged"?"":"checked";return`<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${z(o)}" ${i} /> ${z(o)}
    </label>`}).join("");n.innerHTML=`
    <div class="tcgmizer-config-summary">
      Found ${e.listingCount.toLocaleString()} listings from ${e.sellerCount.toLocaleString()} sellers for ${e.cardCount} card${e.cardCount!==1?"s":""}.
    </div>

    <div class="tcgmizer-config-section">
      <div class="tcgmizer-config-label">Language</div>
      <div class="tcgmizer-config-options tcgmizer-lang-options">
        ${s}
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

    <div class="tcgmizer-config-section">
      <div class="tcgmizer-config-label">Condition</div>
      <div class="tcgmizer-config-options tcgmizer-cond-options">
        ${c}
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
  `,chrome.storage.local.get("optimizerSettings",o=>{let i=o.optimizerSettings;i&&(i.languages&&i.languages.length>0&&n.querySelectorAll('.tcgmizer-lang-options input[type="checkbox"]').forEach(m=>{m.checked=i.languages.includes(m.value)}),i.conditions&&i.conditions.length>0&&n.querySelectorAll('.tcgmizer-cond-options input[type="checkbox"]').forEach(m=>{m.checked=i.conditions.includes(m.value)}),i.minimizeVendors!=null&&(n.querySelector(".tcgmizer-minimize-vendors").checked=i.minimizeVendors,n.querySelector(".tcgmizer-max-cuts").disabled=!i.minimizeVendors),i.maxCuts!=null&&(n.querySelector(".tcgmizer-max-cuts").value=String(i.maxCuts)),i.exactPrintings!=null&&(n.querySelector(".tcgmizer-exact-printings").checked=i.exactPrintings))});function u(o){let i=n.querySelector(".tcgmizer-exclude-banned"),m=n.querySelector(".tcgmizer-ban-count-label");!i||!m||(o.length===0?(i.checked=!1,i.disabled=!0,m.textContent="(none banned)"):(i.disabled=!1,i.checked=!0,m.textContent=`(${o.length} banned)`),i._bannedKeys=o.map(p=>p.sellerKey))}chrome.storage.sync.get("bannedSellers",o=>{u(o.bannedSellers||[])}),chrome.storage.onChanged.addListener((o,i)=>{i==="sync"&&o.bannedSellers&&u(o.bannedSellers.newValue||[])}),n.querySelector(".tcgmizer-manage-ban-link").addEventListener("click",o=>{o.preventDefault(),chrome.runtime.sendMessage({type:"OPEN_OPTIONS_PAGE"})}),n.querySelectorAll(".tcgmizer-select-all").forEach(o=>{o.addEventListener("click",i=>{i.preventDefault();let m=o.dataset.target;n.querySelectorAll(`.tcgmizer-${m}-options input[type="checkbox"]`).forEach(p=>p.checked=!0)})}),n.querySelectorAll(".tcgmizer-select-none").forEach(o=>{o.addEventListener("click",i=>{i.preventDefault();let m=o.dataset.target;n.querySelectorAll(`.tcgmizer-${m}-options input[type="checkbox"]`).forEach(p=>p.checked=!1)})}),n.querySelector(".tcgmizer-minimize-vendors").addEventListener("change",o=>{n.querySelector(".tcgmizer-max-cuts").disabled=!o.target.checked}),n.querySelector(".tcgmizer-run-solver").addEventListener("click",()=>{let o=[...n.querySelectorAll(".tcgmizer-lang-options input:checked")].map(C=>C.value),i=[...n.querySelectorAll(".tcgmizer-cond-options input:checked")].map(C=>C.value),m=n.querySelector(".tcgmizer-minimize-vendors").checked,p=parseInt(n.querySelector(".tcgmizer-max-cuts").value,10)||0,a=n.querySelector(".tcgmizer-exact-printings").checked,l=n.querySelector(".tcgmizer-exclude-banned"),g=l.checked&&l._bannedKeys?l._bannedKeys:[];if(o.length===0){alert("Please select at least one language.");return}if(i.length===0){alert("Please select at least one condition.");return}chrome.storage.local.set({optimizerSettings:{languages:o,conditions:i,minimizeVendors:m,maxCuts:p,exactPrintings:a}});let f={languages:o.length===e.languages.length?[]:o,conditions:i.length===e.conditions.length?[]:i,minimizeVendors:m,maxCuts:m?p:0,exactPrintings:a,bannedSellerKeys:g};typeof t=="function"&&t(f)});let d=n.querySelector(".tcgmizer-dump-data");d&&d.addEventListener("click",()=>{chrome.runtime.sendMessage({type:"DUMP_DATA"},o=>{if(chrome.runtime.lastError){console.error("[TCGmizer Debug] Dump failed:",chrome.runtime.lastError.message),alert("Dump failed: "+chrome.runtime.lastError.message);return}if(o?.error){alert("Dump failed: "+o.error);return}if(o?.data){let i=JSON.stringify(o.data,null,2),m=new Blob([i],{type:"application/json"}),p=URL.createObjectURL(m),a=document.createElement("a");a.href=p,a.download=`tcgmizer-dump-${Date.now()}.json`,document.body.appendChild(a),a.click(),document.body.removeChild(a),URL.revokeObjectURL(p),console.log(`[TCGmizer Debug] Dumped ${i.length} bytes`)}})}),n.querySelector(".tcgmizer-refetch").addEventListener("click",()=>{typeof r._onStart=="function"&&r._onStart()})}function M(e,t){let r=document.getElementById($);if(!r)return;y(r,".tcgmizer-idle"),y(r,".tcgmizer-progress"),y(r,".tcgmizer-config"),y(r,".tcgmizer-error"),v(r,".tcgmizer-results");let n=r.querySelector(".tcgmizer-results");if(!e.success){n.innerHTML=`
      <div class="tcgmizer-result-error">
        <p>Optimization failed: ${z(e.error)}</p>
      </div>
    `;return}let s=e.savings>0?"tcgmizer-savings-positive":"tcgmizer-savings-neutral",c=e.savings>0?`Save $${e.savings.toFixed(2)}!`:e.savings===0?"Same price (but possibly fewer packages)":`$${Math.abs(e.savings).toFixed(2)} more (current cart is already optimal)`,u="";for(let d of e.sellers)u+=K(d,!0);n.innerHTML=`
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
      <div class="tcgmizer-summary-row ${s}">
        <span>${c}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>${e.itemCount} items from ${e.sellerCount} seller${e.sellerCount!==1?"s":""}</span>
      </div>
    </div>
    <div class="tcgmizer-actions">
      <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-apply">Apply to Cart</button>
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
    <div class="tcgmizer-sellers-list">${u}</div>
  `,n.querySelector(".tcgmizer-apply").addEventListener("click",()=>{confirm("This will replace your current TCGPlayer cart with the optimized selections. This cannot be undone! Continue?")&&typeof t=="function"&&t(e)}),n.querySelector(".tcgmizer-back-to-config").addEventListener("click",()=>{y(r,".tcgmizer-results"),v(r,".tcgmizer-config")})}function F(e,t){let r=document.getElementById($);if(!r)return;y(r,".tcgmizer-idle"),y(r,".tcgmizer-progress"),y(r,".tcgmizer-config"),y(r,".tcgmizer-error"),v(r,".tcgmizer-results");let n=r.querySelector(".tcgmizer-results");if(!e||e.length===0){n.innerHTML=`
      <div class="tcgmizer-result-error">
        <p>No feasible solutions found.</p>
      </div>
    `;return}let s=e[e.length-1],c="";for(let i=0;i<e.length;i++){let m=e[i],p=m.totalCost-s.totalCost,a=p>.005?`+$${p.toFixed(2)}`:"Cheapest",l=p>.005?"":"tcgmizer-cheapest-tag",g=m.cutCards&&m.cutCards.length>0?`<div class="tcgmizer-cut-info" title="${z(m.cutCards.join(" \xB7 "))}">\u2702\uFE0F Cut ${m.cutCards.length} card${m.cutCards.length!==1?"s":""}: ${z(m.cutCards.join(" \xB7 "))}</div>`:"",f="";for(let C of m.sellers)f+=K(C,!1);c+=`
      <div class="tcgmizer-compare-row" data-index="${i}">
        <div class="tcgmizer-compare-row-summary">
          <span class="tcgmizer-compare-vendors">${m.sellerCount} vendor${m.sellerCount!==1?"s":""}</span>
          <span class="tcgmizer-compare-price">$${m.totalCost.toFixed(2)}</span>
          <span class="tcgmizer-compare-extra ${l}">${a}</span>
          <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-compare-apply">Apply</button>
          <span class="tcgmizer-compare-toggle">\u25B6</span>
        </div>
        ${g}
        <div class="tcgmizer-compare-detail" style="display:none">
          <div class="tcgmizer-summary-row tcgmizer-summary-detail" style="margin-bottom:8px">
            Items: $${m.totalItemCost.toFixed(2)} \xB7 Shipping: $${m.totalShipping.toFixed(2)}
          </div>
          <div class="tcgmizer-sellers-list">${f}</div>
        </div>
      </div>
    `}let u=e[0].currentCartTotal,d=u-s.totalCost,o=d>0?`Best savings: $${d.toFixed(2)}`:"Current cart is already near optimal";n.innerHTML=`
    <div class="tcgmizer-summary">
      <div class="tcgmizer-summary-row">
        <span>Current cart:</span>
        <span>$${u.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row tcgmizer-savings-positive">
        <span>${o}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>Found ${e.length} option${e.length!==1?"s":""} \u2014 click a row to see details</span>
      </div>
    </div>
    <div class="tcgmizer-compare-table">${c}</div>
    <div class="tcgmizer-actions" style="margin-top:12px">
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
  `,n.querySelectorAll(".tcgmizer-compare-row").forEach(i=>{let m=i.querySelector(".tcgmizer-compare-row-summary"),p=i.querySelector(".tcgmizer-compare-detail"),a=i.querySelector(".tcgmizer-compare-toggle");m.addEventListener("click",l=>{if(l.target.closest(".tcgmizer-compare-apply"))return;let g=p.style.display!=="none";p.style.display=g?"none":"block",a.textContent=g?"\u25B6":"\u25BC",i.classList.toggle("tcgmizer-compare-row-expanded",!g)})}),n.querySelectorAll(".tcgmizer-compare-apply").forEach(i=>{i.addEventListener("click",m=>{let p=parseInt(m.target.closest(".tcgmizer-compare-row").dataset.index,10),a=e[p];confirm(`Apply cart with ${a.sellerCount} vendor${a.sellerCount!==1?"s":""} ($${a.totalCost.toFixed(2)})? This will replace your current TCGPlayer cart. This cannot be undone!`)&&typeof t=="function"&&t(a)})}),n.querySelector(".tcgmizer-back-to-config").addEventListener("click",()=>{y(r,".tcgmizer-results"),v(r,".tcgmizer-config")})}function S(e){let t=document.getElementById($);t&&(y(t,".tcgmizer-idle"),y(t,".tcgmizer-progress"),y(t,".tcgmizer-config"),y(t,".tcgmizer-results"),v(t,".tcgmizer-error"),t.querySelector(".tcgmizer-error-text").textContent=e)}function v(e,t){let r=e.querySelector(t);r&&(r.style.display="block")}function y(e,t){let r=e.querySelector(t);r&&(r.style.display="none")}function z(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}var Q={"Near Mint":"NM","Lightly Played":"LP","Moderately Played":"MP","Heavily Played":"HP",Damaged:"DMG",Mint:"M","Near Mint Foil":"NM-F","Lightly Played Foil":"LP-F","Moderately Played Foil":"MP-F","Heavily Played Foil":"HP-F","Damaged Foil":"DMG-F"};function ee(e){return e?Q[e]||e:""}function K(e,t){let r=te(e.items),n=re(r,t),s=e.freeShipping?'<span class="tcgmizer-free-shipping">FREE shipping</span>':`Shipping: $${e.shippingCost.toFixed(2)}`,c=e.isDirect?" tcgmizer-seller-direct":"",u=e.isDirect?`<img src="https://mp-assets.tcgplayer.com/img/direct-icon-new.svg" alt="Direct" style="height:14px;vertical-align:middle;margin-right:4px" />${z(e.sellerName)}`:z(e.sellerName);return`
    <div class="tcgmizer-seller${c}">
      <div class="tcgmizer-seller-header">
        <span class="tcgmizer-seller-name">${u}</span>
        <span class="tcgmizer-seller-total">$${e.sellerTotal.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-seller-meta">
        ${e.items.length} item${e.items.length!==1?"s":""} \xB7 
        Subtotal: $${e.subtotal.toFixed(2)} \xB7 ${s}
      </div>
      <div class="tcgmizer-seller-items">${n}</div>
    </div>
  `}function te(e){let t=[],r=new Map;for(let n of e){let s=`${n.productId}|${n.condition}|${n.language}|${n.price}|${n.productConditionId}`;r.has(s)?t[r.get(s)].qty+=1:(r.set(s,t.length),t.push({item:n,qty:1}))}return t}function re(e,t){return e.map(({item:r,qty:n})=>{let s=t&&r.printingChanged?` <span class="tcgmizer-changed" title="Different printing (originally ${z(O(r.originalSetName)||"unknown set")})">\u{1F500}</span>`:"",c=n>1?`<span class="tcgmizer-item-qty">${n}\xD7</span> `:"",u=[ee(r.condition),O(r.setName),r.language].filter(Boolean).join(" \xB7 "),d=`https://tcgplayer-cdn.tcgplayer.com/product/${r.productId}_200w.jpg`,o=n>1?`$${r.price.toFixed(2)} ea`:`$${r.price.toFixed(2)}`;return`
      <div class="tcgmizer-item">
        <img class="tcgmizer-item-img" src="${d}" alt="${z(r.cardName)}" loading="lazy" />
        <div class="tcgmizer-item-info">
          <span class="tcgmizer-item-name">${c}${z(r.cardName)}${s}</span>
          <span class="tcgmizer-item-details">${z(u)}</span>
        </div>
        <span class="tcgmizer-item-price">${o}</span>
      </div>
    `}).join("")}function O(e){if(!e)return"";let t=e.split(",").map(c=>c.trim());if(t.length<=1)return e;let r=["Magic: The Gathering","Pokemon","Yu-Gi-Oh","Yu-Gi-Oh!","Flesh and Blood","Lorcana","One Piece Card Game","Dragon Ball Super Card Game","Digimon Card Game","MetaZoo","Final Fantasy","Cardfight!! Vanguard","Weiss Schwarz","Star Wars: Unlimited"],n=new Set(r.map(c=>c.toLowerCase()));return t.filter(c=>!(n.has(c.toLowerCase())||/^[A-Z]$/.test(c)||/^\d+$/.test(c))).join(", ")||t[0]}window.__tcgmizerContentLoaded?console.log("[TCGmizer] Content script already loaded, skipping duplicate injection."):(window.__tcgmizerContentLoaded=!0,ne());function ne(){G(),e(),R(()=>{t()});function e(){let s="tcgmizer-cart-btn";function c(){if(document.getElementById(s))return!0;let u=document.querySelector(".optimize-btn-block");if(!u)return!1;let d=document.createElement("div"),o=getComputedStyle(u);d.style.cssText=`
      padding: ${o.padding};
      margin-top: 12px;
      background: ${o.background};
      border: ${o.border};
      border-radius: ${o.borderRadius};
      box-shadow: ${o.boxShadow};
    `;let i=document.createElement("button");return i.id=s,i.type="button",i.textContent="\u26A1 Optimize with TCGmizer",i.style.cssText=`
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
    `,i.addEventListener("mouseenter",()=>{i.style.background="#258a50"}),i.addEventListener("mouseleave",()=>{i.style.background="#2e9e5e"}),i.addEventListener("click",()=>{q(),t()}),d.appendChild(i),u.insertAdjacentElement("afterend",d),!0}if(!c()){let u=new MutationObserver(()=>{c()&&u.disconnect()});u.observe(document.body,{childList:!0,subtree:!0})}}function t(){I("Reading cart...",null,null);let s;try{s=A()}catch(c){S(`Error reading cart: ${c.message}`),console.error("[TCGmizer] Cart read error:",c);return}if(!s.cartItems||s.cartItems.length===0){let c=document.querySelector("main"),u=c?c.querySelectorAll("article").length:0,d=document.querySelectorAll('a[href*="/product/"]').length,o=document.querySelectorAll("li").length;S(`Could not read cart items. Debug: main=${!!c}, articles=${u}, productLinks=${d}, li=${o}. Make sure you have items in your cart.`);return}P(s.cartItems),console.log(`[TCGmizer] Read ${s.cartItems.length} items from cart, total: $${s.currentCartTotal}`),chrome.runtime.sendMessage({type:b.START_OPTIMIZATION,cartData:s},c=>{if(chrome.runtime.lastError){S(`Failed to start: ${chrome.runtime.lastError.message}`);return}c?.error&&S(c.error)})}function r(s){I("Optimizing...",null,null),chrome.runtime.sendMessage({type:b.SOLVE_WITH_CONFIG,config:s},c=>{if(chrome.runtime.lastError){S(`Failed to start solver: ${chrome.runtime.lastError.message}`);return}c?.error&&S(c.error)})}chrome.runtime.onMessage.addListener((s,c,u)=>{switch(s.type){case"PING":return u({ok:!0}),!1;case b.TOGGLE_PANEL:{let d=document.getElementById("tcgmizer-panel");d&&(d.style.display==="none"||d.style.display===""?(d.style.display="flex",t()):d.style.display="none"),u({ok:!0});break}case b.OPTIMIZATION_PROGRESS:I(s.message||`${s.stage}...`,s.current,s.total);break;case b.LISTINGS_READY:D(s.options,r);break;case b.OPTIMIZATION_RESULT:M(s.result,n);break;case b.OPTIMIZATION_MULTI_RESULT:F(s.results,n);break;case b.OPTIMIZATION_ERROR:S(s.error||"An unknown error occurred.");break}return!1});async function n(s){I("Applying optimized cart...",null,null);let c=await w(s);if(!c.success){S(`Failed to apply cart: ${c.error}`);return}if(c.partial){let u=c.totalCount-c.failCount,d=c.fallbackCount||0,o="";if(d>0){o+=`${d} item(s) were sold out and replaced with the next-cheapest listing:
`;for(let i of c.fallbackItems||[])o+=`  \u2022 ${i.cardName}: $${i.originalPrice} \u2192 $${i.fallbackPrice} (${i.fallbackSellerName})
`;o+=`
You may want to re-optimize your cart to find a better overall price.

`}if(c.failCount>0){o+=`${c.failCount} item(s) could not be added:
`;for(let i of c.failedItems){let m=i.setName?` (${i.setName})`:"";o+=`  \u2022 ${i.cardName}${m}: ${i.reason}
`}o+=`
You may need to add the missing items manually.
`}o+=`
Added ${u} of ${c.totalCount} items. The page will reload.`,alert(o)}window.location.reload()}console.log("[TCGmizer] Content script loaded on cart page.")}})();
//# sourceMappingURL=content.js.map
