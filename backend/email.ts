const getFetch = () => (typeof fetch !== 'undefined' ? fetch : globalThis.fetch);

interface SendEmailParams {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}

/**
 * Clean device & browser string parser for security notification emails.
 */
export function formatDeviceInfo(ua: string): string {
  if (!ua || ua === 'Web Browser Session' || ua === 'Standard Web Client') {
    return 'Web Browser Session';
  }
  let os = 'Desktop Device';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS (Apple)';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Web Browser';
  if (/edg/i.test(ua)) browser = 'Microsoft Edge';
  else if (/chrome|crios/i.test(ua)) browser = 'Google Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Mozilla Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Apple Safari';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  return `${os} • ${browser}`;
}

/**
 * Single reusable function that sends backend-generated HTML directly
 * through Brevo's Transactional Email REST API.
 */
export async function sendBrevoEmail({ toEmail, toName, subject, htmlContent }: SendEmailParams): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || 'noreply@codesyne.dev';
  const senderName = process.env.BREVO_SENDER_NAME || 'CodeSyne';

  if (!apiKey) {
    console.warn('[BREVO EMAIL SKIPPED] BREVO_API_KEY environment variable is not defined on the server.');
    return { success: false, error: 'BREVO_API_KEY is not configured on the server.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    console.log(`[EMAIL] Dispatching "${subject}" via Brevo REST API to ${toEmail}...`);

    const fetchFn = getFetch();
    const response = await fetchFn('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: [
          {
            email: toEmail,
            name: toName || toEmail.split('@')[0]
          }
        ],
        subject: subject,
        htmlContent: htmlContent
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data: any = await response.json();

    if (response.ok && data.messageId) {
      console.log(`[EMAIL SUCCESS] "${subject}" delivered to ${toEmail}. MessageId: ${data.messageId}`);
      return { success: true, messageId: data.messageId };
    } else {
      console.error('[EMAIL FAILURE] Brevo API error response:', data);
      return { success: false, error: data.message || data.code || 'Failed to send transactional email via Brevo.' };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn('[EMAIL TIMEOUT] Brevo API request timed out after 6000ms.');
      return { success: false, error: 'Brevo API call timed out.' };
    }
    console.error('[EMAIL EXCEPTION] Network exception connecting to Brevo API:', err.message);
    return { success: false, error: err.message || 'Network exception while connecting to Brevo API.' };
  }
}

export function getAppBaseUrl(customBaseUrl?: string): string {
  if (customBaseUrl && typeof customBaseUrl === 'string' && customBaseUrl.trim() !== '') {
    let url = customBaseUrl.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim() !== '') {
    let url = process.env.FRONTEND_URL.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }
  if (process.env.APP_URL && process.env.APP_URL.trim() !== '') {
    let url = process.env.APP_URL.trim();
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
  }
  return 'https://codesyne.vercel.app';
}

/**
 * Returns the centered badge squircle HTML that renders reliably on all email clients (Gmail, Apple Mail, Outlook).
 */
