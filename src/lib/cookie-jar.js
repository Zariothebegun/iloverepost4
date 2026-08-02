export class SimpleCookieJar {
  constructor(initial = {}) {
    this.cookies = new Map(Object.entries(initial));
  }

  addSetCookieHeaders(setCookieHeaders = []) {
    for (const header of setCookieHeaders) {
      if (!header) continue;

      const [cookiePair] = header.split(";", 1);
      const separatorIndex = cookiePair.indexOf("=");

      if (separatorIndex === -1) continue;

      const name = cookiePair.slice(0, separatorIndex).trim();
      const value = cookiePair.slice(separatorIndex + 1).trim();

      if (!name) continue;
      this.cookies.set(name, value);
    }
  }

  get(name) {
    return this.cookies.get(name);
  }

  toHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}
