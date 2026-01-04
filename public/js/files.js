function fmtBytes(b){
  const u=["B","KB","MB","GB","TB"];
  let i=0; let n=Number(b||0);
  while(n>=1024 && i<u.length-1){ n/=1024; i++; }
  return `${n.toFixed(i?2:0)} ${u[i]}`;
}

async function loadFiles(){
  const pin = $("#pin").val().trim();
  const r = await $.get("/api/files/list");
  if(!r.ok) return toastr.error("Gagal load list");

  if(!pin){
    $("#list").html(`<div class="text-slate-300">Masukkan PIN lalu klik Load.</div>`);
    return;
  }

  const items=[];
  for(const f of r.data){
    let name="(PIN salah)";
    let mime="application/octet-stream";
    try{
      name = await PCrypto.decryptText(PCrypto.b64ToU8(f.nameEnc), pin);
      mime = await PCrypto.decryptText(PCrypto.b64ToU8(f.mimeEnc), pin);
    } catch {}
    items.push({ ...f, name, mime });
  }

  $("#list").html(items.map(f => `
    <div class="card rounded-xl p-3 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <div class="font-semibold truncate">${escapeHtml(f.name)}</div>
        <div class="text-xs text-slate-300">${fmtBytes(f.blob_size)} • ${new Date(f.created_at).toLocaleString()} • ${escapeHtml(f.mime)}</div>
      </div>
      <div class="flex gap-2 shrink-0">
        <button class="btnPrev rounded-xl bg-slate-800 hover:bg-slate-700 px-3 py-2" data-id="${f.id}" data-name="${encodeURIComponent(f.name)}" data-mime="${encodeURIComponent(f.mime)}">
          <i class="ri-image-line"></i>
        </button>
        <button class="btnDl rounded-xl bg-sky-600 hover:bg-sky-500 px-3 py-2" data-id="${f.id}" data-name="${encodeURIComponent(f.name)}" data-mime="${encodeURIComponent(f.mime)}">
          <i class="ri-download-2-line"></i>
        </button>
        <button class="btnLink rounded-xl bg-amber-600 hover:bg-amber-500 px-3 py-2" data-id="${f.id}">
          <i class="ri-link"></i>
        </button>
        <button class="btnDel rounded-xl bg-rose-600 hover:bg-rose-500 px-3 py-2" data-id="${f.id}">
          <i class="ri-delete-bin-6-line"></i>
        </button>
      </div>
    </div>
  `).join(""));
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

$("#btnLoad").on("click", loadFiles);

$("#btnSetPin").on("click", async ()=>{
  const pin=$("#pinSet").val().trim();
  const r = await $.ajax({ url:"/api/security/set-pin", method:"POST", contentType:"application/json", data: JSON.stringify({ pin })});
  if(!r.ok) return toastr.error(r.msg);
  toastr.success(r.msg);
  location.reload();
});

$("#btnUpload").on("click", async ()=>{
  const pin=$("#pin").val().trim();
  const file=$("#file")[0].files[0];
  if(!pin) return toastr.warning("Masukkan PIN");
  if(!file) return toastr.warning("Pilih file");

  const encBlob = await PCrypto.encryptFile(file, pin);
  const nameEnc = await PCrypto.encryptText(file.name, pin);
  const mimeEnc = await PCrypto.encryptText(file.type || "application/octet-stream", pin);

  const fd = new FormData();
  fd.append("encfile", encBlob, "blob.bin");
  fd.append("nameEnc", PCrypto.u8ToB64(nameEnc));
  fd.append("mimeEnc", PCrypto.u8ToB64(mimeEnc));

  const r = await $.ajax({ url:"/api/files/upload", method:"POST", data:fd, processData:false, contentType:false });
  if(!r.ok) return toastr.error(r.msg);
  toastr.success(r.msg);
  $("#file").val("");
  await loadFiles();
});

$(document).on("click",".btnDel", async function(){
  const id=$(this).data("id");
  const r = await $.ajax({ url:`/api/files/${id}`, method:"DELETE" });
  if(!r.ok) return toastr.error(r.msg);
  toastr.success(r.msg);
  await loadFiles();
});

$(document).on("click",".btnLink", async function(){
  const id=$(this).data("id");
  const r = await $.post(`/api/files/link/${id}`);
  if(!r.ok) return toastr.error(r.msg);
  await navigator.clipboard.writeText(r.url).catch(()=>{});
  toastr.success("Link disalin ✅");
});

$("#btnLinkAll").on("click", async ()=>{
  const r = await $.post("/api/files/link-all");
  if(!r.ok) return toastr.error(r.msg);
  await navigator.clipboard.writeText(r.url).catch(()=>{});
  toastr.success("Link Download All disalin ✅");
});

// Download plaintext
$(document).on("click",".btnDl", async function(){
  const id=$(this).data("id");
  const pin=$("#pin").val().trim();
  const name=decodeURIComponent($(this).data("name"));
  const mime=decodeURIComponent($(this).data("mime"));
  if(!pin) return toastr.warning("Masukkan PIN");

  const res = await fetch(`/api/files/raw/${id}`);
  if(!res.ok) return toastr.error("Gagal ambil data");
  const encBlob = await res.blob();

  let plain;
  try { plain = await PCrypto.decryptToBlob(encBlob, pin, mime); }
  catch { return toastr.error("PIN salah / data rusak"); }

  const a=document.createElement("a");
  a.href=URL.createObjectURL(plain);
  a.download=name;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Preview (image only)
$(document).on("click",".btnPrev", async function(){
  const id=$(this).data("id");
  const pin=$("#pin").val().trim();
  const name=decodeURIComponent($(this).data("name"));
  const mime=decodeURIComponent($(this).data("mime"));
  if(!pin) return toastr.warning("Masukkan PIN");

  const res = await fetch(`/api/files/raw/${id}`);
  if(!res.ok) return toastr.error("Gagal ambil data");
  const encBlob = await res.blob();

  let plain;
  try { plain = await PCrypto.decryptToBlob(encBlob, pin, mime); }
  catch { return toastr.error("PIN salah / data rusak"); }

  $("#previewBox").removeClass("hidden");
  $("#previewInfo").text(`${name} • ${mime}`);

  if(mime.startsWith("image/")){
    const url=URL.createObjectURL(plain);
    $("#previewImg").attr("src",url).removeClass("hidden");
  } else {
    $("#previewImg").addClass("hidden");
    toastr.info("Preview hanya untuk image");
  }
});
