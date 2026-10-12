// Ошибка импорта/экспорта чертежа — .message уже готов для показа
// пользователю (на русском), не нужно оборачивать ещё раз в UI.
export class BlueprintFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlueprintFormatError'
  }
}
