(()=>{var $={START_OPTIMIZATION:"START_OPTIMIZATION",SOLVE_WITH_CONFIG:"SOLVE_WITH_CONFIG",APPLY_CART:"APPLY_CART",OPTIMIZATION_PROGRESS:"OPTIMIZATION_PROGRESS",LISTINGS_READY:"LISTINGS_READY",OPTIMIZATION_RESULT:"OPTIMIZATION_RESULT",OPTIMIZATION_MULTI_RESULT:"OPTIMIZATION_MULTI_RESULT",OPTIMIZATION_ERROR:"OPTIMIZATION_ERROR",TOGGLE_PANEL:"TOGGLE_PANEL"};function w(){let e=H(),t=V();return console.log(`[TCGmizer] Cart reader found ${e.length} items, total: $${t}`),{cartItems:e,currentCartTotal:t}}function H(){let e=[],t=document.querySelectorAll('a[href*="/product/"]');if(console.log(`[TCGmizer] Found ${t.length} product links on page`),t.length===0)return e;let r=new Set;for(let n of t){let s=n.closest('li, [role="listitem"]');if(!s||r.has(s))continue;let i=s.closest("article");if(!(!i||!i.closest("main"))){r.add(s);try{let c=B(s,i);c&&(e.push(c),console.log(`[TCGmizer] Parsed: ${c.cardName} (${c.productId}) qty=${c.quantity} $${c.price}`))}catch(c){console.warn("[TCGmizer] Failed to parse cart item:",c)}}}return e}function B(e,t){let r=e.querySelectorAll('a[href*="/product/"]');if(r.length===0)return null;let n=Z(r[0]);if(!n)return null;let{productId:s,customListingKey:i}=n,o="Unknown Card";for(let u of r){let p=u.querySelector("img");if(u.textContent?.trim()&&u.textContent.trim()!==p?.alt?.trim()||u.querySelector("p")){o=u.querySelector("p")?.textContent?.trim()||u.textContent?.trim()||o;break}}let c=e.querySelectorAll("p"),d="",a="",g=0;for(let u of c){let p=u.textContent?.trim()||"";p&&(u.closest('a[href*="/product/"]')||(p.startsWith("$")||p.match(/^\$[\d,.]+$/)?g=N(p):j(p)?a=p:p.includes(",")&&!p.includes("cart")&&(d=p)))}let h=1,l=e.querySelector('[aria-label*="cart quantity"], [aria-label*="quantity"]');if(l){let u=l.querySelector('li, [role="listitem"]');u&&(h=parseInt(u.textContent?.trim(),10)||1)}if(h===1){let u=e.querySelector('input[type="number"], select');u&&(h=parseInt(u.value,10)||1)}let m=Y(t);return{productId:s,cardName:o,quantity:h,price:g,condition:a,setName:d,skuId:null,sellerName:m.sellerName||"",sellerKey:m.sellerKey||"",isDirect:m.isDirect||!1,customListingKey:i||null}}function Y(e){let t=e.querySelectorAll('a[href*="seller="], a[href*="direct=true"]');for(let r of t){let n=r.getAttribute("href")||"",s=n.match(/[?&]seller=([^&]+)/),i=n.includes("direct=true"),o=s?s[1]:"",c="",d=[];for(let a of r.childNodes)a.nodeType===Node.TEXT_NODE&&a.textContent?.trim()&&d.push(a.textContent.trim());return c=d[0]||r.textContent?.trim()?.split(`
`)?.[0]?.trim()||"",{sellerName:c,sellerKey:o,isDirect:i}}return{sellerName:"",sellerKey:"",isDirect:!1}}function j(e){let t=["near mint","lightly played","moderately played","heavily played","damaged","nm","lp","mp","hp"],r=e.toLowerCase();return t.some(n=>r.startsWith(n))}function Z(e){if(!e)return null;let t=e.getAttribute("href")||"",r=t.match(/\/product\/(\d+)/);if(r)return{productId:parseInt(r[1],10),customListingKey:null};let n=t.match(/\/product\/listing\/([^/]+)/);return n?{productId:null,customListingKey:n[1]}:null}function N(e){if(!e)return 0;let t=e.match(/\$?([\d,]+\.?\d*)/);return t&&parseFloat(t[1].replace(/,/g,""))||0}function V(){let e=document.querySelectorAll("p");for(let r of e){let n=r.textContent?.trim()||"";if(n.includes("Cart Subtotal")){let s=N(n);if(s>0)return s}}let t=document.querySelectorAll("h3");for(let r of t)if(r.textContent?.trim()==="Cart Summary"){let n=r.nextElementSibling;for(;n;){let s=n.textContent?.trim()||"";if(s.includes("Cart Subtotal")){let i=N(s);if(i>0)return i}n=n.nextElementSibling}}return 0}var T="https://mpgateway.tcgplayer.com";async function A(e){try{let t=W();if(!t)return{success:!1,error:"Could not find cart key. Please refresh the page and try again."};let r=[];for(let l of e.sellers)for(let m of l.items){if(!m.productConditionId){console.warn("[TCGmizer] Item missing productConditionId:",m);continue}r.push({sku:m.productConditionId,sellerId:l.sellerNumericId,sellerKey:l.sellerKey||l.sellerId,price:m.price,quantity:1,cardName:m.cardName,setName:m.setName||"",isDirect:m.directSeller||!1,customListingKey:m.customListingKey||null})}if(r.length===0)return{success:!1,error:"No items in optimized cart."};let n=new Map;for(let l of r){let m=l.customListingKey?`custom:${l.customListingKey}`:`${l.sku}:${l.sellerId}:${l.isDirect}`;if(n.has(m)){let u=n.get(m);u.quantity+=l.quantity,u.cardName+=`, ${l.cardName}`}else n.set(m,{...l})}let s=[...n.values()];console.log(`[TCGmizer] Applying cart: clearing then adding ${r.length} items (${s.length} unique sku+seller combos) via ${T}`);let i=await J(t);if(!i.success)return{success:!1,error:`Failed to clear cart: ${i.error}`};let o=new Set(s.map(l=>`${l.sku}:${l.sellerKey}`)),c=e.fallbackListings||{},d=0,a=0,g=[],h=[];for(let l=0;l<s.length;l++){let m=s[l],u=await _(t,m);if(u.success){l<s.length-1&&await I(50);continue}if(console.warn(`[TCGmizer] Failed to add item ${l+1}/${s.length}: ${u.error}`),console.warn(`[TCGmizer]   Item details: card="${m.cardName}", set="${m.setName}", sku=${m.sku}, sellerKey=${m.sellerKey}, sellerId=${m.sellerId}, price=${m.price}, qty=${m.quantity}, isDirect=${m.isDirect}`),console.warn(`[TCGmizer]   Error code: ${u.errorCode||"none"}`),u.errorCode==="CAPI-4"){let p=m.cardName.split(", ")[0],k=c[p]||[];console.log(`[TCGmizer]   Attempting CAPI-4 fallback for "${p}" \u2014 ${k.length} alternatives available`);let x=!1;for(let y of k){let E=`${y.sku}:${y.sellerKey}`;if(o.has(E))continue;console.log(`[TCGmizer]   Trying fallback: sku=${y.sku}, seller=${y.sellerKey} (${y.sellerName}), price=$${y.price}, set="${y.setName}"`);let U={sku:y.sku,sellerKey:y.sellerKey,price:y.price,quantity:m.quantity,cardName:m.cardName,setName:y.setName||m.setName,isDirect:y.isDirect||!1,customListingKey:y.customListingKey||null},L=await _(t,U);if(L.success){o.add(E),a++,h.push({cardName:p,originalSku:m.sku,originalSellerKey:m.sellerKey,originalPrice:m.price,fallbackSku:y.sku,fallbackSellerKey:y.sellerKey,fallbackPrice:y.price,fallbackSetName:y.setName,fallbackSellerName:y.sellerName}),console.log(`[TCGmizer]   \u2713 Fallback succeeded for "${p}" \u2014 new price: $${y.price} from ${y.sellerName}`),x=!0;break}o.add(E),console.warn(`[TCGmizer]   Fallback also failed (${L.errorCode||"unknown"}): sku=${y.sku}, seller=${y.sellerKey}`),await I(50)}if(x){l<s.length-1&&await I(50);continue}console.warn(`[TCGmizer]   All fallbacks exhausted for "${p}"`)}d++,g.push({cardName:m.cardName,setName:m.setName,sku:m.sku,sellerKey:m.sellerKey,price:m.price,errorCode:u.errorCode,reason:X(u.errorCode)||u.error}),l<s.length-1&&await I(50)}if(d===s.length)return{success:!1,error:`Failed to add all items. ${g[0]?.reason||"Unknown error"}`};if(a>0){console.log(`[TCGmizer] ${a} item(s) were replaced with fallback listings:`);for(let l of h)console.log(`[TCGmizer]   - ${l.cardName}: $${l.originalPrice} \u2192 $${l.fallbackPrice} (${l.fallbackSellerName}, ${l.fallbackSetName})`)}if(d>0){console.warn(`[TCGmizer] ${d}/${s.length} items failed to add:`);for(let l of g)console.warn(`[TCGmizer]   - ${l.cardName} (${l.setName}): ${l.errorCode||"unknown"} \u2014 ${l.reason}`);return{success:!0,partial:!0,failCount:d,totalCount:s.length,failedItems:g,fallbackCount:a,fallbackItems:h}}return a>0?{success:!0,partial:!0,failCount:0,totalCount:s.length,failedItems:[],fallbackCount:a,fallbackItems:h}:{success:!0,partial:!1,failCount:0,totalCount:s.length,failedItems:[],fallbackCount:0,fallbackItems:[]}}catch(t){return{success:!1,error:t.message}}}function P(e){try{sessionStorage.setItem("tcgmizer_undo_cart",JSON.stringify({timestamp:Date.now(),items:e}))}catch(t){console.warn("[TCGmizer] Failed to save cart state for undo:",t)}}function W(){let e=document.cookie.split(";");for(let t of e){let r=t.trim();if(r.startsWith("StoreCart_PRODUCTION=")){let n=r.substring(21),i=new URLSearchParams(n).get("CK");return i||n}}return null}async function J(e){try{let t=await fetch(`${T}/v1/cart/${e}/items/all`,{method:"DELETE",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"include"});if(!t.ok){let r=await t.text().catch(()=>"");return{success:!1,error:`HTTP ${t.status}: ${r.substring(0,200)}`}}return{success:!0}}catch(t){return{success:!1,error:t.message}}}async function _(e,t){let r=!!t.customListingKey,n,s;r?(n=`${T}/v1/cart/${e}/listo/add`,s={customListingKey:t.customListingKey,priceAtAdd:t.price,quantityToBuy:t.quantity||1,channelId:0,countryCode:"US"}):(n=`${T}/v1/cart/${e}/item/add`,s={sku:t.sku,sellerKey:t.sellerKey,channelId:0,requestedQuantity:t.quantity||1,price:t.price,isDirect:t.isDirect||!1,countryCode:"US"}),console.log(`[TCGmizer] Adding to cart: "${t.cardName}" (${t.setName||"no set"}) \u2014 sku=${t.sku}, seller=${t.sellerKey}, price=$${t.price}, qty=${t.quantity||1}, isDirect=${t.isDirect||!1}${r?", customListingKey="+t.customListingKey:""}`),console.log(`[TCGmizer]   ${r?"Custom listing":"Standard"} \u2192 ${n.split("/").slice(-2).join("/")}`),console.log("[TCGmizer]   Request body:",JSON.stringify(s));try{let i=await fetch(n,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"include",body:JSON.stringify(s)}),o=await i.text().catch(()=>"");if(console.log(`[TCGmizer]   Response ${i.status}: ${o.substring(0,500)}`),!i.ok){let c=null;try{c=JSON.parse(o)?.errors?.[0]?.code||null}catch{}return{success:!1,error:`HTTP ${i.status}: ${o.substring(0,200)}`,errorCode:c}}try{let c=JSON.parse(o);if(c?.errors&&c.errors.length>0){let d=c.errors[0]?.code||"";return{success:!1,error:`API error: ${c.errors[0]?.message||""} (${d})`,errorCode:d}}}catch{}return{success:!0}}catch(i){return console.error("[TCGmizer]   Network error:",i),{success:!1,error:i.message,errorCode:null}}}function X(e){switch(e){case"CAPI-4":return"Sold out (no longer available from this seller)";case"CAPI-17":return"Product not found (may have been delisted)";case"CAPI-35":return"Product not available for purchase";default:return`Error: ${e}`}}function I(e){return new Promise(t=>setTimeout(t,e))}var C="tcgmizer-panel";function G(){if(document.getElementById(C))return;let e=document.createElement("div");e.id=C,e.innerHTML=`
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
  `,document.body.appendChild(e);let t=e.querySelector(".tcgmizer-header"),r=!1,n=0,s=0;t.addEventListener("mousedown",i=>{i.target.closest(".tcgmizer-close")||(r=!0,n=i.clientX-e.offsetLeft,s=i.clientY-e.offsetTop,t.style.cursor="grabbing",i.preventDefault())}),document.addEventListener("mousemove",i=>{r&&(e.style.left=i.clientX-n+"px",e.style.top=i.clientY-s+"px",e.style.right="auto")}),document.addEventListener("mouseup",()=>{r&&(r=!1,t.style.cursor="")}),e.querySelector(".tcgmizer-close").addEventListener("click",()=>{e.style.display="none"}),e.querySelector(".tcgmizer-start").addEventListener("click",()=>{typeof e._onStart=="function"&&e._onStart()}),e.querySelector(".tcgmizer-retry").addEventListener("click",()=>{e._hasConfig?(f(e,".tcgmizer-error"),S(e,".tcgmizer-config")):typeof e._onStart=="function"&&e._onStart()})}function R(e){let t=document.getElementById(C);t&&(t._onStart=e)}function q(){let e=document.getElementById(C);e&&(e.style.display="flex")}function v(e,t,r){let n=document.getElementById(C);if(!n)return;f(n,".tcgmizer-idle"),f(n,".tcgmizer-config"),f(n,".tcgmizer-results"),f(n,".tcgmizer-error"),S(n,".tcgmizer-progress"),n.querySelector(".tcgmizer-progress-text").textContent=e||"Working...";let s=n.querySelector(".tcgmizer-progress-bar");t!=null&&r!=null&&r>0?s.style.width=`${Math.round(t/r*100)}%`:s.style.width="0%"}function F(e,t){let r=document.getElementById(C);if(!r)return;r._hasConfig=!0,f(r,".tcgmizer-idle"),f(r,".tcgmizer-progress"),f(r,".tcgmizer-results"),f(r,".tcgmizer-error"),S(r,".tcgmizer-config");let n=r.querySelector(".tcgmizer-config"),s=e.languages.map(o=>{let c=o==="English"?"checked":"";return`<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${z(o)}" ${c} /> ${z(o)}
    </label>`}).join(""),i=e.conditions.map(o=>`<label class="tcgmizer-checkbox-label">
      <input type="checkbox" value="${z(o)}" checked /> ${z(o)}
    </label>`).join("");n.innerHTML=`
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
        ${i}
      </div>
      <div class="tcgmizer-select-actions">
        <a href="#" class="tcgmizer-select-all" data-target="cond">Select all</a> \xB7
        <a href="#" class="tcgmizer-select-none" data-target="cond">Select none</a>
      </div>
    </div>

    <div class="tcgmizer-config-section">
      <div class="tcgmizer-config-label">Max Vendors</div>
      <div class="tcgmizer-config-inline">
        <input type="number" class="tcgmizer-input tcgmizer-max-sellers" min="1" placeholder="No limit" />
        <span class="tcgmizer-config-hint">Leave empty for no limit</span>
      </div>
      <label class="tcgmizer-checkbox-label tcgmizer-minimize-vendors-label">
        <input type="checkbox" class="tcgmizer-minimize-vendors" /> Minimize Number of Vendors
      </label>
    </div>

    <div class="tcgmizer-config-section tcgmizer-ban-section">
      <label class="tcgmizer-checkbox-label">
        <input type="checkbox" class="tcgmizer-exclude-banned" checked disabled /> Exclude banned vendors <span class="tcgmizer-ban-count-label">(loading...)</span>
      </label>
    </div>

    <div class="tcgmizer-config-actions">
      <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-run-solver">Run Optimizer</button>
      <button class="tcgmizer-btn tcgmizer-refetch">Re-fetch Listings</button>
    </div>
  `,chrome.storage.sync.get("bannedSellers",o=>{let c=o.bannedSellers||[],d=n.querySelector(".tcgmizer-exclude-banned"),a=n.querySelector(".tcgmizer-ban-count-label");c.length===0?(d.checked=!1,d.disabled=!0,a.textContent="(none banned)"):(d.disabled=!1,d.checked=!0,a.textContent=`(${c.length} banned)`),d._bannedKeys=c.map(g=>g.sellerKey)}),n.querySelectorAll(".tcgmizer-select-all").forEach(o=>{o.addEventListener("click",c=>{c.preventDefault();let d=o.dataset.target;n.querySelectorAll(`.tcgmizer-${d}-options input[type="checkbox"]`).forEach(a=>a.checked=!0)})}),n.querySelectorAll(".tcgmizer-select-none").forEach(o=>{o.addEventListener("click",c=>{c.preventDefault();let d=o.dataset.target;n.querySelectorAll(`.tcgmizer-${d}-options input[type="checkbox"]`).forEach(a=>a.checked=!1)})}),n.querySelector(".tcgmizer-run-solver").addEventListener("click",()=>{let o=[...n.querySelectorAll(".tcgmizer-lang-options input:checked")].map(p=>p.value),c=[...n.querySelectorAll(".tcgmizer-cond-options input:checked")].map(p=>p.value),d=n.querySelector(".tcgmizer-max-sellers").value,a=d?parseInt(d,10):null,g=n.querySelector(".tcgmizer-minimize-vendors").checked,h=n.querySelector(".tcgmizer-exact-printings").checked,l=n.querySelector(".tcgmizer-exclude-banned"),m=l.checked&&l._bannedKeys?l._bannedKeys:[];if(o.length===0){alert("Please select at least one language.");return}if(c.length===0){alert("Please select at least one condition.");return}let u={languages:o.length===e.languages.length?[]:o,conditions:c.length===e.conditions.length?[]:c,maxSellers:a&&a>0?a:null,minimizeVendors:g,exactPrintings:h,bannedSellerKeys:m};typeof t=="function"&&t(u)}),n.querySelector(".tcgmizer-refetch").addEventListener("click",()=>{typeof r._onStart=="function"&&r._onStart()})}function M(e,t){let r=document.getElementById(C);if(!r)return;f(r,".tcgmizer-idle"),f(r,".tcgmizer-progress"),f(r,".tcgmizer-config"),f(r,".tcgmizer-error"),S(r,".tcgmizer-results");let n=r.querySelector(".tcgmizer-results");if(!e.success){n.innerHTML=`
      <div class="tcgmizer-result-error">
        <p>Optimization failed: ${z(e.error)}</p>
      </div>
    `;return}let s=e.savings>0?"tcgmizer-savings-positive":"tcgmizer-savings-neutral",i=e.savings>0?`Save $${e.savings.toFixed(2)}!`:e.savings===0?"Same price (but possibly fewer packages)":`$${Math.abs(e.savings).toFixed(2)} more (current cart is already optimal)`,o="";for(let c of e.sellers)o+=K(c,!0);n.innerHTML=`
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
        <span>${i}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>${e.itemCount} items from ${e.sellerCount} seller${e.sellerCount!==1?"s":""}</span>
      </div>
    </div>
    <div class="tcgmizer-actions">
      <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-apply">Apply to Cart</button>
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
    <div class="tcgmizer-sellers-list">${o}</div>
  `,n.querySelector(".tcgmizer-apply").addEventListener("click",()=>{confirm("This will replace your current TCGPlayer cart with the optimized selections. This cannot be undone! Continue?")&&typeof t=="function"&&t(e)}),n.querySelector(".tcgmizer-back-to-config").addEventListener("click",()=>{f(r,".tcgmizer-results"),S(r,".tcgmizer-config")})}function D(e,t){let r=document.getElementById(C);if(!r)return;f(r,".tcgmizer-idle"),f(r,".tcgmizer-progress"),f(r,".tcgmizer-config"),f(r,".tcgmizer-error"),S(r,".tcgmizer-results");let n=r.querySelector(".tcgmizer-results");if(!e||e.length===0){n.innerHTML=`
      <div class="tcgmizer-result-error">
        <p>No feasible solutions found.</p>
      </div>
    `;return}let s=e[e.length-1],i="";for(let a=0;a<e.length;a++){let g=e[a],h=g.totalCost-s.totalCost,l=h>.005?`+$${h.toFixed(2)}`:"Cheapest",m=h>.005?"":"tcgmizer-cheapest-tag",u="";for(let p of g.sellers)u+=K(p,!1);i+=`
      <div class="tcgmizer-compare-row" data-index="${a}">
        <div class="tcgmizer-compare-row-summary">
          <span class="tcgmizer-compare-vendors">${g.sellerCount} vendor${g.sellerCount!==1?"s":""}</span>
          <span class="tcgmizer-compare-price">$${g.totalCost.toFixed(2)}</span>
          <span class="tcgmizer-compare-extra ${m}">${l}</span>
          <button class="tcgmizer-btn tcgmizer-btn-primary tcgmizer-compare-apply">Apply</button>
          <span class="tcgmizer-compare-toggle">\u25B6</span>
        </div>
        <div class="tcgmizer-compare-detail" style="display:none">
          <div class="tcgmizer-summary-row tcgmizer-summary-detail" style="margin-bottom:8px">
            Items: $${g.totalItemCost.toFixed(2)} \xB7 Shipping: $${g.totalShipping.toFixed(2)}
          </div>
          <div class="tcgmizer-sellers-list">${u}</div>
        </div>
      </div>
    `}let o=e[0].currentCartTotal,c=o-s.totalCost,d=c>0?`Best savings: $${c.toFixed(2)}`:"Current cart is already near optimal";n.innerHTML=`
    <div class="tcgmizer-summary">
      <div class="tcgmizer-summary-row">
        <span>Current cart:</span>
        <span>$${o.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-summary-row tcgmizer-savings-positive">
        <span>${d}</span>
      </div>
      <div class="tcgmizer-summary-row">
        <span>Found ${e.length} option${e.length!==1?"s":""} \u2014 click a row to see details</span>
      </div>
    </div>
    <div class="tcgmizer-compare-table">${i}</div>
    <div class="tcgmizer-actions" style="margin-top:12px">
      <button class="tcgmizer-btn tcgmizer-back-to-config">Change Settings</button>
    </div>
  `,n.querySelectorAll(".tcgmizer-compare-row").forEach(a=>{let g=a.querySelector(".tcgmizer-compare-row-summary"),h=a.querySelector(".tcgmizer-compare-detail"),l=a.querySelector(".tcgmizer-compare-toggle");g.addEventListener("click",m=>{if(m.target.closest(".tcgmizer-compare-apply"))return;let u=h.style.display!=="none";h.style.display=u?"none":"block",l.textContent=u?"\u25B6":"\u25BC",a.classList.toggle("tcgmizer-compare-row-expanded",!u)})}),n.querySelectorAll(".tcgmizer-compare-apply").forEach(a=>{a.addEventListener("click",g=>{let h=parseInt(g.target.closest(".tcgmizer-compare-row").dataset.index,10),l=e[h];confirm(`Apply cart with ${l.sellerCount} vendor${l.sellerCount!==1?"s":""} ($${l.totalCost.toFixed(2)})? This will replace your current TCGPlayer cart. This cannot be undone!`)&&typeof t=="function"&&t(l)})}),n.querySelector(".tcgmizer-back-to-config").addEventListener("click",()=>{f(r,".tcgmizer-results"),S(r,".tcgmizer-config")})}function b(e){let t=document.getElementById(C);t&&(f(t,".tcgmizer-idle"),f(t,".tcgmizer-progress"),f(t,".tcgmizer-config"),f(t,".tcgmizer-results"),S(t,".tcgmizer-error"),t.querySelector(".tcgmizer-error-text").textContent=e)}function S(e,t){let r=e.querySelector(t);r&&(r.style.display="block")}function f(e,t){let r=e.querySelector(t);r&&(r.style.display="none")}function z(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}var Q={"Near Mint":"NM","Lightly Played":"LP","Moderately Played":"MP","Heavily Played":"HP",Damaged:"DMG",Mint:"M","Near Mint Foil":"NM-F","Lightly Played Foil":"LP-F","Moderately Played Foil":"MP-F","Heavily Played Foil":"HP-F","Damaged Foil":"DMG-F"};function ee(e){return e?Q[e]||e:""}function K(e,t){let r=te(e.items),n=re(r,t),s=e.freeShipping?'<span class="tcgmizer-free-shipping">FREE shipping</span>':`Shipping: $${e.shippingCost.toFixed(2)}`,i=e.isDirect?" tcgmizer-seller-direct":"",o=e.isDirect?`<img src="https://mp-assets.tcgplayer.com/img/direct-icon-new.svg" alt="Direct" style="height:14px;vertical-align:middle;margin-right:4px" />${z(e.sellerName)}`:z(e.sellerName);return`
    <div class="tcgmizer-seller${i}">
      <div class="tcgmizer-seller-header">
        <span class="tcgmizer-seller-name">${o}</span>
        <span class="tcgmizer-seller-total">$${e.sellerTotal.toFixed(2)}</span>
      </div>
      <div class="tcgmizer-seller-meta">
        ${e.items.length} item${e.items.length!==1?"s":""} \xB7 
        Subtotal: $${e.subtotal.toFixed(2)} \xB7 ${s}
      </div>
      <div class="tcgmizer-seller-items">${n}</div>
    </div>
  `}function te(e){let t=[],r=new Map;for(let n of e){let s=`${n.productId}|${n.condition}|${n.language}|${n.price}|${n.productConditionId}`;r.has(s)?t[r.get(s)].qty+=1:(r.set(s,t.length),t.push({item:n,qty:1}))}return t}function re(e,t){return e.map(({item:r,qty:n})=>{let s=t&&r.printingChanged?` <span class="tcgmizer-changed" title="Different printing (originally ${z(O(r.originalSetName)||"unknown set")})">\u{1F500}</span>`:"",i=n>1?`<span class="tcgmizer-item-qty">${n}\xD7</span> `:"",o=[ee(r.condition),O(r.setName),r.language].filter(Boolean).join(" \xB7 "),c=`https://tcgplayer-cdn.tcgplayer.com/product/${r.productId}_200w.jpg`,d=n>1?`$${r.price.toFixed(2)} ea`:`$${r.price.toFixed(2)}`;return`
      <div class="tcgmizer-item">
        <img class="tcgmizer-item-img" src="${c}" alt="${z(r.cardName)}" loading="lazy" />
        <div class="tcgmizer-item-info">
          <span class="tcgmizer-item-name">${i}${z(r.cardName)}${s}</span>
          <span class="tcgmizer-item-details">${z(o)}</span>
        </div>
        <span class="tcgmizer-item-price">${d}</span>
      </div>
    `}).join("")}function O(e){if(!e)return"";let t=e.split(",").map(i=>i.trim());if(t.length<=1)return e;let r=["Magic: The Gathering","Pokemon","Yu-Gi-Oh","Yu-Gi-Oh!","Flesh and Blood","Lorcana","One Piece Card Game","Dragon Ball Super Card Game","Digimon Card Game","MetaZoo","Final Fantasy","Cardfight!! Vanguard","Weiss Schwarz","Star Wars: Unlimited"],n=new Set(r.map(i=>i.toLowerCase()));return t.filter(i=>!(n.has(i.toLowerCase())||/^[A-Z]$/.test(i)||/^\d+$/.test(i))).join(", ")||t[0]}window.__tcgmizerContentLoaded?console.log("[TCGmizer] Content script already loaded, skipping duplicate injection."):(window.__tcgmizerContentLoaded=!0,ne());function ne(){G(),e(),R(()=>{t()});function e(){let s="tcgmizer-cart-btn";function i(){if(document.getElementById(s))return!0;let o=document.querySelector(".optimize-btn-block");if(!o)return!1;let c=document.createElement("div"),d=getComputedStyle(o);c.style.cssText=`
      padding: ${d.padding};
      margin-top: 12px;
      background: ${d.background};
      border: ${d.border};
      border-radius: ${d.borderRadius};
      box-shadow: ${d.boxShadow};
    `;let a=document.createElement("button");return a.id=s,a.type="button",a.textContent="\u26A1 Optimize with TCGmizer",a.style.cssText=`
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
    `,a.addEventListener("mouseenter",()=>{a.style.background="#258a50"}),a.addEventListener("mouseleave",()=>{a.style.background="#2e9e5e"}),a.addEventListener("click",()=>{q(),t()}),c.appendChild(a),o.insertAdjacentElement("afterend",c),!0}if(!i()){let o=new MutationObserver(()=>{i()&&o.disconnect()});o.observe(document.body,{childList:!0,subtree:!0})}}function t(){v("Reading cart...",null,null);let s;try{s=w()}catch(i){b(`Error reading cart: ${i.message}`),console.error("[TCGmizer] Cart read error:",i);return}if(!s.cartItems||s.cartItems.length===0){let i=document.querySelector("main"),o=i?i.querySelectorAll("article").length:0,c=document.querySelectorAll('a[href*="/product/"]').length,d=document.querySelectorAll("li").length;b(`Could not read cart items. Debug: main=${!!i}, articles=${o}, productLinks=${c}, li=${d}. Make sure you have items in your cart.`);return}P(s.cartItems),console.log(`[TCGmizer] Read ${s.cartItems.length} items from cart, total: $${s.currentCartTotal}`),chrome.runtime.sendMessage({type:$.START_OPTIMIZATION,cartData:s},i=>{if(chrome.runtime.lastError){b(`Failed to start: ${chrome.runtime.lastError.message}`);return}i?.error&&b(i.error)})}function r(s){v("Optimizing...",null,null),chrome.runtime.sendMessage({type:$.SOLVE_WITH_CONFIG,config:s},i=>{if(chrome.runtime.lastError){b(`Failed to start solver: ${chrome.runtime.lastError.message}`);return}i?.error&&b(i.error)})}chrome.runtime.onMessage.addListener((s,i,o)=>{switch(s.type){case"PING":return o({ok:!0}),!1;case $.TOGGLE_PANEL:{let c=document.getElementById("tcgmizer-panel");c&&(c.style.display==="none"||c.style.display===""?(c.style.display="flex",t()):c.style.display="none"),o({ok:!0});break}case $.OPTIMIZATION_PROGRESS:v(s.message||`${s.stage}...`,s.current,s.total);break;case $.LISTINGS_READY:F(s.options,r);break;case $.OPTIMIZATION_RESULT:M(s.result,n);break;case $.OPTIMIZATION_MULTI_RESULT:D(s.results,n);break;case $.OPTIMIZATION_ERROR:b(s.error||"An unknown error occurred.");break}return!1});async function n(s){v("Applying optimized cart...",null,null);let i=await A(s);if(!i.success){b(`Failed to apply cart: ${i.error}`);return}if(i.partial){let o=i.totalCount-i.failCount,c=i.fallbackCount||0,d="";if(c>0){d+=`${c} item(s) were sold out and replaced with the next-cheapest listing:
`;for(let a of i.fallbackItems||[])d+=`  \u2022 ${a.cardName}: $${a.originalPrice} \u2192 $${a.fallbackPrice} (${a.fallbackSellerName})
`;d+=`
You may want to re-optimize your cart to find a better overall price.

`}if(i.failCount>0){d+=`${i.failCount} item(s) could not be added:
`;for(let a of i.failedItems){let g=a.setName?` (${a.setName})`:"";d+=`  \u2022 ${a.cardName}${g}: ${a.reason}
`}d+=`
You may need to add the missing items manually.
`}d+=`
Added ${o} of ${i.totalCount} items. The page will reload.`,alert(d)}window.location.reload()}console.log("[TCGmizer] Content script loaded on cart page.")}})();
//# sourceMappingURL=content.js.map
