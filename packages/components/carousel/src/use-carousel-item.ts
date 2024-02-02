import {
  getCurrentInstance,
  inject,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  unref,
} from 'vue'
import { debugWarn, isUndefined } from '@element-plus/utils'
import { carouselContextKey } from './constants'

import type { CarouselItemProps } from './carousel-item'

export const useCarouselItem = (
  props: CarouselItemProps,
  componentName: string
) => {
  const carouselContext = inject(carouselContextKey)! //在carousel组件中传了东西，在这里拿到。
  // instance 拿当前组件实例 item
  const instance = getCurrentInstance()!
  if (!carouselContext) {
    debugWarn(
      componentName,
      'usage: <el-carousel></el-carousel-item></el-carousel>'
    )
  }

  if (!instance) {
    debugWarn(
      componentName,
      'compositional hook can only be invoked inside setups'
    )
  }

  const CARD_SCALE = 0.83

  const carouselItemRef = ref<HTMLElement>()
  const hover = ref(false)
  const translate = ref(0)
  const scale = ref(1)
  const active = ref(false) //当前item是否是活跃状态
  const ready = ref(false)
  const inStage = ref(false)
  const animating = ref(false) // 当前item是否是动的 （当前活跃/旧活跃）

  // computed
  const { isCardType, isVertical } = carouselContext

  // methods

  // TODO: 用于在启用循环轮播时，根据当前激活项和目标索引计算实际应用的索引
  function processIndex(index: number, activeIndex: number, length: number) {
    const lastItemIndex = length - 1
    const prevItemIndex = activeIndex - 1
    const nextItemIndex = activeIndex + 1
    const halfItemIndex = length / 2

    if (activeIndex === 0 && index === lastItemIndex) {
      return -1
    } else if (activeIndex === lastItemIndex && index === 0) {
      return length
    } else if (index < prevItemIndex && activeIndex - index >= halfItemIndex) {
      return length + 1
    } else if (index > nextItemIndex && index - activeIndex >= halfItemIndex) {
      return -2
    }
    return index
  }

  function calcCardTranslate(index: number, activeIndex: number) {
    debugger
    const parentWidth = unref(isVertical)
      ? carouselContext.root.value?.offsetHeight || 0
      : carouselContext.root.value?.offsetWidth || 0

    if (inStage.value) {
      return (parentWidth * ((2 - CARD_SCALE) * (index - activeIndex) + 1)) / 4
    } else if (index < activeIndex) {
      return (-(1 + CARD_SCALE) * parentWidth) / 4
    } else {
      return ((3 + CARD_SCALE) * parentWidth) / 4
    }
  }

  // ✅
  function calcTranslate(
    index: number,
    activeIndex: number,
    isVertical: boolean
  ) {
    const rootEl = carouselContext.root.value
    if (!rootEl) return 0

    const distance =
      (isVertical ? rootEl.offsetHeight : rootEl.offsetWidth) || 0
    return distance * (index - activeIndex)
  }

  // ✅ 计算item在轮播中的位置和状态
  const translateItem = (
    index: number,
    activeIndex: number,
    oldIndex?: number
  ) => {
    const _isCardType = unref(isCardType)
    const carouselItemLength = carouselContext.items.value.length ?? Number.NaN

    const isActive = index === activeIndex // 当前item是否处于活跃状态
    if (!_isCardType && !isUndefined(oldIndex)) {
      // 如果不是卡片类型 且oldIdex不为undefined时，。。。
      animating.value = isActive || index === oldIndex // 只有 当前活跃/旧活跃 的 item animating才为true
    }

    if (!isActive && carouselItemLength > 2 && carouselContext.loop) {
      index = processIndex(index, activeIndex, carouselItemLength)
    }

    const _isVertical = unref(isVertical)
    active.value = isActive

    if (_isCardType) {
      inStage.value = Math.round(Math.abs(index - activeIndex)) <= 1
      translate.value = calcCardTranslate(index, activeIndex)
      scale.value = unref(active) ? 1 : CARD_SCALE
    } else {
      // 计算tranlate值
      translate.value = calcTranslate(index, activeIndex, _isVertical)
    }

    ready.value = true

    // 如果当前item是激活项且 carouselItemRef.value 存在，
    // 则设置轮播容器的高度为当前轮播项的高度。
    if (isActive && carouselItemRef.value) {
      carouselContext.setContainerHeight(carouselItemRef.value.offsetHeight)
    }
  }

  function handleItemClick() {
    debugger
    if (carouselContext && unref(isCardType)) {
      const index = carouselContext.items.value.findIndex(
        ({ uid }) => uid === instance.uid
      )
      carouselContext.setActiveItem(index)
    }
  }

  // lifecycle
  // TODO: 这里的states为什么要用reactive包一下？
  onMounted(() => {
    carouselContext.addItem({
      props,
      states: reactive({
        hover,
        translate,
        scale,
        active,
        ready,
        inStage,
        animating,
      }),
      uid: instance.uid,
      translateItem,
    })
  })

  onUnmounted(() => {
    carouselContext.removeItem(instance.uid)
  })

  return {
    carouselItemRef,
    active,
    animating,
    hover,
    inStage,
    isVertical,
    translate,
    isCardType,
    scale,
    ready,
    handleItemClick,
  }
}
