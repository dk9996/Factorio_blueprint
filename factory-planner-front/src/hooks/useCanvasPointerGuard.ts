import { useEffect } from 'react'
import type { RefObject } from 'react'

// Защита холста от выделения текста и "потери" мыши за пределами окна.
//
// Пока ЛКМ/ПКМ/СКМ зажата на холсте (перетаскивание сущностей, рамка,
// рисование плиток, протяжка линии, панорамирование — все они живут на
// window-листенерах mousemove/mouseup):
//  * mousedown на холсте получает preventDefault — браузер не начинает
//    выделение текста и не тащит картинки. Именно mousedown, а НЕ
//    pointerdown: отмена pointerdown подавляет совместимые mouse-события
//    (mousedown/mousemove/mouseup), на которых построено всё остальное.
//    Поля ввода (input/textarea/select/contenteditable) и .selectable не
//    трогаем; фокус с поля ввода при клике на холст снимается вручную
//    (preventDefault иначе оставил бы его).
//  * pointerdown захватывает указатель на холсте (setPointerCapture), так
//    что pointermove/pointerup идут на холст и при выходе мыши за окно;
//    pointerup/pointercancel/lostpointercapture освобождают захват.
//  * на время жеста на document блокируется selectstart.
//  * если жест оборвался без mouseup (потеря фокуса окна, pointercancel) —
//    на window синтетически отправляется mouseup, чтобы действие
//    корректно завершилось (commit перетаскивания/рамки/штриха), а не
//    "залипло".
const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], .selectable'

function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(EDITABLE)
}

export function useCanvasPointerGuard(wrapRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    let activePointer: number | null = null
    let last = { x: 0, y: 0, button: 0 }

    const blockSelect = (e: Event) => e.preventDefault()

    function inCanvasArea(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false
      // сами окна/панели (внутри дерева холста) — не область холста
      return target === wrap || !!target.closest('.canvas-viewport') || target.classList.contains('tile-layer')
    }

    function endGesture() {
      if (activePointer === null) return
      try {
        wrap!.releasePointerCapture(activePointer)
      } catch {
        // захват уже снят браузером
      }
      activePointer = null
      // selectstart снимаем чуть позже — после compat mouseup
      setTimeout(() => {
        if (activePointer === null) document.removeEventListener('selectstart', blockSelect, true)
      }, 0)
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'touch' || !inCanvasArea(e.target) || isEditable(e.target)) return
      activePointer = e.pointerId
      last = { x: e.clientX, y: e.clientY, button: e.button }
      document.addEventListener('selectstart', blockSelect, true)
      try {
        wrap!.setPointerCapture(e.pointerId)
      } catch {
        // указатель уже неактивен
      }
    }

    function onMouseDown(e: MouseEvent) {
      if (!inCanvasArea(e.target) || isEditable(e.target)) return
      e.preventDefault()
      const active = document.activeElement
      if (active instanceof HTMLElement && active !== document.body && active.matches('input, textarea, select, [contenteditable]')) {
        active.blur()
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (e.pointerId === activePointer) last = { x: e.clientX, y: e.clientY, button: last.button }
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerId === activePointer) endGesture()
    }

    // Жест оборвался без mouseup — завершаем его "как отпускание" в
    // последней известной точке.
    function abortGesture() {
      if (activePointer === null) return
      const { x, y, button } = last
      endGesture()
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, button }))
    }

    wrap.addEventListener('pointerdown', onPointerDown, true)
    wrap.addEventListener('mousedown', onMouseDown, true)
    wrap.addEventListener('pointermove', onPointerMove)
    wrap.addEventListener('pointerup', onPointerUp)
    wrap.addEventListener('pointercancel', abortGesture)
    wrap.addEventListener('lostpointercapture', (e) => {
      // lostpointercapture после обычного pointerup — штатно (activePointer
      // уже null); иначе жест оборван браузером
      if ((e as PointerEvent).pointerId === activePointer) abortGesture()
    })
    window.addEventListener('blur', abortGesture)
    return () => {
      wrap.removeEventListener('pointerdown', onPointerDown, true)
      wrap.removeEventListener('mousedown', onMouseDown, true)
      wrap.removeEventListener('pointermove', onPointerMove)
      wrap.removeEventListener('pointerup', onPointerUp)
      wrap.removeEventListener('pointercancel', abortGesture)
      window.removeEventListener('blur', abortGesture)
      document.removeEventListener('selectstart', blockSelect, true)
    }
  }, [wrapRef])
}
