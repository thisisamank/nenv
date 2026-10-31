type Options = { challenge: string; rp?: { id?: string }; rpId?: string; user?: { id: string } };

const encoder = new TextEncoder();

export class TestAuthenticator {
  private keys!: CryptoKeyPair;
  private userHandle = "";
  private counter = 0;
  readonly credentialId = crypto.getRandomValues(new Uint8Array(16));

  async register(options: Options, origin: string) {
    this.keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
    this.userHandle = options.user!.id;

    const jwk = await crypto.subtle.exportKey("jwk", this.keys.publicKey);
    const coseKey = cbor(
      new Map<number, unknown>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, fromBase64Url(jwk.x!)],
        [-3, fromBase64Url(jwk.y!)],
      ]),
    );
    const authData = concat(
      await sha256(options.rp!.id!),
      [0x45],
      uint32(this.counter),
      new Uint8Array(16),
      [0, this.credentialId.length],
      this.credentialId,
      coseKey,
    );
    const attestationObject = cbor(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]]));

    return {
      id: toBase64Url(this.credentialId),
      rawId: toBase64Url(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON: clientData("webauthn.create", options.challenge, origin),
        attestationObject: toBase64Url(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
    };
  }

  async assert(options: Options, origin: string) {
    this.counter += 1;
    const authData = concat(await sha256(options.rpId!), [0x05], uint32(this.counter));
    const clientDataJSON = clientData("webauthn.get", options.challenge, origin);
    const signed = concat(authData, new Uint8Array(await crypto.subtle.digest("SHA-256", fromBase64Url(clientDataJSON))));
    const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.keys.privateKey, signed));

    return {
      id: toBase64Url(this.credentialId),
      rawId: toBase64Url(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON,
        authenticatorData: toBase64Url(authData),
        signature: toBase64Url(derSignature(raw)),
        userHandle: this.userHandle,
      },
      clientExtensionResults: {},
    };
  }
}

function clientData(type: string, challenge: string, origin: string): string {
  return toBase64Url(encoder.encode(JSON.stringify({ type, challenge, origin, crossOrigin: false })));
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

function uint32(value: number): number[] {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function concat(...parts: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(Array.from(part), offset);
    offset += part.length;
  }
  return out;
}

function derSignature(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const value = trimmed[0]! & 0x80 ? concat([0], trimmed) : trimmed;
    return concat([0x02, value.length], value);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat([0x30, body.length], body);
}

function cbor(value: unknown): Uint8Array {
  if (typeof value === "number") {
    return value >= 0 ? header(0, value) : header(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = encoder.encode(value);
    return concat(header(3, bytes.length), bytes);
  }
  if (value instanceof Uint8Array) {
    return concat(header(2, value.length), value);
  }
  if (value instanceof Map) {
    return concat(header(5, value.size), ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)]));
  }
  throw new Error("unsupported CBOR value");
}

function header(major: number, length: number): Uint8Array {
  if (length < 24) return new Uint8Array([(major << 5) | length]);
  if (length < 256) return new Uint8Array([(major << 5) | 24, length]);
  return new Uint8Array([(major << 5) | 25, length >> 8, length & 255]);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
}
