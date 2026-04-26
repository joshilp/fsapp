/**
 * Email sending via Resend.
 * Configure RESEND_API_KEY, RESEND_FROM_EMAIL, and RESEND_OPERATOR_EMAIL in .env.
 * If RESEND_API_KEY is blank, all sends are silently skipped (no error).
 */
import { env } from '$env/dynamic/private';

type GuestConfirmationParams = {
	guestName: string;
	guestEmail: string;
	propertyName: string;
	checkInDate: string;
	checkOutDate: string;
	nights: number;
	requestedRoomType: string | null;
	quotedTotalCents: number | null;
	publicToken: string;
	confirmationUrl: string;
};

type OperatorAlertParams = {
	guestName: string;
	guestEmail: string | null;
	propertyName: string;
	checkInDate: string;
	checkOutDate: string;
	nights: number;
	requestedRoomType: string | null;
	quotedTotalCents: number | null;
	confirmationUrl: string;
};

function fmtDate(iso: string) {
	return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
		weekday: 'short',
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

function fmtMoney(cents: number | null) {
	if (cents === null || cents === 0) return 'TBD';
	return `$${(cents / 100).toFixed(2)}`;
}

async function send(payload: {
	from: string;
	to: string[];
	subject: string;
	html: string;
}): Promise<void> {
	const apiKey = env.RESEND_API_KEY;
	if (!apiKey) return; // silently disabled

	try {
		const { Resend } = await import('resend');
		const resend = new Resend(apiKey);
		const result = await resend.emails.send(payload);
		if (result.error) {
			console.error('[email] Resend error:', result.error);
		}
	} catch (err) {
		console.error('[email] Send failed:', err);
	}
}

export async function sendGuestConfirmation(p: GuestConfirmationParams): Promise<void> {
	const from = env.RESEND_FROM_EMAIL || 'noreply@example.com';

	const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;color:#1a1a1a">
  <h2 style="margin-bottom:4px">${p.propertyName}</h2>
  <p style="color:#666;margin-top:0">Booking Confirmation</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0">

  <p>Hi ${p.guestName},</p>
  <p>Your reservation is confirmed! Here are the details:</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666;width:40%">Property</td>
      <td style="padding:6px 0"><strong>${p.propertyName}</strong></td>
    </tr>
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666">Check-in</td>
      <td style="padding:6px 0"><strong>${fmtDate(p.checkInDate)}</strong></td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666">Check-out</td>
      <td style="padding:6px 0"><strong>${fmtDate(p.checkOutDate)}</strong> (${p.nights} night${p.nights === 1 ? '' : 's'})</td>
    </tr>
    ${p.requestedRoomType ? `
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666">Room type</td>
      <td style="padding:6px 0">${p.requestedRoomType}</td>
    </tr>` : ''}
    <tr ${p.requestedRoomType ? '' : 'style="background:#f9f9f9"'}>
      <td style="padding:6px 12px 6px 0;color:#666">Quoted total</td>
      <td style="padding:6px 0"><strong>${fmtMoney(p.quotedTotalCents)}</strong> (before tax)</td>
    </tr>
  </table>

  <p style="color:#555;font-size:14px">
    Your specific room number will be assigned before arrival.
    Please bring this confirmation with you at check-in.
  </p>

  <a href="${p.confirmationUrl}"
     style="display:inline-block;background:#d97706;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin:8px 0">
    View Confirmation →
  </a>

  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p style="color:#888;font-size:12px">
    Confirmation #: ${p.publicToken}<br>
    If you need to make changes, please call us directly.
  </p>
</body>
</html>`;

	await send({
		from,
		to: [p.guestEmail],
		subject: `Booking Confirmed — ${p.propertyName} · ${fmtDate(p.checkInDate)}`,
		html
	});
}

export async function sendOperatorAlert(p: OperatorAlertParams): Promise<void> {
	const from = env.RESEND_FROM_EMAIL || 'noreply@example.com';
	const operatorEmail = env.RESEND_OPERATOR_EMAIL;
	if (!operatorEmail) return;

	const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;color:#1a1a1a">
  <h2 style="color:#d97706">⚠ New Online Booking — Room Assignment Needed</h2>
  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0">

  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666;width:40%">Property</td>
      <td style="padding:6px 0"><strong>${p.propertyName}</strong></td>
    </tr>
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666">Guest</td>
      <td style="padding:6px 0"><strong>${p.guestName}</strong>${p.guestEmail ? ` (${p.guestEmail})` : ''}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666">Check-in</td>
      <td style="padding:6px 0">${fmtDate(p.checkInDate)}</td>
    </tr>
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666">Check-out</td>
      <td style="padding:6px 0">${fmtDate(p.checkOutDate)} (${p.nights} night${p.nights === 1 ? '' : 's'})</td>
    </tr>
    ${p.requestedRoomType ? `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666">Requested type</td>
      <td style="padding:6px 0">${p.requestedRoomType}</td>
    </tr>` : ''}
    <tr style="background:#fff3cd">
      <td style="padding:6px 12px 6px 0;color:#666">Quoted total</td>
      <td style="padding:6px 0"><strong>${fmtMoney(p.quotedTotalCents)}</strong></td>
    </tr>
  </table>

  <a href="${p.confirmationUrl}"
     style="display:inline-block;background:#1d1d1d;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0">
    Assign Room in Dashboard →
  </a>
</body>
</html>`;

	await send({
		from,
		to: [operatorEmail],
		subject: `New Online Booking — ${p.guestName} arriving ${fmtDate(p.checkInDate)}`,
		html
	});
}
