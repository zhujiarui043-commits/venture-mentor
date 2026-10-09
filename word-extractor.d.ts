declare module "word-extractor" {
  import type { Buffer } from "node:buffer";
  export default class WordExtractor {
    extract(input: Buffer): Promise<{ getBody(): string }>;
  }
}
