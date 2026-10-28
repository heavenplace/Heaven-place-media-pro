// The browser-side twin of the server's normalisation (api/emails.js): the invisible
// characters a phone keyboard or a paste leaves in an address are removed as the field is
// filled. They are what locked owners out — the field *looks* right while the browser's own
// email validation refuses to submit it ("A part followed by '@' should not contain the
// symbol '.'"), and anything that did get through was stored unmatchable.
const INVISIBLE = /[\u00a0\u00ad\u200b-\u200f\u2028-\u202f\u205f\u2060-\u206f\ufeff\u3000]/g;

/** The address as the user meant it: invisible characters gone, trimmed. */
export const cleanEmailInput = (value) => String(value ?? '').replace(INVISIBLE, '').trim();
