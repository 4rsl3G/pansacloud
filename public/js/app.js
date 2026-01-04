toastr.options = { positionClass:"toast-bottom-right", timeOut:2000 };

function pcShow(){ $("#pcOverlay").removeClass("hidden"); }
function pcHide(){ $("#pcOverlay").addClass("hidden"); }

// DETEKSI HALAMAN AUTH (login/register)
const isAuthPage = location.pathname === "/login" || location.pathname === "/register";

async function pcNav(url, push=true){
  if(!isAuthPage) pcShow();
  try{
    const html = await $.ajax({ url, method:"GET", headers:{ "X-PANSACLOUD-NAV":"1" }});
    $("#appMain").html(html);
    if(push) history.pushState({ url }, "", url);
  } catch {
    toastr.error("Gagal memuat halaman");
  } finally {
    if(!isAuthPage) pcHide();
  }
}

$(document).on("click","a[data-nav='1']",function(e){
  const href=$(this).attr("href");
  if(!href || href.startsWith("http")) return;
  e.preventDefault();
  pcNav(href, true);
});

window.addEventListener("popstate",(e)=>{
  const url = (e.state && e.state.url) ? e.state.url : location.pathname;
  pcNav(url, false);
});

// overlay untuk semua AJAX (DISABLE DI AUTH PAGE)
let ajaxCount=0;

$(document).ajaxStart((evt, xhr, settings)=>{
  if (isAuthPage) return; // <<< penting
  ajaxCount++;
  pcShow();
});

$(document).ajaxStop(()=>{
  if (isAuthPage) return; // <<< penting
  ajaxCount=Math.max(0,ajaxCount-1);
  if(ajaxCount===0) pcHide();
});

// tambahan safety: kalau ada ajax error, paksa hide (biar ga nyangkut)
$(document).ajaxError(()=>{
  if (isAuthPage) return;
  ajaxCount = 0;
  pcHide();
});
