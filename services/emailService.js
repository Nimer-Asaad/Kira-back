const nodemailer = require("nodemailer");

// Create transporter using HR email
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.HR_EMAIL || "hr@company.com",
    pass: process.env.HR_EMAIL_PASSWORD || "", // App password for Gmail
  },
});

/**
 * Send trainee login credentials via email
 * @param {string} toEmail - Trainee email
 * @param {string} fullName - Trainee full name
 * @param {string} tempPassword - Temporary password
 * @param {string} appUrl - Application URL (e.g., http://localhost:5173)
 */
async function sendTraineeCredentials(toEmail, fullName, tempPassword, appUrl = "http://localhost:5173") {
  try {
    const loginUrl = `${appUrl}/login`;
    const safePassword = tempPassword || "123456";
    const passwordLineHtml = `<p><span class="label">كلمة المرور المؤقتة:</span><br><span class="value">${safePassword}</span></p>`;
    const passwordLineText = `كلمة المرور المؤقتة: ${safePassword}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; direction: rtl; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
          .card { background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #333; margin: 0; }
          .content { color: #555; line-height: 1.6; }
          .credentials { background-color: #f0f4ff; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #2563eb; }
          .credentials p { margin: 10px 0; font-size: 14px; }
          .label { font-weight: bold; color: #333; }
          .value { color: #2563eb; font-family: monospace; font-weight: bold; }
          .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; border-top: 1px solid #e5e5e5; padding-top: 20px; }
          .warning { background-color: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0; border-right: 4px solid #ffc107; }
          .warning p { margin: 5px 0; color: #856404; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>تم قبولك في تدريب شركة Kira</h1>
            </div>
            
            <div class="content">
              <p>السلام عليكم ورحمة الله وبركاته</p>
              <p>أهلاً وسهلاً <strong>${fullName}</strong>،</p>
              <p>نبارك لك قبولك في برنامج التدريب لدى شركة Kira. تم تجهيز حسابك على منصة التدريب، ويمكنك تسجيل الدخول بالبيانات التالية:</p>
              
              <div class="credentials">
                <p><span class="label">البريد الإلكتروني:</span><br><span class="value">${toEmail}</span></p>
                ${passwordLineHtml}
              </div>
              
              <center>
                <a href="${loginUrl}" class="button">دخول المنصة</a>
              </center>
              
              <div class="warning">
                <p><strong>⚠️ تنبيه أمان:</strong></p>
                <p>• تغيير كلمة المرور بعد أول دخول مباشرة</p>
                <p>• عدم مشاركة كلمة المرور مع أحد</p>
              </div>
              
              <p>إذا واجهت أي مشاكل في الدخول، يرجى التواصل مع فريق الموارد البشرية.</p>
              
              <p>بالتوفيق،<br>فريق الموارد البشرية</p>
            </div>
            
            <div class="footer">
              <p>هذا البريد تم إرساله تلقائياً، يرجى عدم الرد عليه</p>
              <p>${new Date().toLocaleDateString('ar-SA')}</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await transporter.sendMail({
      from: process.env.HR_EMAIL || "hr@company.com",
      to: toEmail,
      subject: `تم قبولك في تدريب شركة Kira - بيانات الدخول`,
      html: htmlContent,
      text: `تم قبولك في برنامج التدريب لدى شركة Kira
البريد الإلكتروني: ${toEmail}
${passwordLineText}
رابط الدخول: ${loginUrl}`,
    });

    console.log("Email sent successfully:", result.messageId);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error.message };
  }
}

async function sendTrainingSubmittedEmail(toEmail, fullName) {
  try {
    const html = `<p>Hello ${fullName},</p><p>Your training submission is complete. We will contact you if we need anything else.</p>`;
    await transporter.sendMail({
      from: process.env.HR_EMAIL || "hr@company.com",
      to: toEmail,
      subject: "Training Submitted",
      html,
      text: `Hello ${fullName}, Your training submission is complete.`,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function sendHiringEmail(toEmail, fullName) {
  try {
    const html = `<p>Congratulations ${fullName},</p><p>You have been hired. Our team will follow up shortly.</p>`;
    await transporter.sendMail({
      from: process.env.HR_EMAIL || "hr@company.com",
      to: toEmail,
      subject: "You're Hired",
      html,
      text: `Congratulations ${fullName}, you have been hired.`,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = { sendTraineeCredentials, sendTrainingSubmittedEmail, sendHiringEmail };
