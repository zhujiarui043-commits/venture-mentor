declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TAVILY_API_KEY?: string;
    DEEPSEEK_API_KEY?: string;
    SESSION_SECRET?: string;
    TEST_ACCESS_CODES?: string;
  }
}
