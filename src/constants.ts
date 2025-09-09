export const DEFAULT_HTTP_TIMEOUT = 30000;
export const SHORT_DELAY_MS = 100;
export const EVALUATION_TIMEOUT_MS = 1000;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export const COMMON_HEADERS = {
  "User-Agent": DEFAULT_USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://www.google.com/",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Ch-Ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-User": "?1",
  Connection: "keep-alive",
};

export const MAX_REDIRECTS = 5;

// Regex
export const REGEX_TITLE_TAG = /<title[^>]*>([^<]+)<\/title>/i;
export const REGEX_SIMPLE_HTML_TITLE_FALLBACK = /<html>([^<]+)<\/html>/;
export const REGEX_SANITIZE_HTML_TAGS = /<\/?html>/g;
export const REGEX_CHALLENGE_PAGE_KEYWORDS =
  /cloudflare|checking your browser|please wait|verification|captcha|attention required/i;

// PlaywrightEngine specific delays (could be in their own file or here if broadly referenced)
export const HUMAN_SIMULATION_MIN_DELAY_MS = 150;
export const HUMAN_SIMULATION_RANDOM_MOUSE_DELAY_MS = 200;
export const HUMAN_SIMULATION_SCROLL_DELAY_MS = 200;
export const HUMAN_SIMULATION_RANDOM_SCROLL_DELAY_MS = 300;
