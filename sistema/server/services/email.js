const nodemailer = require("nodemailer");

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_APP_PASSWORD = process.env.EMAIL_APP_PASSWORD;

const HABILITADO = Boolean(EMAIL_USER && EMAIL_APP_PASSWORD);

let transportador = null;
if (HABILITADO) {
  transportador = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_APP_PASSWORD },
  });
}

function estaHabilitado() {
  return HABILITADO;
}

/** Manda el codigo de recuperacion de contraseña del dashboard por email. */
async function enviarCodigoRecuperacion(destinatario, codigo, duracionMinutos) {
  if (!HABILITADO) {
    throw new Error("El envio de emails no esta configurado (faltan EMAIL_USER o EMAIL_APP_PASSWORD).");
  }

  await transportador.sendMail({
    from: `"FotoFace" <${EMAIL_USER}>`,
    to: destinatario,
    subject: "Código para recuperar tu contraseña - FotoFace",
    text: `Tu código para recuperar la contraseña del dashboard es: ${codigo}\n\nEs válido por ${duracionMinutos} minutos. Si no lo pediste tú, puedes ignorar este mensaje.`,
    html: `<p>Tu código para recuperar la contraseña del dashboard es:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px;">${codigo}</p><p>Es válido por ${duracionMinutos} minutos. Si no lo pediste tú, puedes ignorar este mensaje.</p>`,
  });
}

module.exports = { estaHabilitado, enviarCodigoRecuperacion };
