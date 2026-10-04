export const getAge = (dateOfBirth, now = new Date()) => {
  if (!dateOfBirth) return NaN;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return NaN;
  const reference = new Date(now);
  if (Number.isNaN(reference.getTime())) return NaN;

  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  if (
    reference.getUTCMonth() < birth.getUTCMonth() ||
    (reference.getUTCMonth() === birth.getUTCMonth() &&
      reference.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
};

const nextBirthdayBoundary = (yearsAgo, now) => {
  const year = now.getUTCFullYear() - yearsAgo;
  const month = now.getUTCMonth();
  const day = Math.min(
    now.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );
  return new Date(Date.UTC(year, month, day + 1));
};

export const getDateOfBirthRange = (ageRange = {}, now = new Date()) => {
  const range = {};
  const minimumAge = ageRange.minAge ?? ageRange.min;
  const maximumAge = ageRange.maxAge ?? ageRange.max;
  const minimum = Number(minimumAge);
  const maximum = Number(maximumAge);

  if (maximumAge != null && Number.isFinite(maximum)) {
    range.$gte = nextBirthdayBoundary(Math.floor(maximum) + 1, now);
  }
  if (minimumAge != null && Number.isFinite(minimum)) {
    range.$lt = nextBirthdayBoundary(Math.ceil(minimum), now);
  }

  return range;
};
