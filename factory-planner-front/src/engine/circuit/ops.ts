import type { Comparator } from '../../lib/circuit/types.ts'

// Арифметика int32 арифметического комбинатора.
// Правила, подтверждённые вики Factorio: деление усекает к нулю; знак
// остатка — как у делимого; сдвиг вправо арифметический (знак сохраняется);
// int32 оборачивается. НЕ описано в вики и принято здесь: деление и остаток
// на 0 дают 0; степень с отрицательным показателем — 0 (кроме основания ±1),
// 0^0 = 1; величина сдвига берётся по маске & 31.
export type ArithOp = '+' | '-' | '*' | '/' | '%' | '^' | '<<' | '>>' | 'AND' | 'OR' | 'XOR'

function powInt32(base: number, exp: number): number {
  if (exp === 0) return 1
  if (exp < 0) {
    if (base === 1) return 1
    if (base === -1) return exp & 1 ? -1 : 1
    return 0
  }
  let result = 1
  let b = base | 0
  let e = exp >>> 0
  while (e > 0) {
    if (e & 1) result = Math.imul(result, b)
    b = Math.imul(b, b)
    e >>>= 1
  }
  return result
}

export function arith(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return (a + b) | 0
    case '-': return (a - b) | 0
    case '*': return Math.imul(a, b)
    case '/': return b === 0 ? 0 : (a / b) | 0
    case '%': return b === 0 ? 0 : (a % b) | 0
    case '^': return powInt32(a, b)
    case '<<': return a << (b & 31)
    case '>>': return a >> (b & 31)
    case 'AND': return a & b
    case 'OR': return a | b
    case 'XOR': return a ^ b
    default: return 0
  }
}

export function compare(op: Comparator | string | undefined, a: number, b: number): boolean {
  switch (op) {
    case '>': return a > b
    case '<': return a < b
    case '>=': case '≥': return a >= b
    case '<=': case '≤': return a <= b
    case '!=': case '≠': return a !== b
    case '=': default: return a === b
  }
}
