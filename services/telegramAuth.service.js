import { parse, validate } from "@tma.js/init-data-node";

export const getTelegramUserFromInitData = (initData, botToken) => {
  validate(initData, botToken);
  return parse(initData).user;
};
