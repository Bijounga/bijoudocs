let uidCounter = 1
export function uid() {
  return 'id' + uidCounter++ + Math.random().toString(36).slice(2, 6)
}
