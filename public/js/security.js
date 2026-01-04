$("#btnPw").on("click", async ()=>{
  const oldPassword=$("#oldPw").val();
  const newPassword=$("#newPw").val();
  const r = await $.ajax({ url:"/api/security/change-password", method:"POST", contentType:"application/json", data: JSON.stringify({ oldPassword, newPassword })});
  if(!r.ok) return toastr.error(r.msg);
  toastr.success(r.msg);
  $("#oldPw,#newPw").val("");
});

$("#btnPinSet").on("click", async ()=>{
  const pin=$("#setPin").val().trim();
  const r = await $.ajax({ url:"/api/security/set-pin", method:"POST", contentType:"application/json", data: JSON.stringify({ pin })});
  if(!r.ok) return toastr.error(r.msg);
  toastr.success(r.msg);
  location.reload();
});

$("#btnPinChange").on("click", async ()=>{
  const currentPin=$("#curPin").val().trim();
  const newPin=$("#newPin").val().trim();
  const r = await $.ajax({ url:"/api/security/change-pin", method:"POST", contentType:"application/json", data: JSON.stringify({ currentPin, newPin })});
  if(!r.ok) return toastr.error(r.msg);
  toastr.success(r.msg);
  $("#curPin,#newPin").val("");
});
