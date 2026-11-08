// Maestro script (runs on the test machine): waits for the SMS code sent to PHONE.
var otp = null;
for (var i = 0; i < 40 && !otp; i++) {
  var r = http.get('http://127.0.0.1:18099/otp?phone=' + encodeURIComponent(PHONE));
  otp = json(r.body).otp;
}
if (!otp) throw new Error('no SMS code for ' + PHONE);
output.otp = otp;
output.d = otp.split('');
