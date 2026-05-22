import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_invitation_email(to_email: str, invite_code: str, inviter_name: str, company_name: str, accept_link: str = None, expo_link: str = None):
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    from_email = os.getenv("SMTP_FROM_EMAIL", "no-reply@nch-hallmarkbot.in")
    from_name = os.getenv("SMTP_FROM_NAME", "Hallmarking Bot")

    subject = f"Invitation to join {company_name} on Hallmarking Bot"
    
    body = f"""
    <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc;">
        <div style="max-width: 550px; margin: 40px auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <p style="font-size: 16px; margin-bottom: 20px;">Hello,</p>
          
          <p style="font-size: 16px; color: #1e293b; margin-bottom: 28px; line-height: 1.5;">
            <strong>{inviter_name}</strong> has sent you an invitation to join the <strong>{company_name}</strong> workspace on <strong>Hallmarking Bot</strong>.
          </p>
          
          <div style="margin: 28px 0; text-align: center;">
            <a href="{accept_link}" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; background-color: #003087; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 48, 135, 0.25);">
              Accept Invitation
            </a>
          </div>
          
          <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 28px 0;" />
          
          <p style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
            If the button above does not work, copy and paste this link into your mobile browser:
          </p>
          <p style="font-size: 13px; color: #003087; word-break: break-all; margin-bottom: 24px;">
            <a href="{accept_link}" style="color: #003087; text-decoration: underline;">{accept_link}</a>
          </p>
          
          <div style="padding: 16px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; margin-top: 24px;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Backup Invitation Code</span>
            <span style="font-size: 18px; font-weight: bold; letter-spacing: 1.5px; color: #0f172a; font-family: monospace;">{invite_code}</span>
          </div>
          
        </div>
      </body>
    </html>
    """

    # Print to console/logs for local verification
    print("\n" + "="*50)
    print("SENDING EMAIL INVITATION:")
    print(f"TO: {to_email}")
    print(f"INVITER: {inviter_name}")
    print(f"COMPANY: {company_name}")
    print(f"CODE: {invite_code}")
    if accept_link:
        print(f"LINK: {accept_link}")
    if expo_link:
        print(f"EXPO LINK: {expo_link}")
    print("="*50 + "\n")

    if not smtp_host or not smtp_username or not smtp_password:
        print("[EmailService] SMTP credentials not fully configured in .env. Skipping actual SMTP send (running in simulation/print mode).")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email

        part = MIMEText(body, "html")
        msg.attach(part)

        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_username, smtp_password)
        server.sendmail(from_email, to_email, msg.as_string())
        server.close()
        print(f"[EmailService] Email successfully sent to {to_email}!")
        return True
    except Exception as e:
        print(f"[EmailService] Failed to send email to {to_email}: {e}")
        return False
