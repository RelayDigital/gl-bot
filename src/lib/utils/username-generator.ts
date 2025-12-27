/**
 * Username Generator Utility
 *
 * Generates Instagram-compliant usernames based on a display name.
 * Follows strict rules to create human-looking, spam-resistant usernames.
 */

/**
 * Allowed prefixes for username variations
 */
const PREFIXES = ['hi', 'hey', 'yo', 'its', 'im', 'xo', 'xoxo'];

/**
 * Generate username permutations from a display name
 *
 * Rules:
 * 1. Lowercase letters only (a-z), no numbers/underscores/dots
 * 2. 6-20 characters
 * 3. Must include full first and last name (or rearranged)
 * 4. Can add prefixes: hi, hey, yo, its, im, xo, xoxo
 * 5. Can repeat trailing letter 1-3 times
 *
 * @param displayName - The display name to base usernames on
 * @param count - Number of usernames to generate (default 30)
 * @returns Array of generated usernames
 */
export function generateUsernames(displayName: string, count: number = 30): string[] {
  // Parse the display name into tokens (first name, last name, etc.)
  const tokens = parseDisplayName(displayName);

  if (tokens.length === 0) {
    return [];
  }

  const usernames: Set<string> = new Set();
  const results: string[] = [];

  // If we have at least 2 tokens, use first and last
  // Otherwise, use whatever we have
  const firstName = tokens[0];
  const lastName = tokens.length > 1 ? tokens[tokens.length - 1] : '';

  // Base combinations
  const baseCombinations: string[] = [];

  if (lastName) {
    // Two-token combinations
    baseCombinations.push(firstName + lastName);  // johnsmith
    baseCombinations.push(lastName + firstName);  // smithjohn
  } else {
    // Single token - just use it
    baseCombinations.push(firstName);
  }

  // Generate variations
  for (const base of baseCombinations) {
    // Skip if base is too long
    if (base.length > 20) continue;

    // 1. Plain base (if valid length)
    if (base.length >= 6 && base.length <= 20) {
      addUsername(usernames, results, base);
    }

    // 2. With prefixes
    for (const prefix of PREFIXES) {
      const withPrefix = prefix + base;
      if (withPrefix.length >= 6 && withPrefix.length <= 20) {
        addUsername(usernames, results, withPrefix);
      }
    }

    // 3. With trailing letter repetition (1-3 times)
    if (base.length >= 5) {
      const lastChar = base[base.length - 1];
      for (let repeat = 1; repeat <= 3; repeat++) {
        const withRepeat = base + lastChar.repeat(repeat);
        if (withRepeat.length >= 6 && withRepeat.length <= 20) {
          addUsername(usernames, results, withRepeat);
        }
      }
    }

    // 4. Prefixes with trailing repetition
    for (const prefix of PREFIXES) {
      const withPrefix = prefix + base;
      if (withPrefix.length < 20) {
        const lastChar = withPrefix[withPrefix.length - 1];
        for (let repeat = 1; repeat <= 3; repeat++) {
          const withRepeat = withPrefix + lastChar.repeat(repeat);
          if (withRepeat.length >= 6 && withRepeat.length <= 20) {
            addUsername(usernames, results, withRepeat);
          }
        }
      }
    }
  }

  // Shuffle results to avoid predictable patterns
  shuffleArray(results);

  // Return requested count
  return results.slice(0, count);
}

/**
 * Parse a display name into lowercase letter-only tokens
 */
function parseDisplayName(displayName: string): string[] {
  if (!displayName || typeof displayName !== 'string') {
    return [];
  }

  // Split by spaces and other common separators
  const parts = displayName.toLowerCase().split(/[\s\-_.]+/);

  // Filter and clean each part - keep only letters
  const tokens = parts
    .map(part => part.replace(/[^a-z]/g, ''))
    .filter(part => part.length > 0);

  return tokens;
}

/**
 * Add username to results if not already present
 */
function addUsername(seen: Set<string>, results: string[], username: string): void {
  if (!seen.has(username)) {
    seen.add(username);
    results.push(username);
  }
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Get the next username to try from a generated list
 *
 * @param generatedUsernames - Array of generated usernames
 * @param attemptedUsernames - Set of already attempted usernames
 * @returns Next username to try, or null if exhausted
 */
export function getNextUsername(
  generatedUsernames: string[],
  attemptedUsernames: Set<string>
): string | null {
  for (const username of generatedUsernames) {
    if (!attemptedUsernames.has(username)) {
      return username;
    }
  }
  return null;
}

/**
 * Check if an error message indicates username already exists
 */
export function isUsernameExistsError(errorMessage: string): boolean {
  const patterns = [
    /username.*already.*exists/i,
    /username.*taken/i,
    /username.*unavailable/i,
    /username.*not.*available/i,
    /this.*username.*isn.*t.*available/i,
    /user.*name.*in.*use/i,
  ];

  return patterns.some(pattern => pattern.test(errorMessage));
}
