/**
 * Email Domain Filter Utility
 * Classifies email domains into personal, disposable, and business categories
 */

// Comprehensive list of personal/consumer email domains (50+ domains)
const PERSONAL_DOMAINS = new Set([
  // Major providers
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'live.com',
  'msn.com',
  
  // International providers
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'rambler.ru',
  'web.de',
  'gmx.de',
  'gmx.com',
  't-online.de',
  'freenet.de',
  'arcor.de',
  'orange.fr',
  'wanadoo.fr',
  'laposte.net',
  'free.fr',
  'sfr.fr',
  'alice.it',
  'libero.it',
  'virgilio.it',
  'tiscali.it',
  'tin.it',
  'terra.com.br',
  'uol.com.br',
  'bol.com.br',
  'ig.com.br',
  'globo.com',
  'yahoo.com.br',
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'sohu.com',
  'yahoo.co.jp',
  'nifty.com',
  'biglobe.ne.jp',
  'so-net.ne.jp',
  'ocn.ne.jp',
  'yahoo.co.uk',
  'btinternet.com',
  'sky.com',
  'virginmedia.com',
  'ntlworld.com',
  'tiscali.co.uk',
  'talk21.com',
  'blueyonder.co.uk',
  'yahoo.ca',
  'shaw.ca',
  'sympatico.ca',
  'rogers.com',
  'bell.net',
  'telus.net',
  'yahoo.com.au',
  'bigpond.com',
  'optusnet.com.au',
  'tpg.com.au',
  'ozemail.com.au',
  'yahoo.co.in',
  'rediffmail.com',
  'sify.com',
  'vsnl.com',
  'satyam.net.in'
]);

// Comprehensive list of disposable/temporary email domains (20+ domains)
const DISPOSABLE_DOMAINS = new Set([
  // Well-known temporary email providers
  '10minutemail.com',
  'guerrillamail.com',
  'temp-mail.org',
  'mailinator.com',
  'throwaway.email',
  'getnada.com',
  'maildrop.cc',
  'yopmail.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'tempail.com',
  'mailnesia.com',
  'mytrashmail.com',
  '20minutemail.com',
  'emailondeck.com',
  'mohmal.com',
  'mailcatch.com',
  'tempinbox.com',
  'disposablemail.com',
  'trashmail.com',
  'jetable.org',
  'temporarymail.com',
  'spamgourmet.com',
  'mailexpire.com',
  'deadaddress.com',
  'mailtothis.com',
  'tempymail.com',
  'anonymousemail.me'
]);

export interface EmailDomainClassification {
  isPersonal: boolean;
  isDisposable: boolean;
  domain: string;
}

/**
 * Extracts domain from email address
 * @param email - Email address to extract domain from
 * @returns Domain part of the email (lowercase)
 */
function extractDomain(email: string): string {
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) {
    throw new Error('Invalid email format');
  }
  return email.substring(atIndex + 1).toLowerCase();
}

/**
 * Classifies an email domain into personal, disposable, or business categories
 * @param email - Email address to classify
 * @returns Classification object with flags and domain
 */
export function classifyEmailDomain(email: string): EmailDomainClassification {
  if (!email || typeof email !== 'string') {
    throw new Error('Email address is required and must be a string');
  }

  const domain = extractDomain(email);
  
  const isPersonal = PERSONAL_DOMAINS.has(domain);
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);

  return {
    isPersonal,
    isDisposable,
    domain
  };
}

/**
 * Determines if a lead should be flagged based on email domain
 * @param email - Email address to check
 * @returns True if the lead should be auto-flagged
 */
export function shouldFlagLead(email: string): boolean {
  try {
    const classification = classifyEmailDomain(email);
    
    // Flag leads with personal or disposable email domains
    return classification.isPersonal || classification.isDisposable;
  } catch (error) {
    // If email classification fails, flag for manual review
    return true;
  }
}

/**
 * Gets a human-readable reason for why a lead was flagged
 * @param email - Email address that was flagged
 * @returns Reason string for flagging
 */
export function getFlaggingReason(email: string): string {
  try {
    const classification = classifyEmailDomain(email);
    
    if (classification.isDisposable) {
      return `Disposable email domain: ${classification.domain}`;
    }
    
    if (classification.isPersonal) {
      return `Personal email domain: ${classification.domain}`;
    }
    
    return 'Business email domain';
  } catch (error) {
    return 'Invalid email format';
  }
}

/**
 * Checks if a domain is considered a business domain
 * @param email - Email address to check
 * @returns True if the domain is likely a business domain
 */
export function isBusinessDomain(email: string): boolean {
  try {
    const classification = classifyEmailDomain(email);
    return !classification.isPersonal && !classification.isDisposable;
  } catch (error) {
    return false;
  }
}

// Export domain lists for testing purposes
export const PERSONAL_DOMAINS_LIST = Array.from(PERSONAL_DOMAINS);
export const DISPOSABLE_DOMAINS_LIST = Array.from(DISPOSABLE_DOMAINS);