function getIconSquircleHtml(type: string): string {
  let iconContent = '&#128274;'; // 🔒 default lock
  let borderColor = '#8b5cf6';
  let glowColor = 'rgba(139, 92, 246, 0.4)';
  let bg = '#0b1022';
  let iconFontSize = '20px';

  switch (type) {
    case 'lock':
    case 'key':
    case '🔑':
    case '🔒':
      iconContent = '&#128274;'; // 🔒
      borderColor = '#8b5cf6';
      glowColor = 'rgba(139, 92, 246, 0.4)';
      bg = '#0e122b';
      iconFontSize = '20px';
      break;
    case 'verify':
    case 'envelope':
    case '✉️':
      iconContent = '&#9993;&#xFE0E;'; // ✉
      borderColor = '#38bdf8';
      glowColor = 'rgba(56, 189, 248, 0.4)';
      bg = '#08172c';
      iconFontSize = '22px';
      break;
    case 'welcome':
    case 'code':
    case '🚀':
      iconContent = '&lt;/&gt;'; // </>
      borderColor = '#a855f7';
      glowColor = 'rgba(168, 85, 247, 0.4)';
      bg = '#140c26';
      iconFontSize = '17px';
      break;
    case 'security':
    case 'shield':
    case '🛡️':
      iconContent = '&#128737;&#xFE0E;'; // 🛡
      borderColor = '#fb7185';
      glowColor = 'rgba(251, 113, 133, 0.4)';
      bg = '#220c16';
      iconFontSize = '20px';
      break;
    case 'inquiry':
    case 'message':
    case '💬':
    case '📬':
      iconContent = '&#128172;'; // 💬
      borderColor = '#38bdf8';
      glowColor = 'rgba(56, 189, 248, 0.4)';
      bg = '#08172c';
      iconFontSize = '20px';
      break;
  }

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; text-align: center;">
      <tr>
        <td align="center" valign="middle" bgcolor="${bg}" width="44" height="44" style="width: 44px; height: 44px; min-width: 44px; min-height: 44px; background-color: ${bg}; border: 1.5px solid ${borderColor}; border-radius: 12px; text-align: center; vertical-align: middle; box-shadow: 0 0 14px ${glowColor}; padding: 0;">
          <div style="font-family: Consolas, Monaco, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', monospace, sans-serif; font-size: ${iconFontSize}; font-weight: 700; line-height: 44px; height: 44px; color: ${borderColor}; text-align: center; margin: 0 auto;">
            ${iconContent}
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Pixel-Perfect CodeSyne Dark Aesthetic Email Template
 * Matches exact layout, typography, neon code headers, and cyber styling from the reference design.
 * Fully responsive for mobile (Gmail, Outlook, Apple Mail, Android/iOS) and pristine on Desktop.
 */
function buildCodeSyneEmailHtml({
  iconType = 'lock',
  headingHtml,
  subheadingText,
  greetingName,
  messageHtml,
  theoryHtml,
  buttonText,
  buttonUrl,
  buttonIcon = '&#128274;',
  securityNoteHtml,
  altLinkUrl,
  detailsBoxHtml,
}: {
  iconType?: string;
  headingHtml: string;
  subheadingText: string;
  greetingName?: string;
  messageHtml: string;
  theoryHtml?: string;
  buttonText?: string;
  buttonUrl?: string;
  buttonIcon?: string;
  securityNoteHtml?: string;
  altLinkUrl?: string;
  detailsBoxHtml?: string;
}): string {
  const baseUrl = getAppBaseUrl();
  const squircleIcon = getIconSquircleHtml(iconType);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>CodeSyne Notification</title>
  <style type="text/css">
    * {
      box-sizing: border-box !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      min-width: 100% !important;
      background-color: #03050c !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      -webkit-font-smoothing: antialiased;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      color: #f1f5f9;
    }
    table, td {
      border-collapse: collapse !important;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    a {
      text-decoration: none;
    }
    .email-container {
      width: 100% !important;
      max-width: 540px !important;
      margin: 0 auto !important;
    }
    @media only screen and (max-width: 600px) {
      .email-canvas {
        padding: 10px 8px 24px 8px !important;
      }
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 16px !important;
        margin: 0 auto !important;
      }
      .outer-card {
        padding: 16px 12px 10px 12px !important;
      }
      .inner-card {
        padding: 18px 12px 14px 12px !important;
        border-radius: 14px !important;
      }
      .code-side-block {
        display: none !important;
        width: 0% !important;
        max-height: 0px !important;
        overflow: hidden !important;
        mso-hide: all !important;
        font-size: 0px !important;
        line-height: 0 !important;
      }
      .center-brand-cell {
        width: 100% !important;
        display: block !important;
        padding: 0 !important;
      }
      .sub-text-cell {
        font-size: 8px !important;
        letter-spacing: 0.8px !important;
      }
      .heading-title {
        font-size: 18px !important;
        line-height: 1.25 !important;
        letter-spacing: -0.3px !important;
        padding-left: 2px !important;
        padding-right: 2px !important;
      }
      .greeting-text {
        font-size: 13.5px !important;
      }
      .message-body {
        font-size: 12.5px !important;
        line-height: 1.55 !important;
        padding-left: 2px !important;
        padding-right: 2px !important;
        max-width: 100% !important;
      }
      .btn-table-wrapper {
        width: auto !important;
        max-width: 90% !important;
        margin: 0 auto !important;
      }
      .btn-td-cell {
        display: inline-block !important;
        width: auto !important;
      }
      .btn-action {
        display: inline-block !important;
        width: auto !important;
        box-sizing: border-box !important;
        padding: 10px 18px !important;
        font-size: 12.5px !important;
        text-align: center !important;
        border-radius: 8px !important;
        line-height: 1.25 !important;
      }
      .res-table {
        width: 100% !important;
      }
      .res-cell-label {
        width: 36% !important;
        padding: 8px 6px 8px 8px !important;
        font-size: 8.5px !important;
        letter-spacing: 0.4px !important;
      }
      .res-cell-val {
        width: 64% !important;
        padding: 8px 8px 8px 6px !important;
        font-size: 11.5px !important;
      }
      .security-table {
        width: 100% !important;
        max-width: 100% !important;
        padding: 10px 12px !important;
        border-radius: 9px !important;
      }
      .fallback-link-box {
        padding: 7px 9px !important;
        font-size: 9.5px !important;
        line-height: 1.35 !important;
      }
      .footer-links a {
        margin: 2px 6px !important;
        display: inline-block !important;
        font-size: 10.5px !important;
      }
      .footer-desc {
        font-size: 9px !important;
        line-height: 1.4 !important;
        padding: 0 4px !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; width: 100% !important; min-width: 100% !important; background-color: #03050c; color: #f1f5f9;">

  <!-- Outer Canvas Table -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100% !important; min-width: 100% !important; background-color: #03050c; margin: 0; padding: 0;">
    <tr>
      <td class="email-canvas" align="center" style="padding: 20px 10px 32px 10px; text-align: center;">

        <!-- Outer Framing Box (Subtle Cyber Gradient Glow Border) -->
        <table class="email-container" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; max-width: 540px; margin: 0 auto; text-align: center; border: 1px solid #18223c; border-radius: 20px; background-color: #050814; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85); overflow: hidden; box-sizing: border-box;">
          
          <!-- TOP CODE-HEADER HERO SECTION -->
          <tr>
            <td class="outer-card" align="center" style="padding: 20px 18px 12px 18px; text-align: center; background: radial-gradient(ellipse at 50% 0%, rgba(99, 102, 241, 0.16) 0%, rgba(5, 8, 20, 0) 70%);">
              
              <!-- 3-Column Header (Left Code • Center Logo • Right Code) -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  
                  <!-- Left Code Snippet Block with Dotted Matrix Accents -->
                  <td class="code-side-block" align="left" valign="top" width="28%" style="width: 28%; font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 9px; line-height: 1.4; color: #64748b; vertical-align: top; padding-top: 2px;">
                    <div style="font-size: 8px; color: #2e3d5e; letter-spacing: 2px; margin-bottom: 3px; font-weight: 700;">&bull; &bull; &bull; &bull; &bull;</div>
                    <span style="color: #ec4899; font-weight: 700;">function</span> <span style="color: #f8fafc; font-weight: 600;">Coder</span>() {<br />
                    &nbsp;&nbsp;<span style="color: #a855f7; font-weight: 700;">if</span> (<span style="color: #94a3b8;">passion</span>) {<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #34d399; font-weight: 600;">build</span>();<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #f43f5e; font-weight: 700;">return</span> <span style="color: #38bdf8; font-weight: 600;">success</span>;<br />
                    &nbsp;&nbsp;}<br />
                    &nbsp;&nbsp;<span style="color: #f43f5e; font-weight: 700;">return</span> <span style="color: #94a3b8;">progress</span>;<br />
                    }
                  </td>

                  <!-- Center Logo & Branding Block -->
                  <td class="center-brand-cell" align="center" valign="middle" width="44%" style="width: 44%; text-align: center; vertical-align: middle; padding: 0 4px;">
                    <a href="${baseUrl}" target="_blank" style="text-decoration: none; display: inline-block;">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; text-align: center;">
                        <!-- Glowing Neon Logo Square -->
                        <tr>
                          <td align="center" style="padding-bottom: 6px;">
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto;">
                              <tr>
                                <td align="center" valign="middle" bgcolor="#14112e" width="40" height="40" style="width: 40px; height: 40px; min-width: 40px; min-height: 40px; background: linear-gradient(135deg, #181138 0%, #0d1a38 100%); border: 1.5px solid #818cf8; border-radius: 10px; text-align: center; vertical-align: middle; box-shadow: 0 0 14px rgba(129, 140, 248, 0.4); padding: 0;">
                                  <span style="color: #ffffff; font-family: Consolas, Monaco, monospace; font-weight: 900; font-size: 18px; line-height: 40px; display: inline-block;">&lt;/&gt;</span>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <!-- CodeSyne Title -->
                        <tr>
                          <td align="center" style="padding-bottom: 2px;">
                            <div style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.4px; line-height: 1.1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                              Code<span style="color: #c084fc;">Syne</span>
                            </div>
                          </td>
                        </tr>
                        <!-- Subtitle -->
                        <tr>
                          <td align="center">
                            <div style="font-size: 8px; font-weight: 700; color: #94a3b8; font-family: Consolas, Monaco, monospace; letter-spacing: 1.5px; text-transform: uppercase; line-height: 1;">
                              COLLABORATIVE CLOUD IDE
                            </div>
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>

                  <!-- Right Code Snippet Block -->
                  <td class="code-side-block" align="right" valign="top" width="28%" style="width: 28%; font-family: Consolas, Monaco, 'Courier New', monospace; font-size: 9px; line-height: 1.4; color: #64748b; vertical-align: top; text-align: right; padding-top: 2px;">
                    <div style="font-size: 8px; color: #2e3d5e; letter-spacing: 2px; margin-bottom: 3px; font-weight: 700; text-align: right;">&bull; &bull; &bull; &bull; &bull;</div>
                    <span style="color: #60a5fa; font-weight: 700;">const</span> <span style="color: #38bdf8; font-weight: 600;">CodeSyne</span> = {<br />
                    &nbsp;&nbsp;<span style="color: #38bdf8;">collaborate</span>: <span style="color: #ec4899; font-weight: 700;">true</span>,<br />
                    &nbsp;&nbsp;<span style="color: #38bdf8;">code</span>: <span style="color: #34d399;">'together'</span>,<br />
                    &nbsp;&nbsp;<span style="color: #38bdf8;">build</span>: <span style="color: #38bdf8;">'faster'</span>,<br />
                    &nbsp;&nbsp;<span style="color: #38bdf8;">success</span>: <span style="color: #34d399;">'always'</span><br />
                    };
                  </td>

                </tr>
              </table>

              <!-- Neon Curved / Glowing Cyber Wave Divider Bar -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 14px;">
                <tr>
                  <td height="1" bgcolor="#1e293b" style="height: 1px; line-height: 1px; font-size: 1px; background: linear-gradient(90deg, rgba(30, 41, 59, 0) 0%, #6366f1 30%, #a855f7 70%, rgba(30, 41, 59, 0) 100%);">
                    &nbsp;
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- MAIN INNER CARD CONTAINER -->
          <tr>
            <td align="center" style="padding: 0 14px 16px 14px; text-align: center;">
              
              <!-- Elevated Nested Dark Card -->
              <table class="inner-card" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #060918; border: 1px solid #18223c; border-radius: 16px; padding: 22px 20px; text-align: center; box-sizing: border-box;">
                
                <!-- Glowing Icon Squircle Badge -->
                <tr>
                  <td align="center" style="padding-bottom: 12px; text-align: center;">
                    ${squircleIcon}
                  </td>
                </tr>

                <!-- Main Heading -->
                <tr>
                  <td align="center" style="padding-bottom: 5px; text-align: center;">
                    <h1 class="heading-title" style="margin: 0; font-size: 21px; font-weight: 800; color: #ffffff; letter-spacing: -0.3px; line-height: 1.25; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; word-break: break-word;">
                      ${headingHtml}
                    </h1>
                  </td>
                </tr>

                <!-- Subtitle with Clean Cyber Accents (Never renders broken blocks) -->
                <tr>
                  <td align="center" style="padding-bottom: 14px; text-align: center;">
                    <div class="sub-text-cell" style="font-size: 9px; font-weight: 800; color: #a855f7; font-family: Consolas, Monaco, monospace; letter-spacing: 1.2px; text-transform: uppercase; text-align: center; margin: 0 auto; line-height: 1.2;">
                      <span style="color: #6366f1; opacity: 0.7;">//</span>&nbsp;&nbsp;${subheadingText}&nbsp;&nbsp;<span style="color: #6366f1; opacity: 0.7;">//</span>
                    </div>
                  </td>
                </tr>

                <!-- Greeting Line if Provided -->
                ${greetingName ? `
                <tr>
                  <td align="center" style="padding-bottom: 6px; text-align: center;">
                    <div class="greeting-text" style="font-size: 14px; font-weight: 600; color: #ffffff; text-align: center;">
                      Hi <span style="color: #c084fc; font-weight: 700;">${greetingName}</span>,
                    </div>
                  </td>
                </tr>
                ` : ''}

                <!-- Main Message Paragraph -->
                <tr>
                  <td align="center" style="padding-bottom: 15px; text-align: center;">
                    <div class="message-body" style="font-size: 13px; line-height: 1.6; color: #94a3b8; max-width: 420px; margin: 0 auto; text-align: center; word-break: break-word;">
                      ${messageHtml}
                    </div>
                  </td>
                </tr>

                <!-- Details / Metadata Table if Provided -->
                ${detailsBoxHtml ? `
                <tr>
                  <td align="center" style="padding-bottom: 15px; text-align: center;">
                    ${detailsBoxHtml}
                  </td>
                </tr>
                ` : ''}

                <!-- Rich Theory Box if Provided -->
                ${theoryHtml ? `
                <tr>
                  <td align="center" style="padding-bottom: 15px; text-align: center;">
                    ${theoryHtml}
                  </td>
                </tr>
                ` : ''}

                <!-- Compact Glowing CTA Button -->
                ${buttonUrl && buttonText ? `
                <tr>
                  <td align="center" style="padding-bottom: 15px; text-align: center;">
                    <table class="btn-table-wrapper" role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; text-align: center;">
                      <tr>
                        <td class="btn-td-cell" align="center" bgcolor="#7c3aed" style="background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); border-radius: 9px; text-align: center; box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35); padding: 0;">
                          <a href="${buttonUrl}" target="_blank" class="btn-action" style="display: inline-block; padding: 11px 22px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 9px; text-align: center; line-height: 1.25; letter-spacing: 0.2px; white-space: nowrap;">
                            <span style="font-size: 12px; margin-right: 5px; display: inline-block; vertical-align: middle;">${buttonIcon}</span>
                            <span style="display: inline-block; vertical-align: middle;">${buttonText}</span>
                            <span style="font-size: 12px; margin-left: 5px; display: inline-block; vertical-align: middle;">&rarr;</span>
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}

                <!-- Security Notice Box (Clean & Centered) -->
                ${securityNoteHtml ? `
                <tr>
                  <td align="center" style="padding-bottom: 13px; text-align: center;">
                    <table class="security-table" role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" width="100%" style="width: 100%; max-width: 410px; margin: 0 auto; background-color: #050a19; border: 1px solid #162440; border-radius: 10px; padding: 10px 14px; text-align: center; box-sizing: border-box;">
                      <tr>
                        <td align="center" style="text-align: center; padding-bottom: 4px;">
                          <span style="font-size: 13px; color: #c084fc; vertical-align: middle; margin-right: 4px;">&#128737;&#xFE0E;</span>
                          <span style="font-size: 10px; font-weight: 700; color: #c084fc; font-family: Consolas, Monaco, monospace; letter-spacing: 0.8px; text-transform: uppercase; vertical-align: middle;">Security Notice</span>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="text-align: center;">
                          <div style="font-size: 11px; color: #94a3b8; line-height: 1.5; max-width: 370px; margin: 0 auto; text-align: center; word-break: break-word;">
                            ${securityNoteHtml}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ` : ''}

                <!-- Fallback Plain Text Link with Chain Icon -->
                ${altLinkUrl ? `
                <tr>
                  <td align="center" style="padding-top: 4px; text-align: center;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 5px;">
                      <tr>
                        <td align="center" style="font-size: 10.5px; color: #64748b; line-height: 1.4; text-align: center;">
                          <span style="display: inline-block; width: 16px; height: 16px; border-radius: 50%; background-color: #12182c; color: #818cf8; font-size: 9px; line-height: 16px; vertical-align: middle; margin-right: 3px; text-align: center;">&#128279;</span>
                          If the button doesn't work, copy and paste this link into your browser:
                        </td>
                      </tr>
                    </table>
                    <div class="fallback-link-box" style="background-color: #030612; border: 1px solid #131f36; border-radius: 7px; padding: 8px 10px; word-break: break-all; word-wrap: break-word; overflow-wrap: anywhere; font-family: Consolas, Monaco, monospace; font-size: 10.5px; color: #38bdf8; text-align: center; max-width: 410px; margin: 0 auto; box-sizing: border-box;">
                      <a href="${altLinkUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline; word-break: break-all; overflow-wrap: anywhere; display: inline-block; max-width: 100%;">${altLinkUrl}</a>
                    </div>
                  </td>
                </tr>
                ` : ''}

              </table>

            </td>
          </tr>

          <!-- CLEAN DEVELOPER FOOTER -->
          <tr>
            <td align="center" style="padding: 12px 18px 20px 18px; text-align: center;">
              
              <!-- Subtle Divider Line -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 12px;">
                <tr>
                  <td height="1" bgcolor="#141c30" style="height: 1px; line-height: 1px; font-size: 1px;">&nbsp;</td>
                </tr>
              </table>

              <!-- Footer Navigation Links with Icons -->
              <div class="footer-links" style="font-size: 11px; color: #94a3b8; margin-bottom: 8px; text-align: center; font-weight: 600;">
                <a href="${baseUrl}" target="_blank" style="color: #cbd5e1; margin: 0 8px; text-decoration: none; display: inline-block;">
                  <span style="color: #a855f7; font-family: Consolas, monospace; font-weight: 800; margin-right: 3px;">&gt;_</span>Workspace
                </a>
                <span style="color: #334155;">&bull;</span>
                <a href="${baseUrl}" target="_blank" style="color: #cbd5e1; margin: 0 8px; text-decoration: none; display: inline-block;">
                  <span style="color: #38bdf8; margin-right: 3px;">&#128101;</span>Collaborate
                </a>
                <span style="color: #334155;">&bull;</span>
                <a href="${baseUrl}#contact" target="_blank" style="color: #cbd5e1; margin: 0 8px; text-decoration: none; display: inline-block;">
                  <span style="color: #818cf8; margin-right: 3px;">&#127911;</span>Support Desk
                </a>
              </div>

              <!-- Copyright & Architecture -->
              <div class="footer-desc" style="font-size: 9.5px; color: #475569; line-height: 1.45; max-width: 420px; margin: 0 auto; text-align: center;">
                &copy; 2026 CodeSyne Technologies Inc. All rights reserved.<br />
                Cloud IDE &bull; Real-time Collaboration Engine &bull; Containerized Execution
              </div>

            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

/**
 * 1. Email Verification Template
 */
export function generateVerificationEmailHtml(username: string, token: string, customBaseUrl?: string): string {
  const baseUrl = getAppBaseUrl(customBaseUrl);
  const verifyUrl = `${baseUrl}/?verifyToken=${encodeURIComponent(token)}`;

  const theoryBox = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; padding: 10px 12px; text-align: left; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td style="font-size: 9px; font-family: Consolas, Monaco, monospace; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.8px; padding-bottom: 4px;">
          // CODESYNE PLATFORM ARCHITECTURE
        </td>
      </tr>
      <tr>
        <td style="font-size: 11px; color: #94a3b8; line-height: 1.45;">
          &bull; <strong>Zero-Install Cloud Compilers:</strong> C, C++, Python, Go, Java, Rust, Node.js.<br />
          &bull; <strong>Multiplayer Sync:</strong> Sub-50ms operational transformations for pair programming.<br />
          &bull; <strong>Ansi Terminal:</strong> Live interactive execution with memory-bounded security.
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'envelope',
    headingHtml: 'Activate your <span style="color: #c084fc;">CodeSyne</span> account',
    subheadingText: 'ACCOUNT IDENTITY VERIFICATION',
    greetingName: username,
    messageHtml: 'Thank you for choosing CodeSyne! To initialize your cloud workspace, secure your developer profile, and unlock real-time collaboration, please verify your email address below:',
    theoryHtml: theoryBox,
    buttonText: 'Verify Email & Activate Workspace',
    buttonUrl: verifyUrl,
    buttonIcon: '&#9993;&#xFE0E;',
    securityNoteHtml: 'This verification link is valid for <strong>24 hours</strong>. If you did not create an account, you can safely ignore this email.',
    altLinkUrl: verifyUrl
  });
}

/**
 * 2. Welcome Email Template
 */
export function generateWelcomeEmailHtml(username: string, customBaseUrl?: string): string {
  const baseUrl = getAppBaseUrl(customBaseUrl);

  const detailsBox = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; padding: 10px 12px; text-align: left; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td style="font-size: 9px; font-family: Consolas, Monaco, monospace; font-weight: 800; color: #34d399; text-transform: uppercase; letter-spacing: 0.8px; padding-bottom: 4px;">
          // GETTING STARTED WITH YOUR WORKSPACE
        </td>
      </tr>
      <tr>
        <td style="font-size: 11px; color: #cbd5e1; line-height: 1.45;">
          <strong>1. Create Projects:</strong> Scaffold multi-file full-stack apps or scripts in 10+ languages.<br />
          <strong>2. Instant Execution:</strong> Click "Run Code" to compile in our sandboxed runner.<br />
          <strong>3. Live Collaboration:</strong> Share a Room ID or link to code simultaneously with your team.
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'code',
    headingHtml: 'Welcome to <span style="color: #c084fc;">CodeSyne</span> Cloud IDE',
    subheadingText: 'WORKSPACE ACTIVATED & READY',
    greetingName: username,
    messageHtml: 'Your email address has been verified successfully. Your developer profile and isolated cloud environment are now fully provisioned and ready for development.',
    detailsBoxHtml: detailsBox,
    buttonText: 'Launch CodeSyne Cloud IDE',
    buttonUrl: baseUrl,
    buttonIcon: '&lt;/&gt;',
    securityNoteHtml: 'All cloud compiler runtimes and collaboration rooms are active and ready.'
  });
}

/**
 * 3. Password Reset Email Template (Matches Reference Image Exactly!)
 */
export function generatePasswordResetEmailHtml(username: string, token: string, customBaseUrl?: string): string {
  const baseUrl = getAppBaseUrl(customBaseUrl);
  const resetUrl = `${baseUrl}/?resetToken=${encodeURIComponent(token)}`;

  return buildCodeSyneEmailHtml({
    iconType: 'lock',
    headingHtml: 'Reset your <span style="color: #c084fc;">CodeSyne</span><br />password',
    subheadingText: 'SECURITY & ACCOUNT RECOVERY',
    greetingName: username,
    messageHtml: 'We received a request to reset the password for your CodeSyne account. To continue, click the button below. If you did not request this, you can safely ignore this email.',
    buttonText: 'Reset My Password',
    buttonUrl: resetUrl,
    buttonIcon: '&#128274;',
    securityNoteHtml: 'This password reset link is valid for <strong>30 minutes</strong> for your security. Do not share this link with anyone.',
    altLinkUrl: resetUrl
  });
}

/**
 * 4. Collaboration Room Invitation Email Template
 */
export function generateCollabRoomInviteEmailHtml(
  inviterName: string, 
  roomId: string, 
  projectName: string = 'Collaborative Workspace', 
  customRoomUrl?: string,
  customBaseUrl?: string
): string {
  const baseUrl = getAppBaseUrl(customBaseUrl);
  const roomUrl = customRoomUrl || `${baseUrl}/?collab=${encodeURIComponent(roomId)}`;

  const roomBox = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; padding: 10px 12px; text-align: center; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td style="font-size: 9px; font-family: Consolas, Monaco, monospace; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700; padding-bottom: 3px; text-align: center;">
          ACTIVE COLLABORATION SESSION
        </td>
      </tr>
      <tr>
        <td style="font-size: 15px; font-weight: 800; color: #38bdf8; padding-bottom: 3px; text-align: center;">
          ${projectName}
        </td>
      </tr>
      <tr>
        <td style="font-size: 11px; font-family: Consolas, Monaco, monospace; color: #a855f7; font-weight: 700; text-align: center;">
          Session Room ID: ${roomId}
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'welcome',
    headingHtml: 'Live Pair-Programming <span style="color: #c084fc;">Invitation</span>',
    subheadingText: 'REAL-TIME SYNCHRONIZED CODING',
    messageHtml: `<strong>${inviterName}</strong> has invited you to join an active collaborative development session on <strong>CodeSyne</strong>. Join to edit code, execute scripts in the shared cloud runner, and chat in real time.`,
    detailsBoxHtml: roomBox,
    buttonText: 'Enter Collaboration Room',
    buttonUrl: roomUrl,
    buttonIcon: '&#128101;',
    securityNoteHtml: 'Click the button to enter the live workspace immediately with full compiler access.',
    altLinkUrl: roomUrl
  });
}

/**
 * 5. Team / Workspace Project Invitation Email Template
 */
export function generateTeamInviteEmailHtml(
  inviterName: string, 
  projectName: string, 
  roomId: string, 
  inviteToken: string,
  customBaseUrl?: string
): string {
  const baseUrl = getAppBaseUrl(customBaseUrl);
  const inviteUrl = `${baseUrl}/?collab=${encodeURIComponent(roomId)}&inviteToken=${encodeURIComponent(inviteToken)}`;

  const projectBox = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; padding: 10px 12px; text-align: center; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td style="font-size: 9px; font-family: Consolas, Monaco, monospace; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700; padding-bottom: 3px; text-align: center;">
          SHARED WORKSPACE REPOSITORY
        </td>
      </tr>
      <tr>
        <td style="font-size: 15px; font-weight: 800; color: #38bdf8; text-align: center;">
          ${projectName}
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'welcome',
    headingHtml: 'Team Project <span style="color: #c084fc;">Collaboration</span>',
    subheadingText: 'WORKSPACE ACCESS GRANTED',
    messageHtml: `<strong>${inviterName}</strong> has granted you workspace access to collaborate on <strong>"${projectName}"</strong>. Click the button below to join the shared IDE session:`,
    detailsBoxHtml: projectBox,
    buttonText: 'Accept Invitation & Join Session',
    buttonUrl: inviteUrl,
    buttonIcon: '&#128101;',
    securityNoteHtml: 'This team invitation link is associated with your authenticated developer token.',
    altLinkUrl: inviteUrl
  });
}

/**
 * 6. Security / Login Alert Email Template
 */
export function generateSecurityAlertEmailHtml(
  username: string, 
  actionTitle: string = 'New Account Sign-In',
  ipAddress: string = 'Standard Web Client',
  rawDeviceInfo: string = 'Web Browser Session'
): string {
  const baseUrl = getAppBaseUrl();
  const cleanDevice = formatDeviceInfo(rawDeviceInfo);
  const formattedTime = new Date().toUTCString();

  const alertBox = `
    <table class="res-table" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; overflow: hidden; text-align: left; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; border-bottom: 1px solid #101726; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; white-space: nowrap;">
          Activity
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; border-bottom: 1px solid #101726; font-size: 12px; font-weight: 600; color: #f1f5f9; word-break: break-word; overflow-wrap: anywhere;">
          ${actionTitle}
        </td>
      </tr>
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; border-bottom: 1px solid #101726; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; white-space: nowrap;">
          Time (UTC)
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; border-bottom: 1px solid #101726; font-size: 11px; color: #cbd5e1; font-family: Consolas, Monaco, monospace; word-break: break-word; overflow-wrap: anywhere;">
          ${formattedTime}
        </td>
      </tr>
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; border-bottom: 1px solid #101726; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; white-space: nowrap;">
          IP Address
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; border-bottom: 1px solid #101726; font-size: 11px; color: #38bdf8; font-family: Consolas, Monaco, monospace; font-weight: 600; word-break: break-word; overflow-wrap: anywhere;">
          ${ipAddress}
        </td>
      </tr>
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; white-space: nowrap;">
          Device / Client
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; font-size: 11.5px; color: #cbd5e1; font-weight: 600; word-break: break-word; overflow-wrap: anywhere;">
          ${cleanDevice}
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'security',
    headingHtml: 'New Account <span style="color: #fb7185;">Sign-In</span> Detected',
    subheadingText: 'AUTOMATED SECURITY TELEMETRY',
    greetingName: username,
    messageHtml: 'We recorded a new session sign-in to your CodeSyne developer profile. The session details are summarized below for your security review:',
    detailsBoxHtml: alertBox,
    buttonText: 'Review Account Security',
    buttonUrl: baseUrl,
    buttonIcon: '&#128737;&#xFE0E;',
    securityNoteHtml: 'If this activity was not initiated by you, please reset your password immediately to revoke all active sessions.'
  });
}

/**
 * 7. Contact Us Inquiry Email Template (Sent to nakulsharma02011@gmail.com / Developer Desk)
 */
export function generateContactInquiryEmailHtml(
  name: string,
  email: string,
  subject: string,
  message: string
): string {
  const formattedTime = new Date().toUTCString();

  const inquiryBox = `
    <table class="res-table" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; overflow: hidden; text-align: left; margin: 0 auto 10px auto; box-sizing: border-box;">
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; border-bottom: 1px solid #101726; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; vertical-align: middle; white-space: nowrap;">
          Inquirer Name
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; border-bottom: 1px solid #101726; font-size: 12.5px; font-weight: 700; color: #ffffff; vertical-align: middle; word-break: break-word; overflow-wrap: anywhere;">
          ${name}
        </td>
      </tr>
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; border-bottom: 1px solid #101726; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; vertical-align: middle; white-space: nowrap;">
          Verified Email
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; border-bottom: 1px solid #101726; font-size: 12px; color: #38bdf8; font-family: Consolas, Monaco, monospace; font-weight: 600; vertical-align: middle; word-break: break-word; overflow-wrap: anywhere;">
          <a href="mailto:${email}" style="color: #38bdf8; text-decoration: underline; word-break: break-word;">${email}</a>
        </td>
      </tr>
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; border-bottom: 1px solid #101726; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; vertical-align: middle; white-space: nowrap;">
          Inquiry Subject
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; border-bottom: 1px solid #101726; font-size: 12px; color: #a855f7; font-weight: 600; vertical-align: middle; word-break: break-word; overflow-wrap: anywhere;">
          ${subject}
        </td>
      </tr>
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; vertical-align: middle; white-space: nowrap;">
          Timestamp (UTC)
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; font-size: 11px; color: #cbd5e1; font-family: Consolas, Monaco, monospace; vertical-align: middle; word-break: break-word; overflow-wrap: anywhere;">
          ${formattedTime}
        </td>
      </tr>
    </table>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; text-align: left; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td style="padding: 10px 12px 3px 12px; font-size: 9px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px;">
          // INQUIRY MESSAGE PAYLOAD
        </td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 12px 12px; font-size: 12.5px; color: #f1f5f9; line-height: 1.55; word-break: break-word; overflow-wrap: anywhere; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          ${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'inquiry',
    headingHtml: 'New <span style="color: #38bdf8;">Contact Us</span> Inquiry',
    subheadingText: 'DIRECT INBOUND SUPPORT RELAY',
    messageHtml: 'A visitor has submitted a new inquiry via the CodeSyne Contact Us form:',
    detailsBoxHtml: inquiryBox,
    buttonText: `Reply Directly to ${name}`,
    buttonUrl: `mailto:${email}?subject=Re: ${encodeURIComponent(subject)}`,
    buttonIcon: '&#128172;',
    securityNoteHtml: 'You can reply directly to this verified message by clicking the button above or responding to their email address.'
  });
}

/**
 * 8. Contact Us Acknowledgment Template (Sent to Inquirer)
 */
export function generateContactAckEmailHtml(name: string, subject: string, customBaseUrl?: string): string {
  const baseUrl = getAppBaseUrl(customBaseUrl);

  const theoryBox = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; padding: 10px 12px; text-align: left; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td style="font-size: 9px; font-family: Consolas, Monaco, monospace; font-weight: 800; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.8px; padding-bottom: 4px;">
          // CODESYNE SUPPORT DESK SLA
        </td>
      </tr>
      <tr>
        <td style="font-size: 11px; color: #94a3b8; line-height: 1.45;">
          &bull; Our core engineering desk typically reviews and responds to developer inquiries within <strong>24 to 48 business hours</strong>.<br />
          &bull; For urgent issues with collaborative workspaces, you can also connect with our live community via the workspace interface.
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'inquiry',
    headingHtml: 'Inquiry <span style="color: #38bdf8;">Successfully</span> Received',
    subheadingText: 'SUPPORT DISPATCH CONFIRMATION',
    greetingName: name,
    messageHtml: `Thank you for reaching out to CodeSyne! We have safely received your inquiry regarding <strong>"${subject}"</strong>. Our engineering desk is reviewing your message and will get back to you shortly.`,
    theoryHtml: theoryBox,
    buttonText: 'Explore CodeSyne Cloud IDE',
    buttonUrl: baseUrl,
    buttonIcon: '&gt;_',
    securityNoteHtml: 'Your support ticket has been queued in our direct dispatch relay system.'
  });
}

/**
 * 9. Contact Us Email Verification Template (Sent to Guest before inquiry dispatch)
 */
export function generateContactVerificationEmailHtml(name: string, subject: string, verificationToken: string, customBaseUrl?: string): string {
  const baseUrl = getAppBaseUrl(customBaseUrl);
  const verifyUrl = `${baseUrl}/?contact_verify_token=${encodeURIComponent(verificationToken)}#contact`;

  const detailsBox = `
    <table class="res-table" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; background-color: #050914; border: 1px solid #141f33; border-radius: 10px; overflow: hidden; text-align: left; margin: 0 auto; box-sizing: border-box;">
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; border-bottom: 1px solid #101726; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; white-space: nowrap;">
          Inquirer Name
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; border-bottom: 1px solid #101726; font-size: 12.5px; font-weight: 700; color: #ffffff; word-break: break-word; overflow-wrap: anywhere;">
          ${name}
        </td>
      </tr>
      <tr>
        <td class="res-cell-label" style="padding: 8px 12px; width: 34%; font-size: 9.5px; font-family: Consolas, Monaco, monospace; font-weight: 700; color: #64748b; text-transform: uppercase; white-space: nowrap;">
          Inquiry Subject
        </td>
        <td class="res-cell-val" style="padding: 8px 12px; font-size: 12px; color: #38bdf8; font-weight: 600; word-break: break-word; overflow-wrap: anywhere;">
          ${subject}
        </td>
      </tr>
    </table>
  `;

  return buildCodeSyneEmailHtml({
    iconType: 'envelope',
    headingHtml: 'Verify Your <span style="color: #38bdf8;">Inquiry Email</span>',
    subheadingText: 'ANTI-SPAM VERIFICATION PROTOCOL',
    greetingName: name,
    messageHtml: 'To protect our support channels and guarantee your inquiry reaches our lead engineers, please verify your email address. Click the button below to confirm transmission:',
    detailsBoxHtml: detailsBox,
    buttonText: 'Confirm & Transmit Inquiry',
    buttonUrl: verifyUrl,
    buttonIcon: '&#9993;&#xFE0E;',
    securityNoteHtml: 'This inquiry verification link is valid for <strong>24 hours</strong>. If you did not submit this message, you can safely disregard this email.',
    altLinkUrl: verifyUrl
  });
}
