function fmtBytes(b){
  const u=["B","KB","MB","GB","TB"];
  let i=0; let n=Number(b||0);
  while(n>=1024 && i<u.length-1){ n/=1024; i++; }
  return `${n.toFixed(i?2:0)} ${u[i]}`;
}
(async ()=>{
  const r = await $.get("/api/dashboard/stats");
  if(!r.ok) return toastr.error("Gagal load stats");
  $("#stFiles").text(r.totalFiles);
  $("#stBytes").text(fmtBytes(r.totalBytes));
  $("#stRecent").html(r.recent.length ? r.recent.map(x=>`#${x.id} • ${fmtBytes(x.blob_size)}`).join("<br>") : "No recent uploads");
})();
