(() => {
  const socket = io();
  socket.on("wa:status", d => $("#waStatus").text(JSON.stringify(d)));
  socket.on("wa:qr", async ({ qr }) => {
    $("#qrBox").html("<canvas id='qrCanvas'></canvas>");
    await QRCode.toCanvas(document.getElementById("qrCanvas"), qr, { width: 280 });
  });
})();
