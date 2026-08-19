// Public DocSearch credentials embedded in excaliburjs.com (search-only key).
export const ALGOLIA = {
  appId: "IVI5ONIKWP",
  apiKey: "b6bd39e31669ade42444bfb948e9cff9",
  indexName: "excaliburjs",
};
export const ALGOLIA_ENDPOINT = `https://${ALGOLIA.appId}-dsn.algolia.net/1/indexes/${ALGOLIA.indexName}/query`;

export const SITE_URL = "https://excaliburjs.com";
export const DOCS_URL = `${SITE_URL}/docs`;
export const API_URL = `${SITE_URL}/api`;

// Docs source of truth: the main Excalibur repo, site/docs/**
export const GITHUB_REPO = "excaliburjs/Excalibur";
export const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}`;
export const GITHUB_RAW = `https://raw.githubusercontent.com/${GITHUB_REPO}`;
export const DOCS_DIR_IN_REPO = "site/docs/";
export const DEFAULT_REF = "main";

export const CACHE_DIR_NAME = ".excalibur";
export const TREE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
export const FETCH_TIMEOUT_MS = 8000;
export const FETCH_CONCURRENCY = 8;
export const DEFAULT_LIMIT = 10;
