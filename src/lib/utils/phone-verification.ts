/**
 * Phone Verification Utility
 *
 * Verifies phone-to-account assignments by parsing phone names.
 * Phones with logged-in accounts are named "{username} Instagram".
 * Clean phones (no account) can be used as backups.
 */

import { GeeLarkPhone } from '@/lib/geelark/types';
import {
  AccountData,
  ParsedPhoneName,
  PhoneVerificationResult,
  PhoneAssignment,
  PHONE_NAME_PATTERN,
  PHONE_NAME_SUFFIX,
} from '@/lib/state-machine/types';
import { sortPhonesBySerialName } from './sorting';

/**
 * Parse a phone name to extract the logged-in account username
 *
 * @param phoneName - The phone's display name (not serialName)
 * @returns Parsed result with detected username or null
 */
export function parsePhoneName(phoneName: string): ParsedPhoneName {
  const match = phoneName.match(PHONE_NAME_PATTERN);

  return {
    hasAccountName: !!match,
    detectedUsername: match ? match[1] : null,
    originalName: phoneName,
  };
}

/**
 * Generate the expected phone name for an account
 *
 * @param username - Instagram username
 * @returns Phone name in format "{username} Instagram"
 */
export function generatePhoneName(username: string): string {
  const name = `${username}${PHONE_NAME_SUFFIX}`;
  // Truncate to 100 chars (API limit) if necessary
  return name.length > 100 ? name.substring(0, 100) : name;
}

/**
 * Check if a phone name indicates it's "clean" (no account logged in)
 *
 * Clean phones don't match the naming convention and are available for use.
 *
 * @param phoneName - The phone's display name
 * @returns true if phone appears to be clean
 */
export function isCleanPhone(phoneName: string): boolean {
  return !PHONE_NAME_PATTERN.test(phoneName);
}

/**
 * Verify all phones against expected accounts
 *
 * Logic:
 * 1. First, match accounts to phones by username (phone name = "{username} Instagram")
 * 2. For accounts without a matching phone, assign to clean phones in order
 * 3. Remaining phones become backups or are marked as mismatched
 *
 * @param phones - All phones from GeeLark API
 * @param accounts - Account data from CSV
 * @returns Verification results for each phone
 */
export function verifyPhones(
  phones: GeeLarkPhone[],
  accounts: AccountData[]
): PhoneVerificationResult[] {
  const sortedPhones = sortPhonesBySerialName(phones);
  const results: PhoneVerificationResult[] = [];

  // Build a map of username -> account for quick lookup
  const accountsByUsername = new Map<string, AccountData>();
  for (const account of accounts) {
    accountsByUsername.set(account.username.toLowerCase(), account);
  }

  // Track which accounts have been assigned to phones
  const assignedAccounts = new Set<string>();
  // Track clean phones for later assignment
  const cleanPhones: Array<{ phone: GeeLarkPhone; phoneName: string; index: number }> = [];

  // First pass: match phones by username in phone name
  sortedPhones.forEach((phone, index) => {
    const phoneName = phone.name || phone.serialName;
    const parsed = parsePhoneName(phoneName);

    if (parsed.hasAccountName && parsed.detectedUsername) {
      // Phone has a username in its name - try to match to an account
      const matchingAccount = accountsByUsername.get(parsed.detectedUsername.toLowerCase());

      if (matchingAccount && !assignedAccounts.has(matchingAccount.username.toLowerCase())) {
        // Found matching account - this is a perfect match
        assignedAccounts.add(matchingAccount.username.toLowerCase());
        results.push({
          envId: phone.id,
          serialName: phone.serialName,
          phoneName,
          expectedAccount: matchingAccount,
          detectedUsername: parsed.detectedUsername,
          status: 'matched',
        });
      } else {
        // Phone has an account name but no matching account in our data
        // This phone has a different account logged in - mark as mismatched
        results.push({
          envId: phone.id,
          serialName: phone.serialName,
          phoneName,
          expectedAccount: null,
          detectedUsername: parsed.detectedUsername,
          status: 'mismatched',
          mismatchReason: matchingAccount
            ? `Account "${parsed.detectedUsername}" already assigned to another phone`
            : `Phone has account "${parsed.detectedUsername}" not in account data`,
        });
      }
    } else {
      // Clean phone - save for second pass
      cleanPhones.push({ phone, phoneName, index });
    }
  });

  // Second pass: assign remaining accounts to clean phones
  const unassignedAccounts = accounts.filter(
    (a) => !assignedAccounts.has(a.username.toLowerCase())
  );

  for (const { phone, phoneName } of cleanPhones) {
    const account = unassignedAccounts.shift();

    if (account) {
      // Assign this account to the clean phone
      assignedAccounts.add(account.username.toLowerCase());
      results.push({
        envId: phone.id,
        serialName: phone.serialName,
        phoneName,
        expectedAccount: account,
        detectedUsername: null,
        status: 'clean',
      });
    } else {
      // No more accounts to assign - this is a backup phone
      results.push({
        envId: phone.id,
        serialName: phone.serialName,
        phoneName,
        expectedAccount: null,
        detectedUsername: null,
        status: 'clean',
      });
    }
  }

  return results;
}

