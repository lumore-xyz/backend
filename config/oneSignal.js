import * as OneSignal from "@onesignal/node-onesignal";

export const ONESIGNAL_APP_ID = String(process.env.ONESIGNAL_APP_ID || "").trim();
const ONESIGNAL_API_KEY = String(process.env.ONESIGNAL_API_KEY || "").trim();

export const oneSignalClient =
  ONESIGNAL_APP_ID && ONESIGNAL_API_KEY
    ? new OneSignal.DefaultApi(
        OneSignal.createConfiguration({ restApiKey: ONESIGNAL_API_KEY }),
      )
    : null;
