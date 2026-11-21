// Efeitos próprios dos discos do 7v7 (visão de cima): o disco não tem corpo, então a "pose" é feita só de deslocamento curto,
// esticada/amassada ao longo de um eixo (direção do chute, da bola ou do movimento), brilho e anéis de impacto.
export type PoseKind = 'wind' | 'pass' | 'shot' | 'touch' | 'save';
export const POSE_MS: Record<PoseKind, number> = { wind: 150, pass: 240, shot: 300, touch: 320, save: 380 };
export type Pose = { dx: number; sa: number; sp: number; glow: number };

const bump = (p: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
// dx: deslocamento ao longo do eixo (px); sa/sp: escala ao longo e através do eixo; glow: brilho do impacto (0 a 1)
export function poseOf(kind: PoseKind, age: number, pow: number): Pose | null {
  const p = age / POSE_MS[kind];
  if (p >= 1) return null;
  switch (kind) {
    // Preparação do chute: o disco recua e se comprime (ainda com a bola parada)
    case 'wind': return { dx: -5 * pow * Math.min(1, p * 1.4), sa: 1 - 0.1 * pow * p, sp: 1 + 0.06 * pow * p, glow: 0 };
    // Passe: recuo curto e avanço no contato
    case 'pass': return { dx: (p < 0.25 ? -1.5 * (p / 0.25) : 4 * pow * bump((p - 0.25) / 0.75)), sa: 1 + 0.1 * pow * bump(p), sp: 1 - 0.05 * pow * bump(p), glow: 0 };
    // Chute: avanço forte, esticada e clarão no contato
    case 'shot': return { dx: 7 * pow * bump(p * 1.2), sa: 1 + 0.2 * pow * bump(p), sp: 1 - 0.1 * pow * bump(p), glow: Math.max(0, 1 - p * 3) * Math.min(1, pow) };
    // Domínio: o disco amortece a bola (comprime no eixo da bola e cede um pouco)
    case 'touch': return { dx: 3 * pow * bump(p), sa: 1 - 0.12 * pow * bump(p), sp: 1 + 0.08 * pow * bump(p), glow: 0 };
    // Defesa do goleiro: impacto forte
    default: return { dx: 6 * pow * bump(p), sa: 1 - 0.18 * pow * bump(p), sp: 1 + 0.12 * pow * bump(p), glow: Math.max(0, 1 - p * 2.5) };
  }
}

// transform SVG com eixo: translada ao longo do eixo e escala ao longo/através dele sem girar o desenho (a letra do disco não gira)
export function axisTransform(x: number, y: number, ang: number, dx: number, sa: number, sp: number): string {
  const deg = (ang * 180) / Math.PI;
  return `translate(${(x + Math.cos(ang) * dx).toFixed(1)} ${(y + Math.sin(ang) * dx).toFixed(1)}) rotate(${deg.toFixed(0)}) scale(${sa.toFixed(3)} ${sp.toFixed(3)}) rotate(${(-deg).toFixed(0)})`;
}

// Anéis e clarões de impacto (pool pequeno e reaproveitado)
export type Ring = { on: boolean; born: number; x: number; y: number; r0: number; r1: number; dur: number; color: string; flash: boolean };
export const newRing = (): Ring => ({ on: false, born: 0, x: 0, y: 0, r0: 12, r1: 30, dur: 380, color: '#fff', flash: false });
