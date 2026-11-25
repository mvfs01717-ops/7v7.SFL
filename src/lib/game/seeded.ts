// Sorteio determinístico por lance: a mesma chave dá a mesma sequência em qualquer cliente.
// Usado para que o convidado chegue ao mesmo resultado do anfitrião sem rolar dados próprios.
// Não usar para visual: visual pode seguir com Math.random.

// FNV-1a de 32 bits sobre a chave (mesma família de restartRoll).
export function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: gerador pequeno, rápido e com boa distribuição para jogo.
export function seededRng(key: string): () => number {
  let s = hashKey(key);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uma rolagem só, pela chave. Use quando o lance precisa de um único número.
export function seededRoll(key: string): number {
  return seededRng(key)();
}
