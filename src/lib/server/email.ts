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
	emailNote?: string | null;
	emailSignature?: string | null;
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

type CancellationNoticeParams = {
	guestName: string;
	guestEmail: string;
	propertyName: string;
	checkInDate: string;
	checkOutDate: string;
	refundCents: number;
	cancellationFeeCents: number;
};

export type PreArrivalParams = {
	guestName: string;
	guestEmail: string;
	propertyName: string;
	propertyPhone: string | null;
	propertyAddress: string | null;
	checkInDate: string;
	checkOutDate: string;
	nights: number;
	checkinTime: string;
	selfCheckinUrl: string;
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
  ${p.emailNote ? `<p style="background:#f9f7f4;border-left:3px solid #d97706;padding:10px 14px;border-radius:4px;font-size:14px">${p.emailNote}</p>` : ''}

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

export async function sendCancellationNotice(p: CancellationNoticeParams): Promise<void> {
	const from = env.RESEND_FROM_EMAIL || 'noreply@example.com';

	const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;color:#1a1a1a">
  <h2 style="margin-bottom:4px">${p.propertyName}</h2>
  <p style="color:#c00;margin-top:0;font-weight:600">Booking Cancellation Notice</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0">

  <p>Hi ${p.guestName},</p>
  <p>Your booking has been cancelled. Here's a summary:</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666;width:40%">Property</td>
      <td style="padding:6px 0"><strong>${p.propertyName}</strong></td>
    </tr>
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666">Was: Check-in</td>
      <td style="padding:6px 0">${fmtDate(p.checkInDate)}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666">Was: Check-out</td>
      <td style="padding:6px 0">${fmtDate(p.checkOutDate)}</td>
    </tr>
    ${p.cancellationFeeCents > 0 ? `
    <tr style="background:#fff3cd">
      <td style="padding:6px 12px 6px 0;color:#666">Cancellation fee</td>
      <td style="padding:6px 0;color:#c00"><strong>${fmtMoney(p.cancellationFeeCents)}</strong></td>
    </tr>` : ''}
    <tr style="background:#e8f5e9">
      <td style="padding:6px 12px 6px 0;color:#666">Refund</td>
      <td style="padding:6px 0;color:#2e7d32"><strong>${p.refundCents > 0 ? fmtMoney(p.refundCents) : 'None'}</strong></td>
    </tr>
  </table>

  <p style="color:#555;font-size:14px">
    If you have any questions, please contact us directly.
  </p>

  <p style="color:#555;font-size:14px">Thank you for choosing ${p.propertyName}.</p>
</body>
</html>`;

	await send({
		from,
		to: [p.guestEmail],
		subject: `Booking Cancelled — ${p.propertyName}`,
		html
	});
}

/**
 * Pre-arrival email sent automatically the day before check-in. * Includes the self check-in link so the guest can complete check-in online
 * and receive their door code without needing to visit the front desk.
 */
export async function sendPreArrival(p: PreArrivalParams): Promise<void> {
	const from = env.RESEND_FROM_EMAIL || 'noreply@example.com';

	const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;color:#1a1a1a">
  <h2 style="margin-bottom:4px">${p.propertyName}</h2>
  <p style="color:#666;margin-top:0">Your stay is tomorrow — complete check-in online</p>
  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0">

  <p>Hi ${p.guestName},</p>
  <p>We're looking forward to welcoming you tomorrow! You can skip the front desk by completing your check-in online right now.</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666;width:40%">Check-in</td>
      <td style="padding:6px 0"><strong>${fmtDate(p.checkInDate)}</strong> after ${p.checkinTime}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666">Check-out</td>
      <td style="padding:6px 0"><strong>${fmtDate(p.checkOutDate)}</strong> (${p.nights} night${p.nights === 1 ? '' : 's'})</td>
    </tr>
    ${p.propertyAddress ? `
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666">Address</td>
      <td style="padding:6px 0">${p.propertyAddress}</td>
    </tr>` : ''}
    ${p.propertyPhone ? `
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666">Phone</td>
      <td style="padding:6px 0">${p.propertyPhone}</td>
    </tr>` : ''}
  </table>

  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin:20px 0;text-align:center">
    <p style="margin:0 0 12px;font-weight:600;color:#1e40af">Complete your online check-in to get your room access code</p>
    <a href="${p.selfCheckinUrl}"
       style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:16px">
      Check In Online →
    </a>
    <p style="margin:12px 0 0;font-size:12px;color:#6b7280">
      This link is unique to your booking. Do not share it.
    </p>
  </div>

  <p style="color:#555;font-size:14px">
    If you have any questions before arrival, please call us at ${p.propertyPhone ?? p.propertyName}.
  </p>

  <p style="color:#555;font-size:14px">See you soon!</p>
  <p style="color:#555;font-size:14px">— ${(p as { emailSignature?: string | null }).emailSignature || `The team at ${p.propertyName}`}</p>

  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p style="color:#aaa;font-size:11px">
    You are receiving this because you have a reservation at ${p.propertyName}.
  </p>
</body>
</html>`;

	await send({
		from,
		to: [p.guestEmail],
		subject: `Your stay is tomorrow — ${p.propertyName} · check in online`,
		html
	});
}

export type CheckoutReceiptParams = {
	guestName: string;
	guestEmail: string;
	propertyName: string;
	propertyPhone: string | null;
	propertyAddress: string | null;
	propertyCity: string | null;
	propertyProvince: string | null;
	propertyGstNumber: string | null;
	checkInDate: string;
	checkOutDate: string;
	nights: number;
	roomNumber: string | null;
	roomTypeName: string | null;
	lineItems: { label: string; type: string; totalAmount: number }[];
	payments: { type: string; paymentMethod: string; amount: number; receiptNumber: string | null }[];
	receiptUrl: string;
};

/**
 * Post-checkout receipt email sent automatically when a guest checks out.
 * Contains a full folio summary and a link to the printable receipt page.
 */
export async function sendCheckoutReceipt(p: CheckoutReceiptParams): Promise<void> {
	const from = env.RESEND_FROM_EMAIL || 'noreply@example.com';

	const chargesTotal = p.lineItems.reduce((s, l) => s + l.totalAmount, 0);
	const collected    = p.payments.filter(x => x.type !== 'refund').reduce((s, x) => s + x.amount, 0);
	const refunded     = p.payments.filter(x => x.type === 'refund').reduce((s, x) => s + x.amount, 0);
	const balance      = chargesTotal - collected + refunded;

	const rates  = p.lineItems.filter(l => l.type === 'rate');
	const extras = p.lineItems.filter(l => l.type === 'extra');
	const taxes  = p.lineItems.filter(l => l.type === 'tax');

	function row(label: string, amount: number, bg = '') {
		return `<tr${bg ? ` style="background:${bg}"` : ''}>
      <td style="padding:5px 12px 5px 0;color:#555;font-size:13px">${label}</td>
      <td style="padding:5px 0;text-align:right;font-size:13px">${fmtMoney(amount)}</td>
    </tr>`;
	}

	const chargeRows = [
		...rates.map(l  => row(l.label, l.totalAmount)),
		...extras.map(l => row(l.label, l.totalAmount, '#fafafa')),
		...taxes.map(l  => row(l.label, l.totalAmount, '#fafafa')),
	].join('');

	const paymentRows = p.payments.map(x => {
		const label = x.type === 'refund' ? 'Refund' : x.type === 'deposit' ? 'Deposit' : 'Payment';
		const method = ({ cash:'Cash', card:'Card', etransfer:'e-Transfer', check:'Cheque', other:'Other' } as Record<string,string>)[x.paymentMethod] ?? x.paymentMethod;
		return row(`${label} — ${method}${x.receiptNumber ? ' #' + x.receiptNumber : ''}`, x.type === 'refund' ? x.amount : -x.amount);
	}).join('');

	const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;color:#1a1a1a">
  <h2 style="margin-bottom:4px">${p.propertyName}</h2>
  <p style="color:#666;margin-top:0">Checkout Receipt</p>
  ${p.propertyAddress ? `<p style="color:#888;font-size:12px;margin:2px 0">${p.propertyAddress}${p.propertyCity ? ', ' + p.propertyCity : ''}${p.propertyProvince ? ', ' + p.propertyProvince : ''}</p>` : ''}
  ${p.propertyPhone ? `<p style="color:#888;font-size:12px;margin:2px 0">${p.propertyPhone}</p>` : ''}
  ${p.propertyGstNumber ? `<p style="color:#aaa;font-size:11px;margin:2px 0">GST/HST #: ${p.propertyGstNumber}</p>` : ''}
  <hr style="border:none;border-top:1px solid #ddd;margin:16px 0">

  <p>Hi ${p.guestName},</p>
  <p>Thank you for your stay! Here is your receipt.</p>

  <table style="width:100%;border-collapse:collapse;margin:12px 0">
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666;font-size:13px;width:40%">Room</td>
      <td style="padding:6px 0;font-size:13px">${p.roomNumber ? 'Room ' + p.roomNumber : '—'}${p.roomTypeName ? ' — ' + p.roomTypeName : ''}</td>
    </tr>
    <tr>
      <td style="padding:6px 12px 6px 0;color:#666;font-size:13px">Check-in</td>
      <td style="padding:6px 0;font-size:13px">${fmtDate(p.checkInDate)}</td>
    </tr>
    <tr style="background:#f9f9f9">
      <td style="padding:6px 12px 6px 0;color:#666;font-size:13px">Check-out</td>
      <td style="padding:6px 0;font-size:13px">${fmtDate(p.checkOutDate)} (${p.nights} night${p.nights === 1 ? '' : 's'})</td>
    </tr>
  </table>

  <p style="font-size:13px;font-weight:600;margin:16px 0 6px;color:#333">Charges</p>
  <table style="width:100%;border-collapse:collapse">${chargeRows}
    <tr style="border-top:2px solid #ddd">
      <td style="padding:7px 12px 7px 0;font-weight:700;font-size:13px">Total</td>
      <td style="padding:7px 0;text-align:right;font-weight:700;font-size:13px">${fmtMoney(chargesTotal)}</td>
    </tr>
  </table>

  ${p.payments.length > 0 ? `
  <p style="font-size:13px;font-weight:600;margin:16px 0 6px;color:#333">Payments</p>
  <table style="width:100%;border-collapse:collapse">${paymentRows}</table>` : ''}

  <table style="width:100%;border-collapse:collapse;margin-top:8px">
    <tr style="background:${balance <= 0 ? '#e8f5e9' : '#fff3cd'}">
      <td style="padding:8px 12px 8px 0;font-weight:700;font-size:14px">Balance</td>
      <td style="padding:8px 0;text-align:right;font-weight:700;font-size:14px;color:${balance <= 0 ? '#2e7d32' : '#b45309'}">${balance <= 0 ? 'Paid in Full' : fmtMoney(balance) + ' owing'}</td>
    </tr>
  </table>

  <div style="margin:24px 0;text-align:center">
    <a href="${p.receiptUrl}"
       style="display:inline-block;background:#1d1d1d;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">
      View / Print Full Receipt →
    </a>
  </div>

  <p style="color:#555;font-size:14px">We hope you enjoyed your stay and look forward to welcoming you back!</p>
  <p style="color:#555;font-size:14px">— ${p.propertyName}</p>

  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0">
  <p style="color:#aaa;font-size:11px">
    If you have any questions about this receipt, please contact us${p.propertyPhone ? ' at ' + p.propertyPhone : ''}.
  </p>
</body>
</html>`;

	await send({
		from,
		to: [p.guestEmail],
		subject: `Receipt — ${p.propertyName} · ${fmtDate(p.checkOutDate)}`,
		html
	});
}
