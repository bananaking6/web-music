// API base URLs — swap proxy when not on localhost
export const PROXY =
  location.hostname === "localhost" ? "" : "https://api.codetabs.com/v1/proxy/?quest=";

export const API = PROXY + "https://api.monochrome.tf";
export const IMG = PROXY + "https://resources.tidal.com/images/";
