export const THIS_OR_THAT_QUESTION_STATUS = Object.freeze({
  APPROVED: "approved",
  PENDING: "pending",
  REJECTED: "rejected",
});

export const THIS_OR_THAT_QUESTION_STATUSES = Object.freeze(
  Object.values(THIS_OR_THAT_QUESTION_STATUS),
);

export const THIS_OR_THAT_ANSWER_CHOICE = Object.freeze({
  LEFT: "left",
  RIGHT: "right",
});

export const THIS_OR_THAT_ANSWER_CHOICES = Object.freeze(
  Object.values(THIS_OR_THAT_ANSWER_CHOICE),
);
