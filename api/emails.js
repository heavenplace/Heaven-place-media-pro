// What an email address is, in one place: register, sign-in and Google sign-in all
// normalise and check through here.

// The characters nobody can see that a phone keyboard, a mail app or a paste leaves in an
// address: the left-to-right mark (U+200E) an Android keyboard puts in front of a pasted
// address, a zero-width space, a non-breaking space, a soft hyphen, a byte-order mark.
// `String.trim()` removes none of them, and an address stored with one can never be matched
// by the address its owner types — sign-in then fails with "Incorrect email or password"
// and nothing on screen says why. That is what locked two owners out of their accounts.
const INVISIBLE = /[\u00a0\u00ad\u200b-\u200f\u2028-\u202f\u205f\u2060-\u206f\ufeff\u3000]/g;

/** The address as the app stores it and looks it up: invisible characters gone, trimmed. */
export const normalizeEmail = (value) => String(value ?? '').replace(INVISIBLE, '').trim();

/**
 * One address, not a list of them. Owners have pasted a whole contact list into the field,
 * which arrives as several addresses separated by line breaks and used to be stored as one
 * address nobody could sign in with; it is refused, and said so, instead.
 */
export const isSingleAddress = (address) =>
  Boolean(address) &&
  address.length <= 254 &&
  !/\s/.test(address) &&
  (address.match(/@/g) || []).length === 1;