/**
 * Create phone assignments with backup handling
 *
 * Logic:
 * 1. Matched phones proceed normally
 * 2. Clean phones with assigned accounts proceed normally
 * 3. Mismatched phones are skipped, their accounts go to pending
 * 4. Clean phones beyond account count become backups
 * 5. Pending accounts are reassigned to available backups
 *
 * @param verificationResults - Results from verifyPhones()
 * @returns Phone assignment with backups
 */
export function createPhoneAssignment(
  verificationResults: PhoneVerificationResult[]
): PhoneAssignment {
  const matchedPhones: PhoneVerificationResult[] = [];
  const mismatchedPhones: PhoneVerificationResult[] = [];
  const backupPhones: PhoneVerificationResult[] = [];
  const pendingAccounts: AccountData[] = [];

  for (const result of verificationResults) {
    switch (result.status) {
      case 'matched':
        matchedPhones.push(result);
        break;

      case 'clean':
        if (result.expectedAccount) {
          // Clean phone with assigned account - treat as matched
          matchedPhones.push(result);
        } else {
          // Clean phone without account - available as backup
          backupPhones.push(result);
        }
        break;

      case 'mismatched':
        mismatchedPhones.push(result);
        // Add the expected account to pending for reassignment
        if (result.expectedAccount) {
          pendingAccounts.push(result.expectedAccount);
        }
        break;
    }
  }

  return {
    matchedPhones,
    mismatchedPhones,
    backupPhones,
    pendingAccounts,
  };
}

/**
 * Reassign pending accounts to backup phones
 *
 * @param assignment - Current phone assignment
 * @returns Updated assignment with reassignments
 */
export function reassignToBackups(assignment: PhoneAssignment): {
  finalAssignment: PhoneAssignment;
  reassignments: Array<{ backup: PhoneVerificationResult; account: AccountData }>;
  unassignedAccounts: AccountData[];
} {
  const reassignments: Array<{ backup: PhoneVerificationResult; account: AccountData }> = [];
  const unassignedAccounts: AccountData[] = [];

  // Copy arrays to avoid mutation
  const availableBackups = [...assignment.backupPhones];
  const updatedMatchedPhones = [...assignment.matchedPhones];

  for (const account of assignment.pendingAccounts) {
    if (availableBackups.length > 0) {
      const backup = availableBackups.shift()!;
      reassignments.push({ backup, account });

      // Update the backup's expected account and add to matched
      const reassignedPhone: PhoneVerificationResult = {
        ...backup,
        expectedAccount: account,
        status: 'clean', // It's clean and now has an account
      };
      updatedMatchedPhones.push(reassignedPhone);
    } else {
      // No more backups available
      unassignedAccounts.push(account);
    }
  }

  return {
    finalAssignment: {
      matchedPhones: updatedMatchedPhones,
      mismatchedPhones: assignment.mismatchedPhones,
      backupPhones: availableBackups,
      pendingAccounts: unassignedAccounts,
    },
    reassignments,
    unassignedAccounts,
  };
}

/**
 * Log verification summary
 *
 * @param assignment - Phone assignment results
 * @param reassignments - Backup reassignments made
 * @param unassignedAccounts - Accounts that couldn't be assigned
 * @param logger - Logging function
 */
export function logVerificationSummary(
  assignment: PhoneAssignment,
  reassignments: Array<{ backup: PhoneVerificationResult; account: AccountData }>,
  unassignedAccounts: AccountData[],
  logger: (level: 'info' | 'warn' | 'error', message: string) => void
): void {
  // Summary
  logger(
    'info',
    `Phone verification: ${assignment.matchedPhones.length} ready, ` +
      `${assignment.mismatchedPhones.length} mismatched, ` +
      `${assignment.backupPhones.length} backups available`
  );

  // Log reassignments
  if (reassignments.length > 0) {
    logger('info', `Reassigned ${reassignments.length} accounts to backup phones:`);
    for (const r of reassignments) {
      logger('info', `  ${r.account.username} -> ${r.backup.serialName}`);
    }
  }

  // Log mismatches
  if (assignment.mismatchedPhones.length > 0) {
    logger('warn', `${assignment.mismatchedPhones.length} phones have wrong accounts:`);
    for (const p of assignment.mismatchedPhones) {
      logger('warn', `  ${p.serialName}: ${p.mismatchReason}`);
    }
  }

  // Log unassigned accounts
  if (unassignedAccounts.length > 0) {
    logger(
      'warn',
      `${unassignedAccounts.length} accounts could not be assigned (insufficient backups):`
    );
    for (const a of unassignedAccounts) {
      logger('warn', `  Skipping: ${a.username}`);
    }
  }
}
