/**
 * Elavon Converge server-side helper.
 *
 * All calls go through the Converge XML/POST API.
 * Demo endpoint:  https://api.demo.convergepay.com/VirtualMerchantDemo/process.do
 * Live endpoint:  https://api.convergepay.com/VirtualMerchant/process.do
 *
 * Only the server should ever hold the full ssl_pin.  The browser receives a
 * one-time payment token from Checkout.js (hosted fields) so card numbers
 * never touch our server.
 *
 * Reference: https://developer.elavon.com/na/docs/converge/1.0.0/integration-guide
 */

const LIVE_URL = 'https://api.convergepay.com/VirtualMerchant/process.do';
const DEMO_URL = 'https://api.demo.convergepay.com/VirtualMerchantDemo/process.do';

export type ElavonCreds = {
	merchantId: string;
	userId: string;
	pin: string;
	demo?: boolean;
};

export type ElavonSaleParams = {
	creds: ElavonCreds;
	/** One-time token from Checkout.js  (ssl_token) */
	token: string;
	/** Amount in dollars, e.g. "125.00" */
	amountDollars: string;
	/** Guest name for the transaction */
	guestName?: string;
	/** Optional booking reference for your records */
	bookingRef?: string;
};

export type ElavonRefundParams = {
	creds: ElavonCreds;
	/** Original approval code returned from a prior charge */
	txnId: string;
	/** Amount in dollars; if omitted Converge refunds the full amount */
	amountDollars?: string;
};

export type ElavonVoidParams = {
	creds: ElavonCreds;
	/** ssl_txn_id from the original charge response */
	txnId: string;
};

export type ElavonResult =
	| { ok: true; txnId: string; approvalCode: string; last4: string; cardType: string; raw: Record<string, string> }
	| { ok: false; errorCode: string; errorMessage: string; raw: Record<string, string> };

// ─── Internal helpers ────────────────────────────────────────────────────────

function endpoint(creds: ElavonCreds) {
	return creds.demo ? DEMO_URL : LIVE_URL;
}

/** POST key=value pairs to Converge and parse the XML response. */
async function convergePost(params: Record<string, string>, creds: ElavonCreds): Promise<ElavonResult> {
	const body = new URLSearchParams({
		ssl_merchant_id: creds.merchantId,
		ssl_user_id:     creds.userId,
		ssl_pin:         creds.pin,
		ssl_show_form:   'false',
		ssl_result_format: 'ASCII',
		...params,
	});

	const res = await fetch(endpoint(creds), {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: body.toString(),
	});

	const text = await res.text();
	const parsed = parseAsciiResponse(text);

	if (parsed['ssl_result'] === '0') {
		return {
			ok: true,
			txnId:        parsed['ssl_txn_id']       ?? '',
			approvalCode: parsed['ssl_approval_code'] ?? '',
			last4:        parsed['ssl_card_number']?.slice(-4) ?? '',
			cardType:     parsed['ssl_card_type']     ?? '',
			raw: parsed,
		};
	}

	return {
		ok: false,
		errorCode:    parsed['ssl_result_message'] ?? 'UNKNOWN',
		errorMessage: parsed['ssl_result_message'] ?? text,
		raw: parsed,
	};
}

/** Parse Converge ASCII key=value response into a plain object. */
function parseAsciiResponse(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of text.split('\n')) {
		const idx = line.indexOf('=');
		if (idx > 0) {
			result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
		}
	}
	return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Charge a card using a Checkout.js one-time token.
 * Use this for immediate charges after tokenization.
 */
export async function elavonSale(params: ElavonSaleParams): Promise<ElavonResult> {
	return convergePost({
		ssl_transaction_type: 'ccsale',
		ssl_token:            params.token,
		ssl_amount:           params.amountDollars,
		ssl_cardholder_name:  params.guestName ?? '',
		ssl_invoice_number:   params.bookingRef ?? '',
	}, params.creds);
}

/**
 * Refund (credit) a previous transaction.
 * Pass amountDollars to do a partial refund, or omit for full refund.
 */
export async function elavonRefund(params: ElavonRefundParams): Promise<ElavonResult> {
	const extra: Record<string, string> = {};
	if (params.amountDollars) extra['ssl_amount'] = params.amountDollars;
	return convergePost({
		ssl_transaction_type: 'cccredit',
		ssl_txn_id:           params.txnId,
		...extra,
	}, params.creds);
}

/**
 * Void a transaction (same-day, before settlement).
 */
export async function elavonVoid(params: ElavonVoidParams): Promise<ElavonResult> {
	return convergePost({
		ssl_transaction_type: 'ccvoid',
		ssl_txn_id:           params.txnId,
	}, params.creds);
}

/**
 * Request a Checkout.js session token so the browser can render hosted fields.
 * Call from a server endpoint; return the token to the client.
 * See: https://developer.elavon.com/na/docs/converge/1.0.0/integration-guide/checkout-js
 */
export async function elavonGetCheckoutToken(creds: ElavonCreds): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
	const result = await convergePost({
		ssl_transaction_type: 'ccgettoken',
		ssl_add_token:        'Y',
	}, creds);

	if (result.ok) {
		const sessionToken = result.raw['ssl_token'] ?? '';
		return { ok: true, token: sessionToken };
	}
	return { ok: false, error: result.errorMessage };
}
