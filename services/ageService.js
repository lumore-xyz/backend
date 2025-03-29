/**
 * Calculates age from a date of birth
 * @param {Date} dob - Date of birth
 * @returns {number} Age in years
 */
export const calculateAge = (dob) => {
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
};

/**
 * Checks if a user's age falls within another user's preferred age range
 * @param {number} userAge - Age of the user to check
 * @param {Object} preferences - User preferences containing ageRange
 * @param {number} preferences.ageRange.min - Minimum preferred age
 * @param {number} preferences.ageRange.max - Maximum preferred age
 * @returns {boolean} True if age is within range, false otherwise
 */
export const isAgeInRange = (userAge, preferences) => {
  if (!preferences?.ageRange) return true; // If no preferences, consider it a match
  return (
    userAge >= preferences.ageRange.min && userAge <= preferences.ageRange.max
  );
};
